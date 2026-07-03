"""Sales-order lifecycle: numbering, confirm (reserve), pick list, ship, cancel.

Confirming a sales order reserves stock for every line through
``ReservationService.reserve`` (RESERVATIONS-01): all lines reserve atomically
or the confirm fails with a per-line availability report — no silent partial
confirmation. Shipping fulfils those reservations: every shipment goes through
``LedgerService.transfer_stock`` (ledger semantics unchanged) from a real
location into the company's External customer counterparty, stamped with the
customer and the reservation it consumes. ``SalesOrderLine.quantity_shipped``
is denormalized and only mutated here, under ``select_for_update``.
"""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from core.models import Company
from .. import constants
from ..exceptions import InventoryError
from ..models import (
    Location,
    ProductBatch,
    PhysicalProduct,
    Reservation,
    SalesOrder,
    SalesOrderLine,
)
from ..models.sales import (
    SO_STATUS_CANCELLED,
    SO_STATUS_CONFIRMED,
    SO_STATUS_DRAFT,
    SO_STATUS_PARTIALLY_SHIPPED,
    SO_STATUS_PICKING,
    SO_STATUS_SHIPPED,
)
from .counterparty import CounterpartyService
from .ledger import LedgerService
from .reservations import ReservationService
from .stock import StockService

SHIPPABLE_STATUSES = (SO_STATUS_CONFIRMED, SO_STATUS_PICKING, SO_STATUS_PARTIALLY_SHIPPED)


