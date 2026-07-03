"""Purchase-order lifecycle: numbering, confirm, receive, cancel.

Receiving is the only path that turns ordered quantities into stock: every
receipt goes through ``LedgerService.transfer_stock`` (ledger semantics
unchanged) from the company's VENDOR counterparty location into a real
location, stamped with supplier, ``purchased_cost`` and the PO line it evades.
``PurchaseOrderLine.quantity_received`` is denormalized and only mutated here,
under ``select_for_update`` so concurrent receipts cannot exceed the order.
"""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from core.models import Company
from .. import constants
from ..exceptions import InventoryError
from ..models import Location, PurchaseOrder, PurchaseOrderLine
from ..models.purchasing import (
    PO_STATUS_CANCELLED,
    PO_STATUS_CONFIRMED,
    PO_STATUS_DRAFT,
    PO_STATUS_PARTIALLY_RECEIVED,
    PO_STATUS_RECEIVED,
)
from .counterparty import CounterpartyService
from .ledger import LedgerService

RECEIVABLE_STATUSES = (PO_STATUS_CONFIRMED, PO_STATUS_PARTIALLY_RECEIVED)


class PurchasingService:
    # ── Numbering ────────────────────────────────────────────────────

    @staticmethod
    def next_number(company) -> str:
        """Next sequential ``PO-{year}-{progressive:04d}`` for the company.

        Must be called inside ``transaction.atomic``: it locks the Company row
        so concurrent creations for the same company serialize here and cannot
        race on the progressive (the (company, number) unique constraint is
        the backstop).
        """
        Company.objects.select_for_update().get(pk=company.pk)
        year = timezone.now().year
        prefix = f"PO-{year}-"
        last = (
            PurchaseOrder.objects.filter(company=company, number__startswith=prefix)
            .order_by("-number")
            .values_list("number", flat=True)
            .first()
        )
        progressive = 1
        if last:
            try:
                progressive = int(last.rsplit("-", 1)[1]) + 1
            except (ValueError, IndexError):
                progressive = (
                    PurchaseOrder.objects.filter(
                        company=company,
                        number__startswith=prefix,
                    ).count()
                    + 1
                )
        return f"{prefix}{progressive:04d}"

    # ── Lifecycle ────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def confirm(po: PurchaseOrder) -> PurchaseOrder:
        """DRAFT → CONFIRMED. Requires at least one line (lines validate > 0)."""
        po = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
        if po.status != PO_STATUS_DRAFT:
            raise InventoryError(
                detail=f"Only DRAFT orders can be confirmed (current: {po.status})."
            )
        if not po.lines.exists():
            raise InventoryError(detail="Cannot confirm an order without lines.")
        po.status = PO_STATUS_CONFIRMED
        po.save(update_fields=["status", "updated_at"])
        return po

    @staticmethod
    @transaction.atomic
    def cancel(po: PurchaseOrder) -> PurchaseOrder:
        """DRAFT/CONFIRMED → CANCELLED, only when nothing has been received."""
        po = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
        if po.status not in (PO_STATUS_DRAFT, PO_STATUS_CONFIRMED):
            raise InventoryError(
                detail=f"Only DRAFT or CONFIRMED orders can be cancelled (current: {po.status})."
            )
        if po.lines.filter(quantity_received__gt=0).exists():
            raise InventoryError(detail="Cannot cancel an order with received goods.")
        po.status = PO_STATUS_CANCELLED
        po.save(update_fields=["status", "updated_at"])
        return po

    # ── Receiving ────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def receive(po: PurchaseOrder, receipts, location: Location, user, allow_over=False):
        """Receive goods against PO lines, generating inbound Movements.

        ``receipts`` is a list of dicts::

            {line_id, quantity, batch_data?, serials?, expiry_date?}

        - quantity must not exceed the line's residual unless ``allow_over``;
        - BATCH/PERISHABLE lines forward ``batch_data`` (+ optional
          ``expiry_date``) to the ledger;
        - SERIALIZED lines require ``serials`` (one per unit) and reuse the
          orchestrator's PhysicalProduct creation path, one Movement each.

        Returns the list of created Movements. Atomic: any failure rolls the
        whole receipt back.
        """
        from ..orchestrators import (
            InventoryOrchestrator,
        )  # inline import: breaks the services↔orchestrators import cycle (orchestrators imports services)

        po = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
        if po.status not in RECEIVABLE_STATUSES:
            raise InventoryError(
                detail=f"Order {po.number} is not receivable (status: {po.status})."
            )
        if not receipts:
            raise InventoryError(detail="At least one receipt line is required.")
        if location is None or location.company_id != po.company_id:
            raise InventoryError(
                detail="A destination location of the order's company is required."
            )
        if location.type == constants.LOCATION_TYPE_VIRTUAL:
            raise InventoryError(detail="Goods must be received into a real location.")

        vendor = CounterpartyService.resolve(po.company, constants.COUNTERPARTY_VENDOR)
        reason = f"PO {po.number}"
        movements = []

        for receipt in receipts:
            line_id = receipt.get("line_id")
            try:
                line = PurchaseOrderLine.objects.select_for_update().get(
                    id=line_id,
                    purchase_order=po,
                )
            except (PurchaseOrderLine.DoesNotExist, ValueError, TypeError):
                raise InventoryError(detail=f"Order line {line_id} not found on {po.number}.")

            try:
                quantity = Decimal(str(receipt.get("quantity")))
            except (InvalidOperation, TypeError):
                raise InventoryError(detail="Receipt quantity must be a number.")
            if quantity <= 0:
                raise InventoryError(detail="Receipt quantity must be positive.")

            residual = line.quantity_ordered - line.quantity_received
            if quantity > residual and not allow_over:
                raise InventoryError(
                    detail=(
                        f"Receipt of {quantity} exceeds the remaining {residual} "
                        f"for {line.product_model.sku} on {po.number}."
                    )
                )

            product = line.product_model

            if product.tracking_mode == "INDIVIDUAL":
                serials = receipt.get("serials") or []
                # Serialized units are indivisible: quantity must be whole, and
                # there must be exactly one serial per unit.
                if quantity != quantity.to_integral_value():
                    raise InventoryError(
                        detail="Serialized receipt quantity must be a whole number."
                    )
                if len(serials) != int(quantity):
                    raise InventoryError(
                        detail=(
                            f"Serialized receipt needs one serial per unit: "
                            f"got {len(serials)} serials for quantity {quantity}."
                        )
                    )
                for serial in serials:
                    physical_product = InventoryOrchestrator.resolve_or_create_item(
                        product,
                        serial,
                        vendor,
                        inbound=True,
                    )
                    movements.append(
                        LedgerService.transfer_stock(
                            product_model=product,
                            from_location=vendor,
                            to_location=location,
                            quantity=Decimal("1"),
                            user=user,
                            reason=reason,
                            physical_product=physical_product,
                            supplier=po.supplier,
                            source_document="PURCHASE",
                            purchase_order_line=line,
                        )
                    )
            else:
                batch_data = receipt.get("batch_data")
                expiry_date = receipt.get("expiry_date")
                if expiry_date:
                    batch_data = {**(batch_data or {}), "expiry_date": expiry_date}
                movements.append(
                    LedgerService.transfer_stock(
                        product_model=product,
                        from_location=vendor,
                        to_location=location,
                        quantity=quantity,
                        user=user,
                        reason=reason,
                        batch_data=batch_data,
                        supplier=po.supplier,
                        source_document="PURCHASE",
                        purchase_order_line=line,
                    )
                )

            line.quantity_received += quantity
            line.save(update_fields=["quantity_received"])

        PurchasingService._refresh_status(po)
        return movements

    @staticmethod
    def _refresh_status(po: PurchaseOrder):
        """Recompute PO status from its lines (caller holds the PO lock)."""
        lines = list(po.lines.all())
        if lines and all(l.quantity_received >= l.quantity_ordered for l in lines):
            new_status = PO_STATUS_RECEIVED
        elif any(l.quantity_received > 0 for l in lines):
            new_status = PO_STATUS_PARTIALLY_RECEIVED
        else:
            new_status = po.status
        if new_status != po.status:
            po.status = new_status
            po.save(update_fields=["status", "updated_at"])
