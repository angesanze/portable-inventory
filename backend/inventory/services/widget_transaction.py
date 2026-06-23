import logging
import uuid

from django.core.exceptions import ValidationError
from django.db import transaction
from decimal import Decimal, InvalidOperation
from ..models import Movement, Location, ProductModel, PhysicalProduct, WorkOrder
from ..engines import EngineFactory
from .ledger import LedgerService
from .stock import StockService
from .batch_manager import BatchManagerService
from .work_order_fulfillment import WorkOrderFulfillmentService
from ..exceptions import (
    InventoryError, InsufficientStockError, InvalidEngineConfigError,
    ItemNotFoundError,
)

logger = logging.getLogger('inventory.widget')


class WidgetTransactionService:
    """Handles check-in/check-out transaction processing."""

    @staticmethod
    def _resolve_location(company, data, api_key_default_location):
        """Resolve the physical warehouse via the 3-tier precedence:
        explicit ``location_id`` → API key default → single-location company.
        Raises InventoryError when ambiguous or absent.
        """
        location_id = data.get('location_id')
        warehouse = None

        # 1. Explicit location_id from request
        if location_id:
            warehouse = Location.objects.filter(id=location_id, company=company).first()

        # 2. API key default_location
        if not warehouse and api_key_default_location:
            warehouse = api_key_default_location

        # 3. Single-location company — use it unambiguously
        if not warehouse:
            physical_locations = Location.objects.filter(
                company=company, type__in=['WAREHOUSE', 'PHYSICAL', 'STORE']
            )
            count = physical_locations.count()
            if count == 1:
                warehouse = physical_locations.first()
            elif count > 1:
                raise InventoryError(
                    detail="Multiple locations found. Specify a location_id or set a default location on the API key."
                )
            else:
                raise InventoryError(detail="Configuration Error: No Warehouse found.")

        return warehouse

    @staticmethod
    def _resolve_external_location(company):
        """Resolve (or create) the VIRTUAL 'External' counterparty location."""
        external = Location.objects.filter(company=company, type='VIRTUAL', name='External').first()
        if not external:
            external = Location.objects.filter(company=company, type='VIRTUAL').first()
        if not external:
            external = Location.objects.create(company=company, name='External', type='VIRTUAL')
        return external

    @staticmethod
    def _handle_tracker_status_change(product, engine, effective_engine, operation, data):
        """Dispatch a non-numeric tracker ``status_change``.

        Returns the success payload dict when handled, or ``None`` when this is
        not a tracker status_change (so the caller continues normal processing).
        """
        is_tracker_status_change = (
            not engine.returns_numeric_delta
            and effective_engine == 'tracker'
            and (operation == 'status_change' or data.get('new_status'))
        )
        if not is_tracker_status_change:
            return None

        try:
            # Resolve physical_identifier → physical_product_id (TrackerStatusBehavior expects pk)
            resolved_payload = dict(data)
            # The widget path is unauthenticated/public: never let a client-
            # supplied attribution leak into the audit trail. strategies.py
            # `execute_status_change` reads `delta_payload.get('user')` and
            # writes it to `Movement.performed_by`, so a forged `user`/
            # `performed_by` here would fabricate who did the change. Force the
            # actor to None (anonymous widget action).
            resolved_payload.pop('user', None)
            resolved_payload.pop('performed_by', None)
            if not resolved_payload.get('physical_product_id'):
                ident = resolved_payload.get('physical_identifier')
                if ident:
                    match = PhysicalProduct.objects.filter(
                        product_model=product, identifier=ident
                    ).first()
                    if not match:
                        raise ItemNotFoundError(detail="Physical Product not found")
                    resolved_payload['physical_product_id'] = str(match.id)
            from ..strategies import TrackerStatusBehavior  # inline import: breaks the services import cycle (strategies imports StockService)
            result = TrackerStatusBehavior.execute_status_change(engine, resolved_payload)
            return {"success": True, "product": product, "status_counts": result}
        except InventoryError:
            raise
        except (ValueError, TypeError) as e:
            raise InvalidEngineConfigError(detail=str(e))
        except Exception as e:
            logger.exception("Unexpected error in tracker status_change")
            raise InventoryError(detail=str(e))

    @staticmethod
    def _build_dimension_payload(product, engine, data):
        """Validate dimension values and compute the quantity for the ledger.

        Returns the absolute Decimal quantity derived from the engine formula.
        """
        dimensions = (product.engine_config or {}).get('dimensions', [])
        for dim in dimensions:
            val = data.get(dim)
            if val is None:
                raise InvalidEngineConfigError(detail=f"Missing dimension value: {dim}")
            try:
                float(val)
            except (ValueError, TypeError):
                raise InvalidEngineConfigError(
                    detail=f"Dimension '{dim}' must be numeric",
                    validation_errors={dim: 'must be numeric'},
                )
        # Compute qty from formula for ledger. The dimension engine works in
        # float (formula eval); convert once via str so the ledger keeps a
        # clean Decimal.
        try:
            return Decimal(str(abs(engine.calculate_delta(data))))
        except (ValueError, TypeError) as e:
            raise InvalidEngineConfigError(detail=str(e))
        except InventoryError:
            raise
        except Exception as e:
            logger.exception("Unexpected error calculating dimension delta")
            raise InventoryError(detail=str(e))

    @staticmethod
    def _build_time_based_payload(data):
        """Validate and collect time-based expiry metadata for the batch.

        Returns a dict with optional ``expiry_date`` / ``batch_ref`` keys.
        """
        time_based_batch_data = {}
        expiry_date = data.get('expiry_date')
        batch_ref = data.get('batch_ref')
        if expiry_date:
            # Stored as a string in ProductBatch.data — a malformed date
            # would silently never expire and never trigger monitoring.
            from django.utils.dateparse import parse_datetime, parse_date
            if not (parse_datetime(str(expiry_date)) or parse_date(str(expiry_date))):
                raise InvalidEngineConfigError(
                    detail=f"Invalid expiry_date: '{expiry_date}'. Use YYYY-MM-DD or ISO datetime.",
                    validation_errors={'expiry_date': 'invalid date format'},
                )
            time_based_batch_data['expiry_date'] = expiry_date
        if batch_ref:
            time_based_batch_data['batch_ref'] = batch_ref
        return time_based_batch_data

    @staticmethod
    def _build_batch_tracked_payload(product, operation, data, time_based_batch_data):
        """Assemble the ``batch_data`` payload for the ledger transfer.

        Seeds from ``bucket_data`` for BATCH_TRACKED adds, then merges any
        time-based expiry metadata.
        """
        batch_data = {}
        if product.profile == 'BATCH_TRACKED':
            if operation == 'add':
                batch_data = data.get('bucket_data', {})

        # Merge time-based expiry metadata into batch_data
        if time_based_batch_data:
            if not batch_data:
                batch_ref = time_based_batch_data.get('batch_ref', f"TB-{uuid.uuid4().hex[:6].upper()}")
                batch_data = {
                    'batch_identifier': batch_ref,
                    'data': {'expiry_date': time_based_batch_data.get('expiry_date')},
                }
            else:
                batch_data.setdefault('data', {}).update(time_based_batch_data)

        return batch_data

    @staticmethod
    def process_transaction(company, api_key, pk, data):
        """
        Handle stock updates (add/subtract) or batch management operations.
        Returns a dict with success data payload.
        Raises InventoryError (or subclass) on any error.

        api_key: ApiKey model instance (or a string label for backward compat).
        """
        # Support both ApiKey object and plain string (backward compat)
        if isinstance(api_key, str):
            api_key_label = api_key
            api_key_default_location = None
        else:
            api_key_label = api_key.label
            api_key_default_location = getattr(api_key, 'default_location', None)
        operation = data.get('operation')

        # 1. Handle WorkOrder (Batch Manager) context
        work_order = WorkOrder.objects.filter(id=pk, company=company).first()
        if work_order:
            if operation in ['batch_update_item', 'produce_kit']:
                return BatchManagerService.handle_batch_manager_transaction(work_order, data)
            if operation == 'fulfill':
                return WorkOrderFulfillmentService.fulfill(
                    work_order, idempotency_key=data.get('idempotency_key')
                )
            raise InventoryError(detail="Invalid operation for Batch Manager")

        # 2. Handle ProductModel context
        product = ProductModel.objects.filter(id=pk, company=company).first()
        if not product:
            raise ItemNotFoundError(detail="ProductModel not found")

        # SPECIAL: If produce_kit called on a ProductModel, create a new WorkOrder
        if operation == 'produce_kit' and product.components.exists():
            # Create new Work Order. The WO-create and the batch-manager call
            # must share ONE transaction: handle_batch_manager_transaction has
            # its own (nested) atomic, so if it raises, an outer-committed WO
            # would be orphaned (a WorkOrder with no kit production booked).
            # Wrapping both makes the WO roll back alongside the failed batch
            # production.
            wo_name = f"{product.sku}-BATCH-{uuid.uuid4().hex[:6].upper()}"
            with transaction.atomic():
                new_wo = WorkOrder.objects.create(
                    company=company,
                    name=wo_name,
                    product_model=product,
                    status='OPEN'
                )
                BatchManagerService.handle_batch_manager_transaction(new_wo, data)
            return {
                "success": True,
                "work_order_id": str(new_wo.id),
                "message": f"Created new Batch {wo_name}"
            }

        # Determine Locations defaults (3-tier warehouse + external counterparty)
        warehouse = WidgetTransactionService._resolve_location(
            company, data, api_key_default_location
        )
        external = WidgetTransactionService._resolve_external_location(company)

        # Resolve engine for engine-specific dispatch
        effective_engine = product.engine_type
        engine = EngineFactory.get_engine_for_profile(product)

        # --- Non-numeric delta engines: handle special operations ---
        tracker_result = WidgetTransactionService._handle_tracker_status_change(
            product, engine, effective_engine, operation, data
        )
        if tracker_result is not None:
            return tracker_result

        # Parse straight to Decimal (the ledger's type) — going via float first
        # would bake in binary representation error before the ledger sees it.
        try:
            qty = Decimal(str(data.get('quantity', 0)))
        except (InvalidOperation, ValueError, TypeError):
            raise InventoryError(detail="Invalid quantity")
        if qty <= 0 and operation != 'batch_update_item':
            raise InventoryError(detail="Invalid quantity")

        # --- Dimension Engine: validate dimension values before proceeding ---
        if effective_engine == 'dimension' and operation in ('add', 'subtract'):
            qty = WidgetTransactionService._build_dimension_payload(product, engine, data)

        # --- TimeBased Engine: attach expiry metadata to batch_data ---
        time_based_batch_data = {}
        if effective_engine == 'time_based' and operation == 'add':
            time_based_batch_data = WidgetTransactionService._build_time_based_payload(data)

        # Resolve Physical Product if provided
        physical_product = None
        pp_id = data.get('physical_product_id')
        pp_ident = data.get('physical_identifier')

        if pp_id or pp_ident:
            qs = PhysicalProduct.objects.filter(product_model=product)
            if pp_id:
                physical_product = qs.filter(id=pp_id).first()
            elif pp_ident:
                physical_product = qs.filter(identifier=pp_ident).first()

            if not physical_product and (pp_id or pp_ident):
                raise ItemNotFoundError(detail="Physical Product not found")

        if operation == 'subtract':
            source = warehouse
            destination = external
            reason = "Widget Consumption"

            # FIFO Fallback implementation. NULL batch_date sorts last so
            # undated items are only consumed once every dated one is gone.
            if not physical_product and product.tracking_mode == 'INDIVIDUAL':
                from django.db.models import F
                candidate = PhysicalProduct.objects.filter(
                    product_model=product,
                    location=source,
                    status='ACTIVE'
                ).exclude(
                    reservations__status='ACTIVE'
                ).order_by(F('batch_date').asc(nulls_last=True), 'identifier').first()

                if candidate:
                    physical_product = candidate
                else:
                    raise InsufficientStockError(
                        detail=f"No active items found in {source.name} to subtract."
                    )

        elif operation == 'add':
            source = external
            destination = warehouse
            reason = "Widget Inbound"
        else:
            raise InventoryError(detail="Invalid operation")

        # Prepare Batch Data (BATCH_TRACKED bucket seed + time-based merge)
        batch_data = WidgetTransactionService._build_batch_tracked_payload(
            product, operation, data, time_based_batch_data
        )

        batch_id = data.get('bucket_id')

        # Client-supplied idempotency key (offline queue retries). Must be a
        # UUID — Movement.idempotency_key is a UUIDField.
        idempotency_key = data.get('idempotency_key')
        if idempotency_key:
            try:
                idempotency_key = str(uuid.UUID(str(idempotency_key)))
            except (ValueError, AttributeError, TypeError):
                raise InventoryError(detail="idempotency_key must be a valid UUID")

        try:
            LedgerService.transfer_stock(
                product_model=product,
                from_location=source,
                to_location=destination,
                quantity=qty,
                user=None,
                reason=f"{reason} [{api_key_label}]",
                batch_data=batch_data,
                batch_id=batch_id,
                physical_product=physical_product,
                idempotency_key=idempotency_key,
            )

            return {
                "success": True,
                "product": product
            }

        except InventoryError:
            raise
        except ValidationError as e:
            raise InventoryError(detail=str(e))
        except Exception as e:
            logger.exception("Unexpected error in process_transaction")
            raise InventoryError(detail=str(e))
