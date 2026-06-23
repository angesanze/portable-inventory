"""Returns / RMA lifecycle (RMA-08): numbering, receive, resolve, cancel.

Every physical stock change goes through ``LedgerService.transfer_stock`` — the
ledger semantics are unchanged. The four shapes are:

* customer return receive: External(VENDOR-style customer counterparty) →
  Quarantena (goods land in the non-sellable quarantine area);
* RESTOCK: Quarantena → warehouse (item becomes sellable again; SERIALIZED
  reactivated RETURNED→ACTIVE);
* SCRAP: Quarantena → LOSS (CostingService books the loss as COGS);
* RETURN_TO_SUPPLIER: Quarantena → External vendor, stamped with the supplier;
* supplier return (direct): warehouse → External vendor.

COSTING-06: inbound RESTOCK re-weights the average and SCRAP/return outbound
freezes COGS — all handled automatically by CostingService inside the ledger.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.models import Company
from .. import constants
from ..exceptions import InventoryError
from ..models import (
    Location, PhysicalProduct, ReturnOrder, ReturnOrderLine,
)
from .counterparty import CounterpartyService
from .ledger import LedgerService


class RmaService:

    # ── Numbering ────────────────────────────────────────────────────

    @staticmethod
    def next_number(company) -> str:
        """Next sequential ``RMA-{year}-{progressive:04d}`` for the company.

        Must run inside ``transaction.atomic``: it locks the Company row so
        concurrent creations serialize and cannot race on the progressive (the
        (company, number) unique constraint is the backstop).
        """
        Company.objects.select_for_update().get(pk=company.pk)
        year = timezone.now().year
        prefix = f"RMA-{year}-"
        last = (
            ReturnOrder.objects
            .filter(company=company, number__startswith=prefix)
            .order_by('-number')
            .values_list('number', flat=True)
            .first()
        )
        progressive = 1
        if last:
            try:
                progressive = int(last.rsplit('-', 1)[1]) + 1
            except (ValueError, IndexError):
                progressive = ReturnOrder.objects.filter(
                    company=company, number__startswith=prefix,
                ).count() + 1
        return f"{prefix}{progressive:04d}"

    # ── Quarantine location ──────────────────────────────────────────

    @staticmethod
    def quarantine_location(company) -> Location:
        """Get-or-create the company's quarantine area.

        A real, WAREHOUSE-type location flagged ``is_sellable=False`` so the
        stock is physically tracked but excluded from available/sellable totals
        (StockService). Created lazily, mirroring CounterpartyService.
        """
        existing = Location.objects.filter(
            company=company, name=constants.DEFAULT_QUARANTINE_LOCATION_NAME,
        ).first()
        if existing:
            if existing.is_sellable:
                existing.is_sellable = False
                existing.save(update_fields=['is_sellable'])
            return existing
        return Location.objects.create(
            company=company,
            name=constants.DEFAULT_QUARANTINE_LOCATION_NAME,
            type=constants.LOCATION_TYPE_WAREHOUSE,
            is_sellable=False,
        )

    # ── Receive ──────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def receive(rma: ReturnOrder, user) -> ReturnOrder:
        """Receive a CUSTOMER_RETURN: External → Quarantena for every line.

        For SERIALIZED lines the returned item is reactivated (RETURNED→ACTIVE)
        via the orchestrator and parked in quarantine. OPEN → RECEIVED.
        Supplier returns never pass through quarantine — they ship directly via
        ``resolve_line`` semantics and are received as a no-op here.
        """
        from ..orchestrators import InventoryOrchestrator  # inline import: breaks the services↔orchestrators import cycle (orchestrators imports services)

        rma = ReturnOrder.objects.select_for_update().get(pk=rma.pk)
        if rma.kind != constants.RMA_KIND_CUSTOMER_RETURN:
            raise InventoryError(detail="Only customer returns are received into quarantine.")
        if rma.status != constants.RMA_STATUS_OPEN:
            raise InventoryError(detail=f"Return {rma.number} is not OPEN (status: {rma.status}).")
        lines = list(rma.lines.select_related('product_model').all())
        if not lines:
            raise InventoryError(detail="Cannot receive a return without lines.")

        external = CounterpartyService.resolve(rma.company, constants.COUNTERPARTY_CUSTOMER)
        quarantine = RmaService.quarantine_location(rma.company)
        reason = f"RMA {rma.number} receive"

        for line in lines:
            product = line.product_model
            if product.tracking_mode == 'INDIVIDUAL':
                pp = line.physical_product
                if pp is None:
                    raise InventoryError(
                        detail=f"Serialized return line for {product.sku} needs a physical_product."
                    )
                # Reactivate the dormant (RETURNED/…) item at the source so the
                # ledger can move it into quarantine as ACTIVE stock.
                pp = InventoryOrchestrator.resolve_or_create_item(
                    product, pp.identifier, external, inbound=True,
                )
                LedgerService.transfer_stock(
                    product_model=product,
                    from_location=external,
                    to_location=quarantine,
                    quantity=Decimal('1'),
                    user=user,
                    reason=reason,
                    physical_product=pp,
                    customer=rma.customer,
                )
            else:
                batch_data = None
                if product.tracking_mode == 'BATCH' and line.batch is not None:
                    batch_data = dict(line.batch.data or {})
                LedgerService.transfer_stock(
                    product_model=product,
                    from_location=external,
                    to_location=quarantine,
                    quantity=line.quantity,
                    user=user,
                    reason=reason,
                    batch_data=batch_data,
                    customer=rma.customer,
                )

        rma.status = constants.RMA_STATUS_RECEIVED
        rma.save(update_fields=['status', 'updated_at'])
        return rma

    # ── Resolve a line ───────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def resolve_line(line: ReturnOrderLine, resolution: str, user, *, location=None, supplier=None) -> ReturnOrderLine:
        """Resolve a received customer-return line with one of three outcomes.

        RESTOCK            → Quarantena → warehouse (item back to ACTIVE/sellable);
        SCRAP              → Quarantena → LOSS (COGS loss via CostingService);
        RETURN_TO_SUPPLIER → Quarantena → External vendor, stamped supplier.

        A line can be resolved exactly once. ``location`` is the destination
        warehouse for RESTOCK (defaults to the first sellable WAREHOUSE).
        ``supplier`` attributes the RETURN_TO_SUPPLIER outbound (a customer
        return carries no supplier of its own).
        """
        line = ReturnOrderLine.objects.select_for_update().select_related(
            'return_order', 'product_model',
        ).get(pk=line.pk)
        rma = line.return_order

        if rma.kind != constants.RMA_KIND_CUSTOMER_RETURN:
            raise InventoryError(detail="Only customer-return lines are resolved from quarantine.")
        if rma.status != constants.RMA_STATUS_RECEIVED:
            raise InventoryError(
                detail=f"Return {rma.number} must be RECEIVED to resolve lines (status: {rma.status})."
            )
        if line.resolution != constants.RMA_RESOLUTION_PENDING:
            raise InventoryError(detail="This line has already been resolved.")
        if resolution not in (
            constants.RMA_RESOLUTION_RESTOCK,
            constants.RMA_RESOLUTION_SCRAP,
            constants.RMA_RESOLUTION_RETURN_TO_SUPPLIER,
        ):
            raise InventoryError(detail=f"Invalid resolution '{resolution}'.")

        product = line.product_model
        quarantine = RmaService.quarantine_location(rma.company)
        pp = line.physical_product if product.tracking_mode == 'INDIVIDUAL' else None

        if resolution == constants.RMA_RESOLUTION_RESTOCK:
            dest = location or RmaService._default_warehouse(rma.company)
            if dest is None:
                raise InventoryError(detail="No sellable warehouse available to restock into.")
            if not dest.is_sellable:
                raise InventoryError(detail="Restock destination must be a sellable location.")
            RmaService._move(line, quarantine, dest, user, pp,
                             f"RMA {rma.number} restock", customer=rma.customer)
        elif resolution == constants.RMA_RESOLUTION_SCRAP:
            loss = RmaService._loss_location(rma.company)
            RmaService._move(line, quarantine, loss, user, pp,
                             f"RMA {rma.number} scrap")
        else:  # RETURN_TO_SUPPLIER
            vendor = CounterpartyService.resolve(rma.company, constants.COUNTERPARTY_VENDOR)
            attributed = supplier or rma.supplier
            if attributed is not None and attributed.company_id != rma.company_id:
                raise InventoryError(detail="supplier belongs to a different company.")
            RmaService._move(line, quarantine, vendor, user, pp,
                             f"RMA {rma.number} return to supplier", supplier=attributed)

        line.resolution = resolution
        line.resolved_at = timezone.now()
        line.save(update_fields=['resolution', 'resolved_at'])

        RmaService._refresh_status(rma)
        return line

    # ── Direct supplier return ───────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def ship_supplier_return(rma: ReturnOrder, user, *, location=None) -> ReturnOrder:
        """Ship a SUPPLIER_RETURN: warehouse → External vendor for every line.

        Goods already on hand (never quarantined) go straight back to the
        supplier. OPEN → RESOLVED.
        """
        rma = ReturnOrder.objects.select_for_update().get(pk=rma.pk)
        if rma.kind != constants.RMA_KIND_SUPPLIER_RETURN:
            raise InventoryError(detail="Only supplier returns are shipped to the vendor.")
        if rma.status != constants.RMA_STATUS_OPEN:
            raise InventoryError(detail=f"Return {rma.number} is not OPEN (status: {rma.status}).")
        lines = list(rma.lines.select_related('product_model').all())
        if not lines:
            raise InventoryError(detail="Cannot ship a return without lines.")

        vendor = CounterpartyService.resolve(rma.company, constants.COUNTERPARTY_VENDOR)
        source = location or RmaService._default_warehouse(rma.company)
        if source is None:
            raise InventoryError(detail="No warehouse available to ship the return from.")
        reason = f"RMA {rma.number} supplier return"

        for line in lines:
            product = line.product_model
            pp = line.physical_product if product.tracking_mode == 'INDIVIDUAL' else None
            from_loc = pp.location if pp is not None and pp.location_id else source
            RmaService._move(line, from_loc, vendor, user, pp, reason, supplier=rma.supplier)
            line.resolution = constants.RMA_RESOLUTION_RETURN_TO_SUPPLIER
            line.resolved_at = timezone.now()
            line.save(update_fields=['resolution', 'resolved_at'])

        rma.status = constants.RMA_STATUS_RESOLVED
        rma.save(update_fields=['status', 'updated_at'])
        return rma

    # ── Cancel ───────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def cancel(rma: ReturnOrder) -> ReturnOrder:
        """Cancel a return while still OPEN (nothing received/shipped)."""
        rma = ReturnOrder.objects.select_for_update().get(pk=rma.pk)
        if rma.status != constants.RMA_STATUS_OPEN:
            raise InventoryError(detail=f"Only OPEN returns can be cancelled (status: {rma.status}).")
        rma.status = constants.RMA_STATUS_CANCELLED
        rma.save(update_fields=['status', 'updated_at'])
        return rma

    # ── Helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _move(line, from_loc, to_loc, user, pp, reason, *, supplier=None, customer=None):
        kwargs = {}
        product = line.product_model
        if pp is not None:
            kwargs['physical_product'] = pp
        if product.tracking_mode == 'BATCH' and line.batch is not None:
            kwargs['batch_data'] = dict(line.batch.data or {})
        return LedgerService.transfer_stock(
            product_model=product,
            from_location=from_loc,
            to_location=to_loc,
            quantity=line.quantity if pp is None else Decimal('1'),
            user=user,
            reason=reason,
            supplier=supplier,
            customer=customer,
            **kwargs,
        )

    @staticmethod
    def _default_warehouse(company):
        return Location.objects.filter(
            company=company, type=constants.LOCATION_TYPE_WAREHOUSE, is_sellable=True,
        ).order_by('name').first()

    @staticmethod
    def _loss_location(company):
        return CounterpartyService.resolve_loss(company)

    @staticmethod
    def _refresh_status(rma: ReturnOrder):
        """RECEIVED → RESOLVED once every line is resolved (caller holds lock)."""
        lines = list(rma.lines.all())
        if lines and all(l.resolution != constants.RMA_RESOLUTION_PENDING for l in lines):
            if rma.status != constants.RMA_STATUS_RESOLVED:
                rma.status = constants.RMA_STATUS_RESOLVED
                rma.save(update_fields=['status', 'updated_at'])
