from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from .models import Location, PhysicalProduct, WorkOrder
from .services import LedgerService, CounterpartyService
from .engines import EngineFactory
from .exceptions import InventoryError, InvalidEngineConfigError
from . import constants

class InventoryOrchestrator:
    @staticmethod
    def resolve_or_create_item(product_model, identifier, from_loc, inbound=True):
        """Get-or-create the PhysicalProduct for an identifier on a movement.

        Shared by the widget movement flow and purchase-order receiving
        (PURCHASE-ORDERS-03) so serial creation/reactivation lives in one
        place: a new item is born at the source location (the ledger then
        moves it), and an inbound on a dormant item reactivates it.
        """
        physical_product, created = PhysicalProduct.objects.get_or_create(
            product_model=product_model,
            identifier=identifier,
            defaults={'location': from_loc, 'status': constants.PHYSICAL_STATUS_ACTIVE}
        )

        # Re-activate a dormant item on inbound. An already-ACTIVE item is left
        # as-is (double check-in is intentionally tolerated — just move it).
        if not created and inbound and physical_product.status != constants.PHYSICAL_STATUS_ACTIVE:
            physical_product.status = constants.PHYSICAL_STATUS_ACTIVE
            physical_product.save()

        return physical_product

    @staticmethod
    @transaction.atomic
    def handle_widget_movement(
        company,
        product_model,
        location,
        data: dict
    ):
        """
        Orchestrates a movement from the widget API.
        Handles:
        - Calculator logic (calc_payload)
        - Virtual location resolution (Inbound/Outbound)
        - Physical Product lifecycle (Create/Activate)
        - LedgerService execution

        Atomic: ``resolve_or_create_item`` may create or reactivate a
        PhysicalProduct *before* the ledger transfer. Without this wrapper a
        ledger failure would leave that phantom item / spurious reactivation
        committed. The ledger's own atomic block nests as a savepoint.
        """
        calc_payload = data.get('calc_payload')
        raw_quantity = data.get('quantity')
        reason = data.get('reason', 'Widget Adjustment')
        
        # Tracking specifics
        item_identifier = data.get('item_identifier') or data.get('physical_identifier')
        batch_id = data.get('batch_id')
        batch_data = data.get('batch_data')
        work_order_id = data.get('work_order_id')
        idempotency_key = data.get('idempotency_key')
        
        work_order = None
        if work_order_id:
            try:
                work_order = WorkOrder.objects.get(id=work_order_id, company=company)
            except WorkOrder.DoesNotExist:
                raise ValidationError(f"WorkOrder {work_order_id} not found.")

        # 1. Calculate Quantity
        if calc_payload:
            engine = EngineFactory.get_engine_for_profile(product_model)
            try:
                quantity = Decimal(str(engine.calculate_delta(calc_payload)))
            except InventoryError:
                raise
            except (ValueError, TypeError) as e:
                raise InvalidEngineConfigError(detail=f"Calculator Error: {str(e)}")
        elif raw_quantity is not None:
            quantity = Decimal(str(raw_quantity))
        else:
            raise ValidationError("Either calc_payload or quantity is required.")

        # 2. Handle Direction
        # The counterparty is the virtual location the change is booked against.
        # A manual giacenza edit is an ADJUSTMENT (rettifica), not a VENDOR
        # receipt — so this defaults to ADJUSTMENT and callers must opt in to
        # 'VENDOR' for genuine supplier inbound. This keeps movements precise:
        # "Inventory Adjustment → Warehouse" instead of "External Vendor → Warehouse".
        counterparty_kind = data.get('counterparty') or constants.COUNTERPARTY_ADJUSTMENT
        counterparty = CounterpartyService.resolve(company, counterparty_kind)

        from_loc = counterparty if quantity > 0 else location
        to_loc = location if quantity > 0 else counterparty
        abs_qty = abs(quantity)

        # 3. Handle Item Retrieval/Creation
        physical_product = None
        if item_identifier:
            physical_product = InventoryOrchestrator.resolve_or_create_item(
                product_model, item_identifier, from_loc, inbound=quantity > 0,
            )

        # FIFO Fallback for Subtraction (if no identifier provided but required)
        if not physical_product and quantity < 0 and product_model.tracking_mode == constants.TRACKING_MODE_INDIVIDUAL:
             from django.db.models import F
             # Try to find one in the source location. NULL batch_date sorts
             # last so undated items are consumed after every dated one.
             candidate = PhysicalProduct.objects.filter(
                 product_model=product_model,
                 location=from_loc,
                 status=constants.PHYSICAL_STATUS_ACTIVE
             ).exclude(
                 reservations__status='ACTIVE'
             ).order_by(F('batch_date').asc(nulls_last=True), 'identifier').first()
             
             if candidate:
                 physical_product = candidate
             # If still None, LedgerService will validation error, which is correct behavior if truly none exist

        # 4. Execute Transfer via LedgerService
        try:
            LedgerService.transfer_stock(
                product_model=product_model,
                from_location=from_loc,
                to_location=to_loc,
                quantity=abs_qty,
                user=None, # Public widget actions are anonymous or system
                reason=reason,
                physical_product=physical_product,
                batch_data=batch_data if quantity > 0 else None,
                batch_id=batch_id if quantity < 0 else None,
                work_order=work_order,
                idempotency_key=idempotency_key
            )
            return {"status": "success", "quantity": float(quantity)}
            
        except InventoryError:
            raise
        except DjangoValidationError as e:
            raise InventoryError(detail=e.message_dict if hasattr(e, 'message_dict') else str(e))
        except Exception as e:
            raise InventoryError(detail=str(e))
