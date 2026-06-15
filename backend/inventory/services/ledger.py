from django.db import transaction
from decimal import Decimal
from ..models import Movement, Location, ProductModel, PhysicalProduct
from ..exceptions import InventoryError

class LedgerService:
    @staticmethod
    @transaction.atomic
    def transfer_stock(
        product_model: ProductModel,
        from_location: Location,
        to_location: Location,
        quantity: Decimal,
        user,
        reason: str,
        physical_product: PhysicalProduct = None,
        batch_data: dict = None,  # For creating/selecting batch on arrival
        batch_id: str = None,     # For selecting existing batch on departure
        work_order=None,          # Optional Link to WorkOrder
        idempotency_key: str = None,
        supplier=None,            # Optional Supplier (fornitore) for inbound receipts
        customer=None,            # Optional Customer (cliente) for outbound shipments
        reservation=None,         # Optional Reservation this transfer fulfils (consumed on success)
        source_document=None,     # Optional source document kind (e.g. 'PURCHASE')
        purchase_order_line=None, # Optional PurchaseOrderLine this receipt fulfils
        sales_order_line=None,    # Optional SalesOrderLine this shipment fulfils
        purchased_cost=None,      # Optional explicit receipt unit cost (import onboarding)
    ):
        """
        Executes a stock transfer between two locations.
        Delegates validation and execution to the appropriate ProfileBehavior.
        """
        from ..strategies import TransferContext, get_behavior

        if quantity <= 0:
            raise InventoryError("Transfer quantity must be positive.")

        # Idempotent replay: a retry with a key we already processed returns
        # the original Movement instead of bubbling the unique-constraint
        # IntegrityError up as a 500.
        if idempotency_key:
            existing = Movement.objects.filter(idempotency_key=idempotency_key).first()
            if existing is not None:
                return existing

        context = TransferContext(
            product_model=product_model,
            from_location=from_location,
            to_location=to_location,
            quantity=quantity,
            user=user,
            reason=reason,
            physical_product=physical_product,
            batch_data=batch_data,
            batch_id=batch_id,
            work_order=work_order,
            idempotency_key=idempotency_key,
            supplier=supplier,
            customer=customer,
            reservation=reservation,
            source_document=source_document,
            purchase_order_line=purchase_order_line,
            sales_order_line=sales_order_line,
            purchased_cost=purchased_cost,
        )

        behavior = get_behavior(product_model.profile)
        behavior.validate(context)
        movement = behavior.execute(context)

        if reservation is not None:
            from .reservations import ReservationService
            ReservationService.consume(reservation)

        # COSTING-06: maintain weighted-average cost / freeze COGS. This is the
        # single choke point every movement passes through. Runs inside the
        # same atomic block (transfer_stock is @transaction.atomic). Internal
        # physical→physical transfers are a no-op inside apply().
        from .costing import CostingService
        CostingService.apply(movement)

        return movement
