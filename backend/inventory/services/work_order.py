"""WorkOrder creation/composition service.

Extracted from ``WorkOrderSerializer.create`` (MOD-02) so inventory mutation
lives in the service layer rather than the serializer. Every item lookup is
scoped to the work order's company so a tenant can never attach another
tenant's ``PhysicalProduct`` / ``ProductModel`` to its own work order (SEC-01).
"""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework import serializers

from ..models import (
    WorkOrder,
    ProductBatch,
    ProductModel,
    Location,
    ProductComponent,
    PhysicalProduct,
)
from ..constants import LOCATION_TYPE_WAREHOUSE


class WorkOrderService:
    """Creation + item composition for WorkOrders."""

    @staticmethod
    @transaction.atomic
    def create_with_items(validated_data, items_data):
        """Create a WorkOrder and attach its items.

        Args:
            validated_data: serializer-validated WorkOrder fields (incl. the
                effective ``company`` injected by the viewset).
            items_data: list of ``{product_model_id, quantity}`` (batch) or
                ``{physical_product_id}`` (serialized) dicts.

        Returns:
            The created WorkOrder.

        Raises:
            serializers.ValidationError: cross-tenant / missing item, or no
                WAREHOUSE location to host batches.
        """
        company = validated_data.get("company")
        work_order = WorkOrder.objects.create(**validated_data)

        # Helper to find a default location (Warehouse)
        warehouse = Location.objects.filter(company=company, type=LOCATION_TYPE_WAREHOUSE).first()

        # If no explicit items provided but a product_model (Kit) is set,
        # auto-populate components.
        if not items_data and work_order.product_model:
            components = ProductComponent.objects.filter(parent=work_order.product_model)
            for comp in components:
                items_data.append(
                    {
                        "product_model_id": comp.child.id,
                        "quantity": comp.quantity,
                    }
                )

        for item in items_data:
            product_model_id = item.get("product_model_id")
            quantity = item.get("quantity")
            physical_product_id = item.get("physical_product_id")

            # Sanitize empty string to None
            if physical_product_id == "":
                physical_product_id = None

            # Validate quantity up front (only the bulk/batch branch consumes it):
            # a negative value would inject negative BATCH stock outside the ledger,
            # and a non-numeric one would raise deep in ProductBatch.create as an
            # unhandled 500 (COR-11). Coerce to Decimal so the create gets a clean
            # value.
            if quantity is not None and quantity != "":
                try:
                    quantity = Decimal(str(quantity))
                except (InvalidOperation, ValueError, TypeError):
                    raise serializers.ValidationError({"items": f"Invalid quantity: {quantity!r}"})
                if quantity <= 0:
                    raise serializers.ValidationError(
                        {"items": "Quantity must be a positive number."}
                    )

            if physical_product_id:
                # Serialized item assignment. Scope the lookup to the work
                # order's company and save() (runs clean()) instead of a blind
                # .update(): a cross-tenant UUID resolves to nothing and is
                # rejected rather than silently reassigned/moved (SEC-01).
                pp = PhysicalProduct.objects.filter(
                    id=physical_product_id,
                    product_model__company=company,
                ).first()
                if not pp:
                    raise serializers.ValidationError({"items": "Physical product not found."})
                pp.work_order = work_order
                pp.location = warehouse  # Can be None → valid for PhysicalProduct
                pp.save()  # runs clean()
            elif product_model_id and quantity:
                # Handle Bulk/Batch items
                if not warehouse:
                    raise serializers.ValidationError(
                        {
                            "non_field_errors": [
                                "No default 'WAREHOUSE' location found for this company. "
                                "Please create one to manage batches."
                            ]
                        }
                    )

                # Scope the batch's product to the work order's company so a
                # tenant can't seed a batch of another tenant's product (SEC-01).
                if not ProductModel.objects.filter(id=product_model_id, company=company).exists():
                    raise serializers.ValidationError({"items": "Product model not found."})

                ProductBatch.objects.create(
                    product_model_id=product_model_id,
                    work_order=work_order,
                    quantity=quantity,
                    batch_identifier=ProductBatch.make_identifier(work_order, product_model_id),
                    location=warehouse,
                    data={"source": "WorkOrder Composition Auto-Population"}
                    if not items_data
                    else {"source": "WorkOrder Initial Config"},
                )
        return work_order
