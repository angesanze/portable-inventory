"""Inter-site transfer lifecycle: numbering, ship, receive, shortage, cancel.

Every stock change goes through ``LedgerService.transfer_stock`` (ledger
semantics unchanged). Ship parks goods in the company's single virtual
``In Transit`` location (resolved via ``CounterpartyService.resolve(company,
'TRANSIT')``); receive lands them at the destination; report_shortage books
whatever never arrived to LOSS so the transit buffer never carries phantom
residuals. The invariant per line is::

    quantity_sent == quantity_received + quantity_shortage + quantity_in_transit

``quantity_sent`` / ``quantity_received`` / ``quantity_shortage`` are
denormalized and only mutated here, under ``select_for_update``.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from core.models import Company
from .. import constants
from ..exceptions import InventoryError
from ..models import Location, ProductBatch, TransferOrder, TransferOrderLine
from ..models.transfers import (
    TR_STATUS_CANCELLED, TR_STATUS_DRAFT, TR_STATUS_IN_TRANSIT,
    TR_STATUS_PARTIALLY_RECEIVED, TR_STATUS_RECEIVED,
)
from .counterparty import CounterpartyService
from .ledger import LedgerService

RECEIVABLE_STATUSES = (TR_STATUS_IN_TRANSIT, TR_STATUS_PARTIALLY_RECEIVED)


class TransferService:

    # ── Numbering ────────────────────────────────────────────────────

    @staticmethod
    def next_number(company) -> str:
        """Next sequential ``TR-{year}-{progressive:04d}`` for the company.

        Must run inside ``transaction.atomic``: locks the Company row so
        concurrent creations serialize and cannot race on the progressive
        (the (company, number) unique constraint is the backstop).
        """
        Company.objects.select_for_update().get(pk=company.pk)
        year = timezone.now().year
        prefix = f"TR-{year}-"
        last = (
            TransferOrder.objects
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
                progressive = TransferOrder.objects.filter(
                    company=company, number__startswith=prefix,
                ).count() + 1
        return f"{prefix}{progressive:04d}"

    # ── Helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _transit_location(company) -> Location:
        return CounterpartyService.resolve(company, constants.COUNTERPARTY_TRANSIT)

    @staticmethod
    def _loss_location(company) -> Location:
        """The company's LOSS location (lazily created)."""
        return CounterpartyService.resolve_loss(company)

    @staticmethod
    def _coerce_qty(raw) -> Decimal:
        try:
            qty = Decimal(str(raw))
        except (InvalidOperation, TypeError):
            raise InventoryError(detail="Quantity must be a number.")
        if qty <= 0:
            raise InventoryError(detail="Quantity must be positive.")
        return qty

    # ── Lifecycle ────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def ship(order: TransferOrder, user) -> list:
        """DRAFT → IN_TRANSIT. Moves every line from source into In Transit.

        SERIALIZED lines forward their pinned ``physical_product``; BATCH lines
        forward their pinned ``batch`` (so the source batch is decremented and
        the identifier can be reconstituted on receive — see ``receive``).
        Returns the created Movements. Atomic: any failure rolls ship back.
        """
        order = TransferOrder.objects.select_for_update().get(pk=order.pk)
        if order.status != TR_STATUS_DRAFT:
            raise InventoryError(detail=f"Only DRAFT transfers can be shipped (current: {order.status}).")
        lines = list(order.lines.select_related('product_model', 'batch', 'physical_product').all())
        if not lines:
            raise InventoryError(detail="Cannot ship a transfer without lines.")

        transit = TransferService._transit_location(order.company)
        reason = f"TR {order.number} out"
        movements = []

        for line in lines:
            product = line.product_model
            kwargs = {}
            if product.tracking_mode == 'INDIVIDUAL':
                if line.physical_product_id is None:
                    raise InventoryError(
                        detail=f"Serialized line {line.id} needs a physical_product to ship."
                    )
                kwargs['physical_product'] = line.physical_product
            elif product.tracking_mode == 'BATCH':
                if line.batch_id is None:
                    raise InventoryError(
                        detail=f"Batch line {line.id} needs a batch to ship."
                    )
                kwargs['batch_id'] = str(line.batch_id)

            movements.append(LedgerService.transfer_stock(
                product_model=product,
                from_location=order.from_location,
                to_location=transit,
                quantity=line.quantity_sent,
                user=user,
                reason=reason,
                **kwargs,
            ))

        order.status = TR_STATUS_IN_TRANSIT
        order.shipped_at = timezone.now()
        order.save(update_fields=['status', 'shipped_at', 'updated_at'])
        return movements

    @staticmethod
    @transaction.atomic
    def receive(order: TransferOrder, receipts, user) -> list:
        """Receive (possibly partial) lines from In Transit into destination.

        ``receipts`` is a list of dicts ``{line_id, quantity}``. Quantity must
        not exceed the line's residual in transit. Updates ``quantity_received``
        and the order status. Returns the created Movements.
        """
        order = TransferOrder.objects.select_for_update().get(pk=order.pk)
        if order.status not in RECEIVABLE_STATUSES:
            raise InventoryError(detail=f"Transfer {order.number} is not receivable (status: {order.status}).")
        if not receipts:
            raise InventoryError(detail="At least one receipt line is required.")

        transit = TransferService._transit_location(order.company)
        reason = f"TR {order.number} in"
        movements = []

        for receipt in receipts:
            line = TransferService._lock_line(order, receipt.get('line_id'))
            quantity = TransferService._coerce_qty(receipt.get('quantity'))

            residual = line.quantity_in_transit
            if quantity > residual:
                raise InventoryError(
                    detail=(
                        f"Receipt of {quantity} exceeds the {residual} still in "
                        f"transit for {line.product_model.sku} on {order.number}."
                    )
                )

            movements.extend(TransferService._land(
                line, transit, order.to_location, quantity, user, reason,
            ))
            line.quantity_received += quantity
            line.save(update_fields=['quantity_received'])

        TransferService._refresh_status(order)
        return movements

    @staticmethod
    @transaction.atomic
    def report_shortage(order: TransferOrder, line_id, qty, user) -> list:
        """Goods that never arrived: In Transit → LOSS for ``qty``.

        Booked to the company's LOSS location so the transit buffer does not
        accumulate phantom residuals. Counts toward the line's terminal state.
        """
        order = TransferOrder.objects.select_for_update().get(pk=order.pk)
        if order.status not in RECEIVABLE_STATUSES:
            raise InventoryError(detail=f"Transfer {order.number} is not in transit (status: {order.status}).")

        line = TransferService._lock_line(order, line_id)
        quantity = TransferService._coerce_qty(qty)
        residual = line.quantity_in_transit
        if quantity > residual:
            raise InventoryError(
                detail=(
                    f"Shortage of {quantity} exceeds the {residual} still in "
                    f"transit for {line.product_model.sku} on {order.number}."
                )
            )

        transit = TransferService._transit_location(order.company)
        loss = TransferService._loss_location(order.company)
        reason = f"TR {order.number} shortage"
        movements = TransferService._land(line, transit, loss, quantity, user, reason)

        line.quantity_shortage += quantity
        line.save(update_fields=['quantity_shortage'])

        TransferService._refresh_status(order)
        return movements

    @staticmethod
    @transaction.atomic
    def cancel(order: TransferOrder) -> TransferOrder:
        """DRAFT → CANCELLED. An IN_TRANSIT order is closed only by fully
        receiving and/or reporting shortage on its goods, never cancelled."""
        order = TransferOrder.objects.select_for_update().get(pk=order.pk)
        if order.status != TR_STATUS_DRAFT:
            raise InventoryError(
                detail=f"Only DRAFT transfers can be cancelled (current: {order.status}). "
                       "An in-transit transfer is closed via receive + shortage."
            )
        order.status = TR_STATUS_CANCELLED
        order.save(update_fields=['status', 'updated_at'])
        return order

    # ── Internals ────────────────────────────────────────────────────

    @staticmethod
    def _lock_line(order, line_id) -> TransferOrderLine:
        try:
            # of=('self',) locks only the line row — select_related across the
            # nullable batch/physical_product FKs would make Postgres reject
            # FOR UPDATE on the nullable side of the outer join.
            return TransferOrderLine.objects.select_for_update(of=('self',)).select_related(
                'product_model', 'batch', 'physical_product',
            ).get(id=line_id, transfer_order=order)
        except (TransferOrderLine.DoesNotExist, ValueError, TypeError):
            raise InventoryError(detail=f"Transfer line {line_id} not found on {order.number}.")

    @staticmethod
    def _land(line, from_location, to_location, quantity, user, reason) -> list:
        """Move ``quantity`` of a line's product out of the transit buffer.

        BATCH: reconstruct the original batch_identifier so continuity survives
        the virtual hop. SERIALIZED: forward the pinned physical_product (one
        unit). The behaviors handle the rest.
        """
        product = line.product_model
        kwargs = {}
        if product.tracking_mode == 'INDIVIDUAL':
            kwargs['physical_product'] = line.physical_product
        elif product.tracking_mode == 'BATCH':
            identifier = None
            data = {}
            if line.batch_id is not None:
                identifier = line.batch.batch_identifier
                data = line.batch.data
            if identifier:
                kwargs['batch_data'] = {'batch_identifier': identifier, 'data': data}

        return [LedgerService.transfer_stock(
            product_model=product,
            from_location=from_location,
            to_location=to_location,
            quantity=quantity,
            user=user,
            reason=reason,
            **kwargs,
        )]

    @staticmethod
    def _refresh_status(order: TransferOrder):
        """Recompute status from lines (caller holds the order lock)."""
        lines = list(order.lines.all())
        all_settled = lines and all(
            l.quantity_received + l.quantity_shortage >= l.quantity_sent for l in lines
        )
        any_progress = any(l.quantity_received > 0 or l.quantity_shortage > 0 for l in lines)
        if all_settled:
            new_status = TR_STATUS_RECEIVED
        elif any_progress:
            new_status = TR_STATUS_PARTIALLY_RECEIVED
        else:
            new_status = order.status

        fields = ['status', 'updated_at']
        order.status = new_status
        if new_status == TR_STATUS_RECEIVED and order.received_at is None:
            order.received_at = timezone.now()
            fields.append('received_at')
        order.save(update_fields=fields)

    # ── In-transit stock exposure ────────────────────────────────────

    @staticmethod
    def in_transit_stock(company) -> dict:
        """Stock currently parked in the company's In Transit location.

        ``get_stock_for_model`` excludes VIRTUAL locations from breakdowns, so
        in-transit goods are neither sellable nor counted at either site. This
        exposes them explicitly, summed per product, from the open transfers'
        denormalized line totals (sent − received − shortage).

        Returns ``{"total": Decimal, "by_product": [{product_id, sku, name,
        quantity}]}``.
        """
        from collections import OrderedDict

        rows = OrderedDict()
        total = Decimal('0')
        lines = TransferOrderLine.objects.filter(
            transfer_order__company=company,
            transfer_order__status__in=RECEIVABLE_STATUSES,
        ).select_related('product_model')
        for line in lines:
            qty = line.quantity_in_transit
            if qty <= 0:
                continue
            pm = line.product_model
            key = str(pm.id)
            if key not in rows:
                rows[key] = {
                    'product_id': key,
                    'sku': pm.sku,
                    'name': pm.name,
                    'quantity': Decimal('0'),
                }
            rows[key]['quantity'] += qty
            total += qty
        return {'total': total, 'by_product': list(rows.values())}
