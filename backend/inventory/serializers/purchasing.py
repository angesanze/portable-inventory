from django.db import transaction
from rest_framework import serializers

from ..models import ProductModel, PurchaseOrder, PurchaseOrderLine, Supplier
from ..models.purchasing import PO_STATUS_DRAFT
from .orders_base import CompanyScopedOrderSerializerMixin


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    product_model_id = serializers.UUIDField(write_only=True)
    # Read counterpart of product_model_id (frontend edit prefill).
    product_model = serializers.PrimaryKeyRelatedField(read_only=True)
    product_sku = serializers.CharField(source='product_model.sku', read_only=True)
    product_name = serializers.CharField(source='product_model.name', read_only=True)
    product_profile = serializers.CharField(source='product_model.profile', read_only=True)
    quantity_pending = serializers.DecimalField(max_digits=12, decimal_places=4, read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = [
            'id', 'product_model_id', 'product_model',
            'product_sku', 'product_name', 'product_profile',
            'quantity_ordered', 'unit_cost', 'quantity_received', 'quantity_pending',
        ]
        read_only_fields = ['id', 'quantity_received']

    def validate_quantity_ordered(self, value):
        if value <= 0:
            raise serializers.ValidationError("Ordered quantity must be positive.")
        return value


class PurchaseOrderSerializer(CompanyScopedOrderSerializerMixin, serializers.ModelSerializer):
    """PurchaseOrder with writable nested lines (writes only while DRAFT).

    ``number`` is server-generated (PurchasingService.next_number under a
    company lock); ``status`` only changes via the confirm/receive/cancel
    actions, never by direct write.
    """
    lines = PurchaseOrderLineSerializer(many=True)
    supplier_id = serializers.UUIDField(write_only=True)
    # Read counterpart of supplier_id (frontend edit prefill).
    supplier = serializers.PrimaryKeyRelatedField(read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'number', 'status', 'expected_at', 'notes',
            'supplier_id', 'supplier', 'supplier_name', 'lines',
            'created_by_username', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'number', 'status', 'created_at', 'updated_at']

    def validate(self, attrs):
        # `company` is injected by CompanyScopedViewSet.perform_create on
        # create; on update fall back to the instance's company.
        company = self._resolve_company() or (self.instance.company if self.instance else None)
        if company is None:
            raise serializers.ValidationError("A company context is required.")

        supplier_id = attrs.pop('supplier_id', None)
        if supplier_id:
            try:
                attrs['supplier'] = Supplier.objects.get(id=supplier_id, company=company)
            except Supplier.DoesNotExist:
                raise serializers.ValidationError({'supplier_id': 'Supplier not found.'})
        elif not self.instance:
            raise serializers.ValidationError({'supplier_id': 'Required.'})

        lines = attrs.get('lines')
        if lines is not None:
            if not lines:
                raise serializers.ValidationError({'lines': 'At least one line is required.'})
            seen_products = set()
            for line in lines:
                product_id = line.pop('product_model_id', None)
                if product_id in seen_products:
                    raise serializers.ValidationError(
                        {'lines': 'Each product can appear on only one line.'}
                    )
                seen_products.add(product_id)
                try:
                    line['product_model'] = ProductModel.objects.get(id=product_id, company=company)
                except ProductModel.DoesNotExist:
                    raise serializers.ValidationError({'lines': f'Product {product_id} not found.'})
        return attrs

    def create(self, validated_data):
        from ..services.purchasing import PurchasingService

        lines_data = validated_data.pop('lines')
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        with transaction.atomic():
            validated_data['number'] = PurchasingService.next_number(validated_data['company'])
            if user is not None and getattr(user, 'is_authenticated', False):
                validated_data['created_by'] = user
            po = PurchaseOrder.objects.create(**validated_data)
            for line_data in lines_data:
                PurchaseOrderLine.objects.create(purchase_order=po, **line_data)
        return po

    def update(self, instance, validated_data):
        # Viewset already rejects non-DRAFT updates; double-check here so the
        # serializer is safe on its own.
        if instance.status != PO_STATUS_DRAFT:
            raise serializers.ValidationError("Only DRAFT orders can be edited.")
        lines_data = validated_data.pop('lines', None)
        validated_data.pop('company', None)  # company never changes
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if lines_data is not None:
                # DRAFT lines have no receipts, so replace-all is safe.
                instance.lines.all().delete()
                for line_data in lines_data:
                    PurchaseOrderLine.objects.create(purchase_order=instance, **line_data)
        return instance
