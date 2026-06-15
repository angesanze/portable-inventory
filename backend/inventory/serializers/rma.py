from django.db import transaction
from rest_framework import serializers

from .. import constants
from ..models import (
    Customer, PhysicalProduct, ProductBatch, ProductModel, PurchaseOrder,
    ReturnOrder, ReturnOrderLine, SalesOrder, Supplier,
)
from .orders_base import CompanyScopedOrderSerializerMixin


class ReturnOrderLineSerializer(serializers.ModelSerializer):
    product_model_id = serializers.UUIDField(write_only=True)
    physical_product_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    batch_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    # Read counterparts (frontend prefill).
    product_model = serializers.PrimaryKeyRelatedField(read_only=True)
    physical_product = serializers.PrimaryKeyRelatedField(read_only=True)
    product_sku = serializers.CharField(source='product_model.sku', read_only=True)
    product_name = serializers.CharField(source='product_model.name', read_only=True)
    product_profile = serializers.CharField(source='product_model.profile', read_only=True)
    physical_identifier = serializers.CharField(source='physical_product.identifier', read_only=True, default=None)

    class Meta:
        model = ReturnOrderLine
        fields = [
            'id', 'product_model_id', 'product_model',
            'product_sku', 'product_name', 'product_profile',
            'physical_product_id', 'physical_product', 'physical_identifier',
            'batch_id', 'quantity', 'resolution', 'resolved_at',
        ]
        read_only_fields = ['id', 'resolution', 'resolved_at']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive.")
        return value


class ReturnOrderSerializer(CompanyScopedOrderSerializerMixin, serializers.ModelSerializer):
    """ReturnOrder with writable nested lines (writes only while OPEN).

    ``number`` is server-generated (RmaService.next_number under a company
    lock); ``status`` only changes via the receive/resolve/cancel actions.
    """
    lines = ReturnOrderLineSerializer(many=True)
    customer_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    supplier_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    sales_order_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    purchase_order_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    # Read counterparts.
    customer = serializers.PrimaryKeyRelatedField(read_only=True)
    supplier = serializers.PrimaryKeyRelatedField(read_only=True)
    sales_order = serializers.PrimaryKeyRelatedField(read_only=True)
    purchase_order = serializers.PrimaryKeyRelatedField(read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True, default=None)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default=None)
    sales_order_number = serializers.CharField(source='sales_order.number', read_only=True, default=None)
    purchase_order_number = serializers.CharField(source='purchase_order.number', read_only=True, default=None)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = ReturnOrder
        fields = [
            'id', 'number', 'kind', 'status', 'reason_code', 'notes',
            'customer_id', 'customer', 'customer_name',
            'supplier_id', 'supplier', 'supplier_name',
            'sales_order_id', 'sales_order', 'sales_order_number',
            'purchase_order_id', 'purchase_order', 'purchase_order_number',
            'lines', 'created_by_username', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'number', 'status', 'created_at', 'updated_at']

    def validate(self, attrs):
        company = self._resolve_company() or (self.instance.company if self.instance else None)
        if company is None:
            raise serializers.ValidationError("A company context is required.")

        kind = attrs.get('kind') or (self.instance.kind if self.instance else None)

        customer_id = attrs.pop('customer_id', None)
        supplier_id = attrs.pop('supplier_id', None)
        sales_order_id = attrs.pop('sales_order_id', None)
        purchase_order_id = attrs.pop('purchase_order_id', None)

        if customer_id:
            try:
                attrs['customer'] = Customer.objects.get(id=customer_id, company=company)
            except Customer.DoesNotExist:
                raise serializers.ValidationError({'customer_id': 'Customer not found.'})
        if supplier_id:
            try:
                attrs['supplier'] = Supplier.objects.get(id=supplier_id, company=company)
            except Supplier.DoesNotExist:
                raise serializers.ValidationError({'supplier_id': 'Supplier not found.'})
        if sales_order_id:
            try:
                attrs['sales_order'] = SalesOrder.objects.get(id=sales_order_id, company=company)
            except SalesOrder.DoesNotExist:
                raise serializers.ValidationError({'sales_order_id': 'Sales order not found.'})
        if purchase_order_id:
            try:
                attrs['purchase_order'] = PurchaseOrder.objects.get(id=purchase_order_id, company=company)
            except PurchaseOrder.DoesNotExist:
                raise serializers.ValidationError({'purchase_order_id': 'Purchase order not found.'})

        if not self.instance:
            if kind == constants.RMA_KIND_CUSTOMER_RETURN and 'customer' not in attrs:
                raise serializers.ValidationError({'customer_id': 'A customer return requires a customer.'})
            if kind == constants.RMA_KIND_SUPPLIER_RETURN and 'supplier' not in attrs:
                raise serializers.ValidationError({'supplier_id': 'A supplier return requires a supplier.'})

        lines = attrs.get('lines')
        if lines is not None:
            if not lines:
                raise serializers.ValidationError({'lines': 'At least one line is required.'})
            for line in lines:
                product_id = line.pop('product_model_id', None)
                try:
                    line['product_model'] = ProductModel.objects.get(id=product_id, company=company)
                except ProductModel.DoesNotExist:
                    raise serializers.ValidationError({'lines': f'Product {product_id} not found.'})

                pp_id = line.pop('physical_product_id', None)
                if pp_id:
                    try:
                        line['physical_product'] = PhysicalProduct.objects.get(
                            id=pp_id, product_model=line['product_model'],
                        )
                    except PhysicalProduct.DoesNotExist:
                        raise serializers.ValidationError({'lines': f'Item {pp_id} not found.'})

                batch_pk = line.pop('batch_id', None)
                if batch_pk:
                    try:
                        line['batch'] = ProductBatch.objects.get(
                            id=batch_pk, product_model=line['product_model'],
                        )
                    except ProductBatch.DoesNotExist:
                        raise serializers.ValidationError({'lines': f'Batch {batch_pk} not found.'})
        return attrs

    def create(self, validated_data):
        from ..services.rma import RmaService

        lines_data = validated_data.pop('lines')
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        with transaction.atomic():
            validated_data['number'] = RmaService.next_number(validated_data['company'])
            if user is not None and getattr(user, 'is_authenticated', False):
                validated_data['created_by'] = user
            rma = ReturnOrder.objects.create(**validated_data)
            for line_data in lines_data:
                ReturnOrderLine.objects.create(return_order=rma, **line_data)
        return rma

    def update(self, instance, validated_data):
        if instance.status != constants.RMA_STATUS_OPEN:
            raise serializers.ValidationError("Only OPEN returns can be edited.")
        lines_data = validated_data.pop('lines', None)
        validated_data.pop('company', None)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if lines_data is not None:
                instance.lines.all().delete()
                for line_data in lines_data:
                    ReturnOrderLine.objects.create(return_order=instance, **line_data)
        return instance
