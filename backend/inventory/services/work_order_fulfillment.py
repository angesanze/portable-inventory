import logging
import uuid
from decimal import Decimal

from django.db import transaction

from ..exceptions import InventoryError
from ..models import Location, PhysicalProduct, ProductBatch
from .ledger import LedgerService

logger = logging.getLogger('inventory.widget')


class WorkOrderFulfillmentService:
    """
    Discharges the entire contents of a WorkOrder in one atomic operation.

    Every assigned item — ``ProductBatch`` rows (BATCH/bucket + BULK/counter
    engines) and ``PhysicalProduct`` rows (SERIAL/INDIVIDUAL) — is moved out of
    stock to the ``External`` VIRTUAL location, then the WorkOrder is closed.

    SERIAL note: ``SerializedBehavior.execute`` (strategies.py L148-155) re-applies
    ``work_order`` from the transfer context and does NOT flip ``status`` away from
    ``ACTIVE``. A consumed serial item would therefore still match the
    ``contents()`` filter (``work_order=wo, status='ACTIVE'``). To keep the closed
    WO empty we explicitly set ``work_order=None`` on each transferred item after
    its transfer succeeds (status is left untouched).

    ProductBatch note: ``BatchBehavior`` (bucket) drains the source row's quantity
    to 0 during the transfer, but ``BulkBehavior`` (counter/BULK) only writes a
    Movement — the WO-annotation ProductBatch row is left untouched. To keep the
    invariant "a fulfilled batch leaves ``contents()``" uniform across both engines,
    each transferred batch's quantity is explicitly zeroed after its transfer.
    """

    @staticmethod
    def _resolve_external_location(company):
        """
        Resolve the ``External`` VIRTUAL location for ``company`` using the same
        fallback chain as widget_transaction.py L96-101.
        """
        external = Location.objects.filter(
            company=company, type='VIRTUAL', name='External'
        ).first()
        if not external:
            external = Location.objects.filter(company=company, type='VIRTUAL').first()
        if not external:
            external = Location.objects.create(
                company=company, name='External', type='VIRTUAL'
            )
        return external

    @staticmethod
    @transaction.atomic
    def fulfill(work_order, *, user=None, reason="WO_FULFILL", idempotency_key=None):
        # 1. Idempotency guard — re-load the row UNDER a row lock and re-check
        # status while holding it. Two concurrent/retried fulfills both read
        # ``status != 'CLOSED'`` on stale copies and each discharges stock
        # twice; serializing on ``select_for_update`` means the second waiter
        # only proceeds after the first has committed ``CLOSED``, so it now sees
        # the closed state and short-circuits. The passed-in ``work_order`` is
        # rebound to the locked instance so every subsequent write/save targets
        # the row we hold.
        work_order = (
            type(work_order).objects.select_for_update().get(pk=work_order.pk)
        )
        if work_order.status == 'CLOSED':
            raise InventoryError(detail="Work order already fulfilled/closed.")

        # If a deterministic idempotency_key was supplied, thread a per-line
        # derivative into each LedgerService call so a retry that reaches the
        # ledger collapses onto the same Movement instead of double-booking.
        idem_base = str(idempotency_key) if idempotency_key else None

        # 2. Resolve the External VIRTUAL sink location.
        external = WorkOrderFulfillmentService._resolve_external_location(
            work_order.company
        )

        try:
            # 3. Discharge ProductBatch rows (BATCH + BULK engines).
            batches = ProductBatch.objects.filter(
                work_order=work_order, quantity__gt=0
            ).select_related('product_model', 'location')

            batches_fulfilled = 0
            batch_units = Decimal('0')
            for batch in batches:
                LedgerService.transfer_stock(
                    product_model=batch.product_model,
                    from_location=batch.location,
                    to_location=external,
                    quantity=batch.quantity,
                    user=user,
                    reason=f"{reason}: batch {batch.batch_identifier} from WO {work_order.name}",
                    batch_id=batch.id,
                    work_order=work_order,
                    idempotency_key=(
                        str(uuid.uuid5(uuid.NAMESPACE_OID, f"{idem_base}:batch:{batch.id}"))
                        if idem_base else None
                    ),
                )
                batches_fulfilled += 1
                batch_units += batch.quantity
                # Drop the discharged batch out of contents(). BatchBehavior
                # already zeroed bucket rows; BulkBehavior (counter) did not, so
                # zero the WO-annotation row explicitly for both engines.
                batch.quantity = Decimal('0')
                batch.save(update_fields=['quantity', 'updated_at'])

            # 4. Discharge PhysicalProduct rows (SERIAL/INDIVIDUAL).
            items = PhysicalProduct.objects.filter(
                work_order=work_order, status='ACTIVE'
            ).select_related('product_model', 'location')

            items_fulfilled = 0
            for item in items:
                LedgerService.transfer_stock(
                    product_model=item.product_model,
                    from_location=item.location,
                    to_location=external,
                    quantity=Decimal('1'),
                    user=user,
                    reason=f"{reason}: item {item.identifier} from WO {work_order.name}",
                    physical_product=item,
                    work_order=work_order,
                    idempotency_key=(
                        str(uuid.uuid5(uuid.NAMESPACE_OID, f"{idem_base}:item:{item.id}"))
                        if idem_base else None
                    ),
                )
                # SerializedBehavior re-binds the WO and leaves status ACTIVE;
                # detach so the consumed item leaves contents().
                item.work_order = None
                item.save(update_fields=['work_order', 'updated_at'])
                items_fulfilled += 1

        except InventoryError:
            # Propagate domain errors so the atomic block rolls back.
            raise
        except Exception as e:
            logger.exception("Unexpected error during work order fulfillment")
            raise InventoryError(detail=str(e))

        # 5. Close the WorkOrder (empty WO is validly closed with zero counts).
        work_order.status = 'CLOSED'
        work_order.save(update_fields=['status', 'updated_at'])

        # 6. Summary.
        return {
            "success": True,
            "work_order_id": str(work_order.id),
            "status": "CLOSED",
            "batches_fulfilled": batches_fulfilled,
            "items_fulfilled": items_fulfilled,
            "total_units": float(batch_units) + items_fulfilled,
        }
