from django.db import transaction
from rest_framework import serializers

from ..models import (
    Location, PhysicalProduct, ProductBatch, ProductModel,
    TransferOrder, TransferOrderLine,
)
from ..models.transfers import TR_STATUS_DRAFT
from .orders_base import CompanyScopedOrderSerializerMixin


class TransferOrderLineSerializer(serializers.ModelSerializer):
    product_model_id = serializers.UUIDField(write_only=True)
    batch_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    physical_product_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    product_model = serializers.PrimaryKeyRelatedField(read_only=True)
    product_sku = serializers.CharField(source='product_model.sku', read_only=True)
    product_name = serializers.CharField(source='product_model.name', read_only=True)
    product_profile = serializers.CharField(source='product_model.profile', read_only=True)
    batch = serializers.PrimaryKeyRelatedField(read_only=True)
    physical_product = serializers.PrimaryKeyRelatedField(read_only=True)
    quantity_in_transit = serializers.DecimalField(max_digits=12, decimal_places=4, read_only=True)

    class Meta:
        model = TransferOrderLine
        fields = [
            'id', 'product_model_id', 'product_model',
            'product_sku', 'product_name', 'product_profile',
            'batch_id', 'batch', 'physical_product_id', 'physical_product',
            'quantity_sent', 'quantity_received', 'quantity_shortage',
            'quantity_in_transit',
        ]
        read_only_fields = ['id', 'quantity_received', 'quantity_shortage']

    def validate_quantity_sent(self, value):
        if value <= 0:
            raise serializers.ValidationError("Sent quantity must be positive.")
        return value


class TransferOrderSerializer(CompanyScopedOrderSerializerMixin, serializers.ModelSerializer):
    """TransferOrder with writable nested lines (writes only while DRAFT).

    ``number`` is server-generated under a company lock; ``status`` only moves
    through the ship/receive/shortage/cancel actions, never by direct write.
    """
    lines = TransferOrderLineSerializer(many=True)
    from_location_id = serializers.UUIDField(write_only=True)
    to_location_id = serializers.UUIDField(write_only=True)

    from_location = serializers.PrimaryKeyRelatedField(read_only=True)
    to_location = serializers.PrimaryKeyRelatedField(read_only=True)
    from_location_name = serializers.CharField(source='from_location.name', read_only=True)
    to_location_name = serializers.CharField(source='to_location.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = TransferOrder
        fields = [
            'id', 'number', 'status', 'notes',
            'from_location_id', 'from_location', 'from_location_name',
            'to_location_id', 'to_location', 'to_location_name',
            'lines', 'shipped_at', 'received_at',
            'created_by_username', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'number', 'status', 'shipped_at', 'received_at',
            'created_at', 'updated_at',
        ]

    def validate(self, attrs):
        company = self._resolve_company() or (self.instance.company if self.instance else None)
        if company is None:
            raise serializers.ValidationError("A company context is required.")

        from_id = attrs.pop('from_location_id', None)
        to_id = attrs.pop('to_location_id', None)
        if from_id:
            attrs['from_location'] = self._location(company, from_id, 'from_location_id')
        elif not self.instance:
            raise serializers.ValidationError({'from_location_id': 'Required.'})
        if to_id:
            attrs['to_location'] = self._location(company, to_id, 'to_location_id')
        elif not self.instance:
            raise serializers.ValidationError({'to_location_id': 'Required.'})

        src = attrs.get('from_location') or (self.instance.from_location if self.instance else None)
        dst = attrs.get('to_location') or (self.instance.to_location if self.instance else None)
        if src and dst and src.id == dst.id:
            raise serializers.ValidationError({'to_location_id': 'Source and destination must differ.'})

        lines = attrs.get('lines')
        if lines is not None:
            if not lines:
                raise serializers.ValidationError({'lines': 'At least one line is required.'})
            for line in lines:
                self._resolve_line(company, line)
        return attrs

    def _location(self, company, loc_id, field):
        try:
            return Location.objects.get(id=loc_id, company=company)
        except Location.DoesNotExist:
            raise serializers.ValidationError({field: 'Location not found.'})

    def _resolve_line(self, company, line):
        product_id = line.pop('product_model_id', None)
        try:
            line['product_model'] = ProductModel.objects.get(id=product_id, company=company)
        except ProductModel.DoesNotExist:
            raise serializers.ValidationError({'lines': f'Product {product_id} not found.'})

        batch_id = line.pop('batch_id', None)
        if batch_id:
            try:
                line['batch'] = ProductBatch.objects.get(id=batch_id, product_model=line['product_model'])
            except ProductBatch.DoesNotExist:
                raise serializers.ValidationError({'lines': f'Batch {batch_id} not found.'})
        pp_id = line.pop('physical_product_id', None)
        if pp_id:
            try:
                line['physical_product'] = PhysicalProduct.objects.get(
                    id=pp_id, product_model=line['product_model'],
                )
            except PhysicalProduct.DoesNotExist:
                raise serializers.ValidationError({'lines': f'Item {pp_id} not found.'})

    def create(self, validated_data):
        from ..services.transfers import TransferService

        lines_data = validated_data.pop('lines')
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        with transaction.atomic():
            validated_data['number'] = TransferService.next_number(validated_data['company'])
            if user is not None and getattr(user, 'is_authenticated', False):
                validated_data['created_by'] = user
            order = TransferOrder.objects.create(**validated_data)
            for line_data in lines_data:
                TransferOrderLine.objects.create(transfer_order=order, **line_data)
        return order

    def update(self, instance, validated_data):
        if instance.status != TR_STATUS_DRAFT:
            raise serializers.ValidationError("Only DRAFT transfers can be edited.")
        lines_data = validated_data.pop('lines', None)
        validated_data.pop('company', None)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if lines_data is not None:
                instance.lines.all().delete()
                for line_data in lines_data:
                    TransferOrderLine.objects.create(transfer_order=instance, **line_data)
        return instance
