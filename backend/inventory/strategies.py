import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional, Dict, Any
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db import transaction
from .models import Movement, Location, ProductModel, PhysicalProduct, ProductBatch
from .services import StockService
from .validators import StockMovementValidator
from .exceptions import (
    InsufficientStockError, InventoryError, ItemNotFoundError,
    InvalidEngineConfigError,
)

@dataclass
class TransferContext:
    product_model: ProductModel
    from_location: Location
    to_location: Location
    quantity: Decimal
    user: Any
    reason: str
    physical_product: Optional[PhysicalProduct] = None
    batch_data: Optional[Dict[str, Any]] = None
    batch_id: Optional[str] = None
    work_order: Optional[Any] = None
    idempotency_key: Optional[str] = None
    supplier: Optional[Any] = None
    # Customer (cliente) for outbound shipments (SALES-ORDERS-04); recorded on
    # the Movement as the destination attribution.
    customer: Optional[Any] = None
    # SalesOrderLine this shipment fulfils (recorded on the Movement).
    sales_order_line: Optional[Any] = None
    # Reservation being fulfilled by this transfer: its quantity is added
    # back to the availability check, and LedgerService consumes it after a
    # successful execute.
    reservation: Optional[Any] = None
    # Kind of source document driving the transfer (e.g. 'PURCHASE' for a
    # purchase-order receipt). AssembledBehavior allows a BOM kit inbound
    # without a work order when the kit was bought already assembled.
    source_document: Optional[str] = None
    # PurchaseOrderLine this receipt fulfils; recorded on the Movement and
    # used to stamp Movement.purchased_cost from the line's unit cost.
    purchase_order_line: Optional[Any] = None
    # Explicit receipt unit cost for onboarding paths without a PO line
    # (e.g. catalogue import with a `unit_cost` column). Mirrored onto
    # Movement.purchased_cost when no purchase_order_line is present.
    purchased_cost: Optional[Any] = None

class ProfileBehavior(ABC):
    @abstractmethod
    def validate(self, ctx: TransferContext):
        """Validate the transfer context for specific strategy rules."""
        pass

    @abstractmethod
    def execute(self, ctx: TransferContext) -> Movement:
        """Execute the transfer and return the created Movement."""
        pass

    def _create_movement(self, ctx: TransferContext, batch: Optional[ProductBatch] = None) -> Movement:
        """Helper to create the immutable movement record."""
        movement = Movement(
            product_model=ctx.product_model,
            physical_product=ctx.physical_product,
            from_location=ctx.from_location,
            to_location=ctx.to_location,
            quantity=ctx.quantity,
            performed_by=ctx.user,
            reason=ctx.reason,
            occurred_at=timezone.now(),
            batch=batch,
            work_order=ctx.work_order,
            idempotency_key=ctx.idempotency_key,
            supplier=ctx.supplier,
            customer=ctx.customer,
            purchase_order_line=ctx.purchase_order_line,
            # Movement rows are immutable, so the receipt cost must land at
            # creation time. A PO line's unit cost wins; otherwise an explicit
            # onboarding cost (e.g. import `unit_cost`) is used.
            purchased_cost=(
                ctx.purchase_order_line.unit_cost
                if ctx.purchase_order_line is not None else ctx.purchased_cost
            ),
        )
        movement.save()
        return movement

class BulkBehavior(ProfileBehavior):
    def validate(self, ctx: TransferContext):
        if ctx.physical_product:
            raise InventoryError(detail="Cannot attach a Physical Product to a BULK movement.")

        # BULK stock is a ledger aggregate, not a row we can lock directly.
        # Lock the product row so concurrent BULK transfers serialize here:
        # otherwise two requests both read the same stale sum, both pass the
        # check below, and the ledger goes negative.
        ProductModel.objects.select_for_update().get(pk=ctx.product_model.pk)

        StockMovementValidator.validate_bulk_transfer(
            product=ctx.product_model,
            from_location=ctx.from_location,
            quantity=ctx.quantity,
            reservation=ctx.reservation,
        )

    def execute(self, ctx: TransferContext) -> Movement:
        return self._create_movement(ctx)


class AssembledBehavior(BulkBehavior):
    def validate(self, ctx: TransferContext):
        # Once a bill of materials exists, kits must enter stock through
        # work-order production, which consumes component stock — a plain
        # inbound add would mint kits from nothing and leave component stock
        # overstated. Without a BOM (e.g. initial onboarding of kits that
        # already exist physically) a direct add is legitimate. A purchase
        # receipt (source_document == 'PURCHASE') is also legitimate: buying
        # finished kits from a supplier consumes no component stock here.
        if (
            ctx.from_location.type == LOCATION_TYPE_VIRTUAL
            and ctx.to_location.type != LOCATION_TYPE_VIRTUAL
            and ctx.work_order is None
            and ctx.source_document != SOURCE_DOCUMENT_PURCHASE
            and ctx.product_model.components.exists()
        ):
            raise InventoryError(
                detail=(
                    "Assembled products with components enter stock via kit "
                    "production (work order), which consumes component stock. "
                    "Use the 'produce_kit' flow instead of a direct add."
                )
            )
        super().validate(ctx)

