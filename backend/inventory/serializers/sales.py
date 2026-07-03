from django.db import transaction
from rest_framework import serializers

from ..models import Customer, ProductModel, SalesOrder, SalesOrderLine
from ..models.sales import SO_STATUS_DRAFT
from .orders_base import CompanyScopedOrderSerializerMixin


class SalesOrderLineSerializer(serializers.ModelSerializer):
    product_model_id = serializers.UUIDField(write_only=True)
    # Read counterpart of product_model_id (frontend edit prefill).
    product_model = serializers.PrimaryKeyRelatedField(read_only=True)
    product_sku = serializers.CharField(source="product_model.sku", read_only=True)
    product_name = serializers.CharField(source="product_model.name", read_only=True)
    product_profile = serializers.CharField(source="product_model.profile", read_only=True)
    quantity_pending = serializers.DecimalField(max_digits=12, decimal_places=4, read_only=True)

    class Meta:
        model = SalesOrderLine
        fields = [
            "id",
            "product_model_id",
            "product_model",
            "product_sku",
            "product_name",
            "product_profile",
            "quantity_ordered",
            "unit_price",
            "quantity_shipped",
            "quantity_pending",
        ]
        read_only_fields = ["id", "quantity_shipped"]

    def validate_quantity_ordered(self, value):
        if value <= 0:
            raise serializers.ValidationError("Ordered quantity must be positive.")
        return value


class SalesOrderSerializer(CompanyScopedOrderSerializerMixin, serializers.ModelSerializer):
    """SalesOrder with writable nested lines (writes only while DRAFT).

    ``number`` is server-generated (SalesService.next_number under a company
    lock); ``status`` only changes via the confirm/ship/cancel actions, never by
    direct write.
    """

    lines = SalesOrderLineSerializer(many=True)
    customer_id = serializers.UUIDField(write_only=True)
    # Read counterpart of customer_id (frontend edit prefill).
    customer = serializers.PrimaryKeyRelatedField(read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=None
    )

    class Meta:
        model = SalesOrder
        fields = [
            "id",
            "number",
            "status",
            "promised_at",
            "notes",
            "customer_id",
            "customer",
            "customer_name",
            "lines",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "number", "status", "created_at", "updated_at"]

    def validate(self, attrs):
        company = self._resolve_company() or (self.instance.company if self.instance else None)
        if company is None:
            raise serializers.ValidationError("A company context is required.")

        customer_id = attrs.pop("customer_id", None)
        if customer_id:
            try:
                attrs["customer"] = Customer.objects.get(id=customer_id, company=company)
            except Customer.DoesNotExist:
                raise serializers.ValidationError({"customer_id": "Customer not found."})
        elif not self.instance:
            raise serializers.ValidationError({"customer_id": "Required."})

        lines = attrs.get("lines")
        if lines is not None:
            if not lines:
                raise serializers.ValidationError({"lines": "At least one line is required."})
            seen_products = set()
            for line in lines:
                product_id = line.pop("product_model_id", None)
                if product_id in seen_products:
                    raise serializers.ValidationError(
                        {"lines": "Each product can appear on only one line."}
                    )
                seen_products.add(product_id)
                try:
                    line["product_model"] = ProductModel.objects.get(id=product_id, company=company)
                except ProductModel.DoesNotExist:
                    raise serializers.ValidationError({"lines": f"Product {product_id} not found."})
        return attrs

    def create(self, validated_data):
        from ..services.sales import SalesService

        lines_data = validated_data.pop("lines")
        request = self.context.get("request")
        user = getattr(request, "user", None)
        with transaction.atomic():
            validated_data["number"] = SalesService.next_number(validated_data["company"])
            if user is not None and getattr(user, "is_authenticated", False):
                validated_data["created_by"] = user
            so = SalesOrder.objects.create(**validated_data)
            for line_data in lines_data:
                SalesOrderLine.objects.create(sales_order=so, **line_data)
        return so

    def update(self, instance, validated_data):
        if instance.status != SO_STATUS_DRAFT:
            raise serializers.ValidationError("Only DRAFT orders can be edited.")
        lines_data = validated_data.pop("lines", None)
        validated_data.pop("company", None)  # company never changes
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if lines_data is not None:
                # DRAFT lines have no shipments, so replace-all is safe.
                instance.lines.all().delete()
                for line_data in lines_data:
                    SalesOrderLine.objects.create(sales_order=instance, **line_data)
        return instance
