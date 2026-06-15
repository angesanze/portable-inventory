"""Stocktake lifecycle: open (snapshot) → count → variance → apply (ADJUSTMENT).

``open_session`` freezes the expected on-hand of a location as one ``CountLine``
per item (a batch, a serialized unit, or a bulk product). ``record_count``
stores the physical count per line (idempotent). ``variance_report`` lists the
non-zero deltas plus the uncounted lines, and warns when Movements touched the
location after the snapshot. ``apply`` books every variance as an ADJUSTMENT
``Movement`` through ``LedgerService.transfer_stock`` — surplus flows
ADJUSTMENT→location, shortfall location→ADJUSTMENT — using the delta
``counted − expected_snapshot`` (the expected is *not* recomputed at apply).
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .. import constants
from ..exceptions import InventoryError
from ..models import (
    CountLine, CountSession, Movement, PhysicalProduct, ProductBatch,
)
from ..models.stocktake import (
    CS_ACTIVE_STATUSES, CS_STATUS_APPLIED, CS_STATUS_COUNTING,
    CS_STATUS_OPEN, CS_STATUS_REVIEW,
)
from ..profiles import profiles_for_tracking_mode
from .counterparty import CounterpartyService
from .ledger import LedgerService
from .stock import StockService

BULK_PROFILES = profiles_for_tracking_mode('BULK')


class StocktakeService:

    # ── Open (snapshot) ──────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def open_session(location, user, notes='') -> CountSession:
        """Create a COUNTING session with one CountLine per expected item.

        Snapshots the location contents (batches + serials + bulk) into
        immutable ``expected_qty`` lines. Raises if a non-terminal session
        already exists for the location (model ``clean`` backstops the race).
        """
        if location is None:
            raise InventoryError(detail="A location is required.")
        if CountSession.objects.filter(
            location=location, status__in=CS_ACTIVE_STATUSES,
        ).exists():
            raise InventoryError(
                detail="An open count session already exists for this location."
            )

        session = CountSession(
            company=location.company,
            location=location,
            status=CS_STATUS_OPEN,
            snapshot_at=timezone.now(),
            created_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
            notes=notes or '',
        )
        session.save()

        StocktakeService._snapshot_lines(session, location)

        session.status = CS_STATUS_COUNTING
        session.save(update_fields=['status', 'updated_at'])
        return session

    @staticmethod
    def _snapshot_lines(session, location):
        """One CountLine per expected item: batches, serials, bulk products."""
        # 1. BATCH lines — one per ProductBatch with stock.
        batches = ProductBatch.objects.filter(
            location=location, quantity__gt=0,
        ).select_related('product_model')
        for b in batches:
            CountLine.objects.create(
                session=session,
                product_model=b.product_model,
                batch=b,
                expected_qty=b.quantity,
            )

        # 2. SERIALIZED lines — one per ACTIVE PhysicalProduct (expected 1).
        items = PhysicalProduct.objects.filter(
            location=location, status='ACTIVE',
        ).select_related('product_model')
        for i in items:
            CountLine.objects.create(
                session=session,
                product_model=i.product_model,
                physical_product=i,
                expected_qty=Decimal('1'),
            )

        # 3. BULK lines — one per bulk product with non-zero on-hand.
        for entry in StockService.get_location_contents(location):
            if entry.get('type') != 'BULK':
                continue
            from ..models import ProductModel
            product = ProductModel.objects.get(id=entry['product_id'])
            CountLine.objects.create(
                session=session,
                product_model=product,
                expected_qty=entry['quantity'],
            )

    # ── Count ────────────────────────────────────────────────────────

    @staticmethod
    def record_count(line: CountLine, qty, user) -> CountLine:
        """Set ``counted_qty`` on a line (idempotent — re-counting overwrites)."""
        if line.session.is_terminal:
            raise InventoryError(detail="Cannot record counts on a closed session.")
        try:
            value = Decimal(str(qty))
        except (InvalidOperation, TypeError):
            raise InventoryError(detail="Counted quantity must be a number.")
        if value < 0:
            raise InventoryError(detail="Counted quantity cannot be negative.")
        # A serialized line is a single physical unit: 0 (missing) or 1 (present).
        if line.physical_product_id is not None and value not in (Decimal('0'), Decimal('1')):
            raise InventoryError(
                detail="A serialized line can only be counted as 0 (missing) or 1 (present)."
            )
        line.counted_qty = value
        line.counted_by = user if (user and getattr(user, 'is_authenticated', False)) else None
        line.counted_at = timezone.now()
        line.save(update_fields=['counted_qty', 'counted_by', 'counted_at'])
        return line

    @staticmethod
    def record_counts(session: CountSession, entries, user):
        """Bulk count: ``entries`` is a list of {line_id, qty}. Returns the lines."""
        if session.is_terminal:
            raise InventoryError(detail="Cannot record counts on a closed session.")
        updated = []
        for entry in entries:
            line_id = entry.get('line_id')
            try:
                line = CountLine.objects.select_related('session', 'physical_product').get(
                    id=line_id, session=session,
                )
            except (CountLine.DoesNotExist, ValueError, TypeError):
                raise InventoryError(detail=f"Count line {line_id} not found on this session.")
            updated.append(StocktakeService.record_count(line, entry.get('qty'), user))
        # First count moves OPEN → COUNTING (open_session already did, but keep
        # idempotent for safety) and never auto-advances to REVIEW.
        return updated

    # ── Variance report ──────────────────────────────────────────────

    @staticmethod
    def variance_report(session: CountSession) -> dict:
        """Variances (counted − expected ≠ 0) + uncounted lines + staleness warning."""
        lines = list(
            session.lines.select_related('product_model', 'batch', 'physical_product').all()
        )
        variances = []
        uncounted = []
        for line in lines:
            payload = {
                'line_id': str(line.id),
                'product_id': str(line.product_model_id),
                'product_sku': line.product_model.sku,
                'product_name': line.product_model.name,
                'product_profile': line.product_model.profile,
                'batch_identifier': line.batch.batch_identifier if line.batch_id else None,
                'identifier': line.physical_product.identifier if line.physical_product_id else None,
                'expected_qty': line.expected_qty,
                'counted_qty': line.counted_qty,
                'variance': line.variance,
            }
            if line.counted_qty is None:
                uncounted.append(payload)
            elif line.variance != 0:
                variances.append(payload)

        # Staleness: Movements on the location after the snapshot make the
        # expected stale. Cheap existence query (no apply blocking in v1).
        moved_after = Movement.objects.filter(
            Q(from_location=session.location) | Q(to_location=session.location),
            occurred_at__gt=session.snapshot_at,
        ).exclude(reason__startswith=f"Stocktake {session.id}").exists()

        total = len(lines)
        counted = sum(1 for l in lines if l.counted_qty is not None)
        return {
            'session_id': str(session.id),
            'status': session.status,
            'location': session.location.name,
            'snapshot_at': session.snapshot_at,
            'total_lines': total,
            'counted_lines': counted,
            'variances': variances,
            'uncounted': uncounted,
            'movements_after_snapshot': moved_after,
        }

    # ── Apply ────────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def apply(session: CountSession, user, uncounted='skip') -> dict:
        """REVIEW → APPLIED, booking each variance as an ADJUSTMENT Movement.

        ``uncounted='skip'`` (default) leaves never-counted lines untouched;
        ``'zero'`` treats them as counted 0 (full shortfall). Surplus flows
        ADJUSTMENT→location, shortfall location→ADJUSTMENT. The variance is the
        stored delta ``counted − expected_snapshot`` — never recomputed here.
        """
        session = CountSession.objects.select_for_update().get(pk=session.pk)
        if session.status == CS_STATUS_APPLIED:
            raise InventoryError(detail="This session has already been applied.")
        if session.status not in (CS_STATUS_COUNTING, CS_STATUS_REVIEW):
            raise InventoryError(
                detail=f"Only a COUNTING/REVIEW session can be applied (current: {session.status})."
            )
        if uncounted not in ('skip', 'zero'):
            raise InventoryError(detail="uncounted must be 'skip' or 'zero'.")

        location = session.location
        adjustment = CounterpartyService.resolve(session.company, constants.COUNTERPARTY_ADJUSTMENT)
        reason = f"Stocktake {session.id}"
        movements = []

        lines = list(
            session.lines.select_related('product_model', 'batch', 'physical_product').all()
        )
        for line in lines:
            counted = line.counted_qty
            if counted is None:
                if uncounted == 'skip':
                    continue
                counted = Decimal('0')  # 'zero': treat as full shortfall.

            delta = counted - line.expected_qty
            if delta == 0:
                continue

            product = line.product_model

            if product.tracking_mode == 'INDIVIDUAL':
                movements.extend(
                    StocktakeService._apply_serialized(line, delta, location, adjustment, reason, user)
                )
            else:
                movements.extend(
                    StocktakeService._apply_bulk_or_batch(line, delta, location, adjustment, reason, user)
                )

        session.status = CS_STATUS_APPLIED
        session.applied_by = user if (user and getattr(user, 'is_authenticated', False)) else None
        session.applied_at = timezone.now()
        session.save(update_fields=['status', 'applied_by', 'applied_at', 'updated_at'])

        return {
            'session_id': str(session.id),
            'status': session.status,
            'movement_ids': [str(m.id) for m in movements],
            'adjustments': len(movements),
        }

    @staticmethod
    def _apply_serialized(line, delta, location, adjustment, reason, user):
        """A serialized line is a single unit: delta is -1 (missing) or +1 (found)."""
        product = line.product_model
        from ..orchestrators import InventoryOrchestrator

        if delta < 0:
            # Expected, not found → outbound the specific unit to ADJUSTMENT.
            pp = line.physical_product
            if pp is None:
                return []
            movement = LedgerService.transfer_stock(
                product_model=product,
                from_location=location,
                to_location=adjustment,
                quantity=Decimal('1'),
                user=user,
                reason=reason,
                physical_product=pp,
            )
            return [movement]

        # delta > 0: found, not expected. Needs an identifier to materialize the
        # unit. For snapshot lines this only happens via uncounted='zero' inverse
        # — but a positive serialized delta with no physical_product means an
        # unidentified surplus we cannot book.
        pp = line.physical_product
        if pp is None:
            raise InventoryError(
                detail=(
                    f"Surplus serialized unit for {product.sku} has no identifier; "
                    "cannot book an unidentified serial."
                )
            )
        pp = InventoryOrchestrator.resolve_or_create_item(
            product, pp.identifier, adjustment, inbound=True,
        )
        movement = LedgerService.transfer_stock(
            product_model=product,
            from_location=adjustment,
            to_location=location,
            quantity=Decimal('1'),
            user=user,
            reason=reason,
            physical_product=pp,
        )
        return [movement]

    @staticmethod
    def _apply_bulk_or_batch(line, delta, location, adjustment, reason, user):
        product = line.product_model
        qty = abs(delta)
        kwargs = {}
        if product.tracking_mode == 'BATCH' and line.batch_id is not None:
            kwargs['batch_id'] = str(line.batch_id)

        if delta > 0:
            # Surplus: ADJUSTMENT → location.
            inbound_kwargs = {}
            if product.tracking_mode == 'BATCH' and line.batch_id is not None:
                # Re-credit the same batch identifier so the surplus lands in it.
                inbound_kwargs['batch_data'] = {'batch_identifier': line.batch.batch_identifier}
            movement = LedgerService.transfer_stock(
                product_model=product,
                from_location=adjustment,
                to_location=location,
                quantity=qty,
                user=user,
                reason=reason,
                **inbound_kwargs,
            )
        else:
            # Shortfall: location → ADJUSTMENT.
            movement = LedgerService.transfer_stock(
                product_model=product,
                from_location=location,
                to_location=adjustment,
                quantity=qty,
                user=user,
                reason=reason,
                **kwargs,
            )
        return [movement]

    # ── Cancel ───────────────────────────────────────────────────────

    @staticmethod
    @transaction.atomic
    def cancel(session: CountSession) -> CountSession:
        from ..models.stocktake import CS_STATUS_CANCELLED
        session = CountSession.objects.select_for_update().get(pk=session.pk)
        if session.is_terminal:
            raise InventoryError(detail=f"Session is already {session.status}.")
        session.status = CS_STATUS_CANCELLED
        session.save(update_fields=['status', 'updated_at'])
        return session

    # ── Review transition ────────────────────────────────────────────

    @staticmethod
    def to_review(session: CountSession) -> CountSession:
        if session.status not in (CS_STATUS_OPEN, CS_STATUS_COUNTING):
            raise InventoryError(detail=f"Cannot move to REVIEW from {session.status}.")
        session.status = CS_STATUS_REVIEW
        session.save(update_fields=['status', 'updated_at'])
        return session