class BatchBehavior(ProfileBehavior):
    def validate(self, ctx: TransferContext):
        StockMovementValidator.validate_bucket_transfer(
            from_location=ctx.from_location,
            to_location=ctx.to_location,
            batch_id=ctx.batch_id,
            batch_data=ctx.batch_data
        )

    def execute(self, ctx: TransferContext) -> Movement:
        source_batch = None
        dest_batch = None

        # 1. Handle Outgoing (Deduction)
        if ctx.from_location.type != LOCATION_TYPE_VIRTUAL:
            try:
                # SELECT FOR UPDATE IS CRITICAL HERE
                source_batch = ProductBatch.objects.select_for_update().get(
                    id=ctx.batch_id,
                    location=ctx.from_location,
                    product_model=ctx.product_model
                )
            except ProductBatch.DoesNotExist:
                 raise ItemNotFoundError(detail="Specified Batch not found in source location.")

            # Available within the batch = quantity − active reservations
            # bound to this batch (a fulfilling transfer gets its own back).
            from django.db.models import Sum as _Sum
            reserved = source_batch.reservations.filter(status=RESERVATION_STATUS_ACTIVE).aggregate(
                t=_Sum('quantity'))['t'] or Decimal('0')
            if ctx.reservation is not None and ctx.reservation.status == RESERVATION_STATUS_ACTIVE \
                    and ctx.reservation.batch_id == source_batch.id:
                reserved -= ctx.reservation.quantity
            if source_batch.quantity - reserved < ctx.quantity:
                 raise InsufficientStockError(
                     detail=f"Insufficient available stock in Batch {source_batch.batch_identifier} (reserved: {reserved}).",
                     current_stock=source_batch.quantity - reserved,
                     requested=ctx.quantity,
                 )

            source_batch.quantity -= ctx.quantity
            source_batch.save()

        # 2. Handle Incoming (Addition/Creation)
        if ctx.to_location.type != LOCATION_TYPE_VIRTUAL:
            identifier = None
            data = {}

            if source_batch:
                # Maintain batch continuity
                identifier = source_batch.batch_identifier
                data = source_batch.data
            elif ctx.batch_data or ctx.batch_id:
                # New Batch (e.g. from Supplier)
                identifier = ctx.batch_id or (ctx.batch_data or {}).get('batch_identifier')
                data = (ctx.batch_data or {}).get('data', ctx.batch_data or {})
            elif ctx.from_location.type == LOCATION_TYPE_VIRTUAL:
                # Inbound from external with no batch hint — synthesize so the
                # first-ever stock for a fresh BATCH/PERISHABLE product can land
                # without a Catch-22 (PRESET-LOGIC-07).
                identifier = None
                data = {}
            else:
                 # Should have been caught in validate, but safety net
                 raise InventoryError(detail="Cannot determine batch identifier.")

            if not identifier:
                if ctx.from_location.type == LOCATION_TYPE_VIRTUAL:
                    identifier = (
                        f"AUTO-{timezone.now().strftime('%Y%m%d')}-"
                        f"{uuid.uuid4().hex[:6].upper()}"
                    )
                else:
                    raise InventoryError(detail="Batch Identifier is required.")

            # Get or Create Batch at Destination
            dest_batch, created = ProductBatch.objects.select_for_update().get_or_create(
                product_model=ctx.product_model,
                location=ctx.to_location,
                batch_identifier=identifier,
                work_order=ctx.work_order,
                defaults={'data': data, 'quantity': 0}
            )
            dest_batch.quantity += ctx.quantity
            dest_batch.save()

        # 3. Create Movement
        # If moving between locations, link to dest_batch (or source if dest is virtual logic?)
        # Logic from original: batch=dest_batch or source_batch
        return self._create_movement(ctx, batch=dest_batch or source_batch)