class SalesService:
    # ── Numbering ────────────────────────────────────────────────────

    @staticmethod
    def next_number(company) -> str:
        """Next sequential ``SO-{year}-{progressive:04d}`` for the company.

        Must be called inside ``transaction.atomic``: it locks the Company row
        so concurrent creations for the same company serialize and cannot race
        on the progressive (the (company, number) unique constraint backstops).
        """
        Company.objects.select_for_update().get(pk=company.pk)
        year = timezone.now().year
        prefix = f"SO-{year}-"
        last = (
            SalesOrder.objects.filter(company=company, number__startswith=prefix)
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
                    SalesOrder.objects.filter(
                        company=company,
                        number__startswith=prefix,
                    ).count()
                    + 1
                )
        return f"{prefix}{progressive:04d}"

    # ── Confirm (reserve) ────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def confirm(so: SalesOrder, location: Location, allow_partial=False) -> SalesOrder:
        """DRAFT → CONFIRMED, reserving stock for every line at ``location``.

        All lines reserve or the whole confirm rolls back with an aggregated,
        per-line shortfall report (unless ``allow_partial`` — then each line
        reserves only what it can and lines with nothing available are skipped).
        """
        so = SalesOrder.objects.select_for_update().get(pk=so.pk)
        if so.status != SO_STATUS_DRAFT:
            raise InventoryError(
                detail=f"Only DRAFT orders can be confirmed (current: {so.status})."
            )
        lines = list(so.lines.select_related("product_model").all())
        if not lines:
            raise InventoryError(detail="Cannot confirm an order without lines.")
        if location is None or location.company_id != so.company_id:
            raise InventoryError(detail="A location of the order's company is required.")
        if location.type == constants.LOCATION_TYPE_VIRTUAL:
            raise InventoryError(detail="Stock must be reserved from a real location.")

        reference = f"SO {so.number}"
        shortfalls = []

        for line in lines:
            product = line.product_model
            needed = line.quantity_ordered

            if product.tracking_mode == "INDIVIDUAL":
                items = SalesService._available_serials(product, location)
                if not allow_partial and len(items) < needed:
                    shortfalls.append(f"{product.sku}: need {needed}, only {len(items)} available.")
                    continue
                take = items[: int(needed)]
                if not allow_partial and len(take) < needed:
                    shortfalls.append(f"{product.sku}: need {needed}, only {len(take)} available.")
                    continue
                for pp in take:
                    ReservationService.reserve(
                        product,
                        Decimal("1"),
                        so.created_by,
                        location=location,
                        physical_product=pp,
                        reference=reference,
                        sales_order_line=line,
                    )
            else:
                available = StockService.get_available_for_location(product, location)
                qty = needed if available >= needed else available
                if not allow_partial and available < needed:
                    shortfalls.append(f"{product.sku}: need {needed}, only {available} available.")
                    continue
                if qty <= 0:
                    continue
                ReservationService.reserve(
                    product,
                    qty,
                    so.created_by,
                    location=location,
                    reference=reference,
                    sales_order_line=line,
                )

        if shortfalls:
            raise InventoryError(
                detail="Cannot reserve stock for every line: " + " ".join(shortfalls)
            )

        so.status = SO_STATUS_CONFIRMED
        so.save(update_fields=["status", "updated_at"])
        return so

    @staticmethod
    def _available_serials(product, location):
        """ACTIVE PhysicalProducts at ``location`` with no ACTIVE reservation."""
        return list(
            PhysicalProduct.objects.filter(
                product_model=product,
                location=location,
                status="ACTIVE",
            )
            .exclude(
                reservations__status="ACTIVE",
            )
            .order_by("identifier")
        )

    # ── Pick list (read-only) ────────────────────────────────────────

    @staticmethod
    def pick_list(so: SalesOrder):
        """Per-line picking guidance: location, suggested batches (FEFO for
        PERISHABLE), and reserved serials. Read-only — no stock moves."""
        # Trust the persisted status, not a possibly-stale in-memory object.
        so.refresh_from_db(fields=["status"])
        lines = []
        for line in so.lines.select_related("product_model").all():
            product = line.product_model
            reservations = line.reservations.filter(status="ACTIVE")
            entry = {
                "line_id": str(line.id),
                "product_sku": product.sku,
                "product_name": product.name,
                "product_profile": product.profile,
                "quantity_ordered": line.quantity_ordered,
                "quantity_shipped": line.quantity_shipped,
                "quantity_pending": line.quantity_pending,
                "reserved": reservations.aggregate(t=Sum("quantity"))["t"] or Decimal("0"),
                "serials": [],
                "batches": [],
            }
            if product.tracking_mode == "INDIVIDUAL":
                entry["serials"] = [
                    {
                        "id": str(r.physical_product_id),
                        "identifier": r.physical_product.identifier,
                        "location": r.location.name if r.location else None,
                    }
                    for r in reservations.select_related("physical_product", "location")
                    if r.physical_product_id
                ]
            elif product.tracking_mode == "BATCH":
                # Suggest batches in the reservation's location(s). FEFO for
                # PERISHABLE: soonest expiry_date (in JSON) first.
                locations = {r.location_id for r in reservations if r.location_id}
                batch_qs = ProductBatch.objects.filter(
                    product_model=product,
                    quantity__gt=0,
                )
                if locations:
                    batch_qs = batch_qs.filter(location_id__in=locations)
                batches = list(batch_qs.select_related("location"))
                if product.profile == "PERISHABLE":
                    batches.sort(key=lambda b: (b.data or {}).get("expiry_date") or "9999-12-31")
                entry["batches"] = [
                    {
                        "id": str(b.id),
                        "batch_identifier": b.batch_identifier,
                        "quantity": b.quantity,
                        "location": b.location.name if b.location else None,
                        "expiry_date": (b.data or {}).get("expiry_date"),
                    }
                    for b in batches
                ]
            lines.append(entry)
        # CONFIRMED → PICKING once a pick list is pulled (idempotent best-effort).
        if so.status == SO_STATUS_CONFIRMED:
            SalesOrder.objects.filter(pk=so.pk, status=SO_STATUS_CONFIRMED).update(
                status=SO_STATUS_PICKING
            )
            so.status = SO_STATUS_PICKING
        return {"number": so.number, "status": so.status, "lines": lines}

    # ── Ship ─────────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def ship(so: SalesOrder, shipments, user):
        """Ship goods against SO lines, fulfilling reservations.

        ``shipments`` is a list of dicts::

            {line_id, quantity, batch_id?, serials?}

        Each shipment consumes the line's ACTIVE reservation(s) and creates the
        outbound Movement(s) to the External customer location. Partial ships
        split the reservation: the consumed amount is fulfilled, the remainder
        is re-reserved against the same line. Returns the created Movements.
        """
        so = SalesOrder.objects.select_for_update().get(pk=so.pk)
        if so.status not in SHIPPABLE_STATUSES:
            raise InventoryError(
                detail=f"Order {so.number} is not shippable (status: {so.status})."
            )
        if not shipments:
            raise InventoryError(detail="At least one shipment line is required.")

        external = CounterpartyService.resolve(so.company, constants.COUNTERPARTY_CUSTOMER)
        reason = f"SO {so.number}"
        movements = []

        for shipment in shipments:
            line_id = shipment.get("line_id")
            try:
                line = (
                    SalesOrderLine.objects.select_for_update()
                    .select_related("product_model")
                    .get(id=line_id, sales_order=so)
                )
            except (SalesOrderLine.DoesNotExist, ValueError, TypeError):
                raise InventoryError(detail=f"Order line {line_id} not found on {so.number}.")

            try:
                quantity = Decimal(str(shipment.get("quantity")))
            except (InvalidOperation, TypeError):
                raise InventoryError(detail="Shipment quantity must be a number.")
            if quantity <= 0:
                raise InventoryError(detail="Shipment quantity must be positive.")

            residual = line.quantity_ordered - line.quantity_shipped
            if quantity > residual:
                raise InventoryError(
                    detail=(
                        f"Shipment of {quantity} exceeds the remaining {residual} "
                        f"for {line.product_model.sku} on {so.number}."
                    )
                )

            product = line.product_model
            if product.tracking_mode == "INDIVIDUAL":
                movements.extend(
                    SalesService._ship_serialized(line, shipment, quantity, external, reason, user)
                )
            else:
                movements.extend(
                    SalesService._ship_bulk_or_batch(
                        line, shipment, quantity, external, reason, user
                    )
                )

            line.quantity_shipped += quantity
            line.save(update_fields=["quantity_shipped"])

        SalesService._refresh_status(so)
        return movements

    @staticmethod
    def _ship_serialized(line, shipment, quantity, external, reason, user):
        product = line.product_model
        serials = shipment.get("serials") or []
        reservations = list(
            line.reservations.filter(
                status="ACTIVE",
                physical_product__isnull=False,
            ).select_related("physical_product")
        )

        if serials:
            by_identifier = {r.physical_product.identifier: r for r in reservations}
            chosen = []
            for s in serials:
                r = by_identifier.get(s)
                if r is None:
                    raise InventoryError(
                        detail=f"Serial '{s}' is not reserved for {product.sku} on this order."
                    )
                chosen.append(r)
        else:
            chosen = reservations[: int(quantity)]
        if len(chosen) < quantity:
            raise InventoryError(
                detail=f"Not enough reserved serials for {product.sku}: need {quantity}, have {len(chosen)}."
            )

        movements = []
        for r in chosen:
            movements.append(
                LedgerService.transfer_stock(
                    product_model=product,
                    from_location=r.location,
                    to_location=external,
                    quantity=Decimal("1"),
                    user=user,
                    reason=reason,
                    physical_product=r.physical_product,
                    customer=line.sales_order.customer,
                    reservation=r,
                    source_document="SALE",
                    sales_order_line=line,
                )
            )
        return movements

    @staticmethod
    def _ship_bulk_or_batch(line, shipment, quantity, external, reason, user):
        product = line.product_model
        reservation = line.reservations.filter(status="ACTIVE").order_by("created_at").first()
        if reservation is None:
            raise InventoryError(detail=f"No active reservation to ship for {product.sku}.")
        if reservation.quantity < quantity:
            raise InventoryError(
                detail=f"Reserved quantity {reservation.quantity} is below shipment {quantity} for {product.sku}."
            )

        from_location = reservation.location
        remainder = reservation.quantity - quantity

        kwargs = {}
        if product.tracking_mode == "BATCH":
            batch_id = shipment.get("batch_id") or reservation.batch_id
            if not batch_id:
                # Fall back to the first batch with stock at the source location.
                batch = (
                    ProductBatch.objects.filter(
                        product_model=product,
                        location=from_location,
                        quantity__gt=0,
                    )
                    .order_by("id")
                    .first()
                )
                if batch is None:
                    raise InventoryError(detail=f"No batch with stock to ship for {product.sku}.")
                batch_id = batch.id
            kwargs["batch_id"] = str(batch_id)

        movement = LedgerService.transfer_stock(
            product_model=product,
            from_location=from_location,
            to_location=external,
            quantity=quantity,
            user=user,
            reason=reason,
            customer=line.sales_order.customer,
            reservation=reservation,
            source_document="SALE",
            sales_order_line=line,
            **kwargs,
        )
        # LedgerService consumed the whole reservation; re-reserve any remainder
        # so the still-pending part of the line stays committed.
        if remainder > 0:
            ReservationService.reserve(
                product,
                remainder,
                user,
                location=from_location,
                batch=reservation.batch,
                reference=reservation.reference,
                sales_order_line=line,
            )
        return [movement]

    # ── Cancel ───────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def cancel(so: SalesOrder) -> SalesOrder:
        """Cancel an order and release its remaining reservations.

        Allowed while nothing has shipped (DRAFT/CONFIRMED/PICKING). Released
        reservations return their quantity to available stock.
        """
        so = SalesOrder.objects.select_for_update().get(pk=so.pk)
        if so.status not in (SO_STATUS_DRAFT, SO_STATUS_CONFIRMED, SO_STATUS_PICKING):
            raise InventoryError(
                detail=f"Only DRAFT, CONFIRMED or PICKING orders can be cancelled (current: {so.status})."
            )
        if so.lines.filter(quantity_shipped__gt=0).exists():
            raise InventoryError(detail="Cannot cancel an order with shipped goods.")
        active = Reservation.objects.filter(
            sales_order_line__sales_order=so,
            status="ACTIVE",
        )
        for reservation in active:
            ReservationService.release(reservation)
        so.status = SO_STATUS_CANCELLED
        so.save(update_fields=["status", "updated_at"])
        return so

    @staticmethod
    def _refresh_status(so: SalesOrder):
        """Recompute SO status from its lines (caller holds the SO lock)."""
        lines = list(so.lines.all())
        if lines and all(l.quantity_shipped >= l.quantity_ordered for l in lines):
            new_status = SO_STATUS_SHIPPED
        elif any(l.quantity_shipped > 0 for l in lines):
            new_status = SO_STATUS_PARTIALLY_SHIPPED
        else:
            new_status = so.status
        if new_status != so.status:
            so.status = new_status
            so.save(update_fields=["status", "updated_at"])