class SerializedBehavior(ProfileBehavior):
    def validate(self, ctx: TransferContext):
        StockMovementValidator.validate_individual_transfer(
            physical_product=ctx.physical_product,
            from_location=ctx.from_location,
            quantity=ctx.quantity
        )

    def execute(self, ctx: TransferContext) -> Movement:
        pp = PhysicalProduct.objects.select_for_update().get(id=ctx.physical_product.id)

        # Re-validate against the locked row: validate() ran on a snapshot,
        # and a concurrent transfer may have moved the item in between.
        if ctx.from_location.type != LOCATION_TYPE_VIRTUAL and pp.location_id != ctx.from_location.id:
            current = pp.location.name if pp.location else 'Unknown'
            raise ValidationError(
                f"Asset '{pp.identifier}' is not at '{ctx.from_location.name}' "
                f"(Currently at: '{current}')."
            )

        # A reserved item only moves out via the transfer that fulfils its
        # reservation.
        if ctx.from_location.type != LOCATION_TYPE_VIRTUAL:
            active_res = pp.reservations.filter(status=RESERVATION_STATUS_ACTIVE).first()
            if active_res is not None and (
                ctx.reservation is None or ctx.reservation.pk != active_res.pk
            ):
                raise InventoryError(
                    detail=f"Item '{pp.identifier}' is reserved ({active_res.reference or 'no reference'})."
                )

        movement = self._create_movement(ctx)

        pp.location = ctx.to_location
        pp.work_order = ctx.work_order
        pp.save()

        return movement


class TrackerStatusBehavior:
    """
    Handles DB operations for TrackerEngine status transitions.

    The engine computes what should happen (pure); this strategy executes it.
    """

    @staticmethod
    def execute_status_change(engine, delta_payload: Dict[str, Any]) -> Dict[str, int]:
        """
        Fetch item from DB, delegate transition validation to the engine,
        persist the status change, and return fresh status counts.

        Args:
            engine: A TrackerEngine instance (pure computation).
            delta_payload: Must contain 'physical_product_id' and 'new_status'.

        Returns:
            Dict mapping status strings to counts for the product model.
        """
        from django.db import models as db_models

        pp_id = delta_payload.get('physical_product_id')
        if not pp_id:
            raise InvalidEngineConfigError(detail="physical_product_id is required")

        notes = delta_payload.get('notes') or ''
        user = delta_payload.get('user')

        # `select_for_update` requires an enclosing transaction; the widget
        # transaction service does not start one, so wrap the lock + write
        # here. Without this, the row-level lock raises
        # "select_for_update cannot be used outside of a transaction".
        with transaction.atomic():
            try:
                item = PhysicalProduct.objects.select_for_update().get(id=pp_id)
            except PhysicalProduct.DoesNotExist:
                raise ItemNotFoundError(detail="Physical product not found")

            # Engine does pure validation — no DB access
            result = engine.process_transaction(
                current_stock={"current_status": item.status},
                delta_payload=delta_payload,
            )

            old_status = result["old_status"]
            new_status = result["new_status"]

            # Persist status change (bypass full_clean for status-only update)
            PhysicalProduct.objects.filter(id=item.id).update(status=new_status)

            # Audit row: quantity=0 self-loop carries the status delta in
            # `reason` (Movement has no metadata column). Skipped when the
            # item has no location, since Movement requires both endpoints.
            if item.location_id is not None:
                reason_text = f"Status: {old_status} → {new_status}"
                if notes:
                    reason_text = f"{reason_text} — {notes}"
                Movement.objects.create(
                    product_model=item.product_model,
                    physical_product=item,
                    from_location=item.location,
                    to_location=item.location,
                    quantity=Decimal('0'),
                    performed_by=user,
                    reason=reason_text[:255],
                )

            # Build fresh status counts
            product_model = getattr(engine.product, 'model', engine.product)
            counts = dict(
                PhysicalProduct.objects.filter(product_model=product_model)
                .values_list('status')
                .annotate(count=db_models.Count('id'))
            )

        return counts


# --- Profile-keyed factory ---

from .constants import (
    PROFILE_SIMPLE_COUNT, PROFILE_UNIT_CONVERSION, PROFILE_DIMENSIONAL,
    PROFILE_BATCH_TRACKED, PROFILE_PERISHABLE, PROFILE_SERIALIZED,
    PROFILE_ASSEMBLED,
)
# Imported at module load (before any behavior method runs) so the literals
# below resolve from the module namespace.
from .constants import (  # noqa: E402
    LOCATION_TYPE_VIRTUAL, SOURCE_DOCUMENT_PURCHASE, RESERVATION_STATUS_ACTIVE,
)

BEHAVIOR_MAP = {
    PROFILE_SIMPLE_COUNT: BulkBehavior,
    PROFILE_UNIT_CONVERSION: BulkBehavior,
    PROFILE_DIMENSIONAL: BulkBehavior,
    PROFILE_BATCH_TRACKED: BatchBehavior,
    PROFILE_PERISHABLE: BatchBehavior,
    PROFILE_SERIALIZED: SerializedBehavior,
    PROFILE_ASSEMBLED: AssembledBehavior,
}


def get_behavior(profile: str) -> ProfileBehavior:
    """Get the transfer behavior for a given inventory profile."""
    cls = BEHAVIOR_MAP.get(profile)
    if cls is None:
        raise InvalidEngineConfigError(detail=f"No behavior registered for profile '{profile}'")
    return cls()
