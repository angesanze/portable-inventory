from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from ..models import WorkOrder, ProductBatch, PhysicalProduct

class WorkOrderListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for WorkOrder listing.

    Exposes ``updated_at`` (free, native model column) and a flattened
    ``product_model_name`` alongside the existing ``product_model_sku`` so the
    list table's "Product model" / "Updated" columns have a real source. The
    heavier ``contents_summary`` (per-row COUNT queries) stays detail-only.
    """
    product_model_sku = serializers.ReadOnlyField(source='product_model.sku')
    product_model_name = serializers.ReadOnlyField(source='product_model.name')

    class Meta:
        model = WorkOrder
        fields = [
            'id', 'name', 'status', 'product_model',
            'product_model_sku', 'product_model_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'company']

class WorkOrderSerializer(serializers.ModelSerializer):
    """Detailed serializer for WorkOrder management and composition."""
    class Meta:
        model = WorkOrder
        fields = [
            'id', 'company', 'name', 'description', 'status',
            'product_model', 'created_at', 'updated_at',
            'items', 'product_model_details', 'contents_summary',
        ]
        # SEC-05: status is lifecycle-managed (fulfill action / services), never
        # mass-assigned via create/PATCH — that would skip the lifecycle.
        read_only_fields = ['id', 'created_at', 'updated_at', 'company', 'status']

    items = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    product_model_details = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_product_model_details(self, obj):
        """Returns flattened details of the linked product model."""
        if obj.product_model:
            return {
                "id": obj.product_model.id,
                "sku": obj.product_model.sku,
                "name": obj.product_model.name
            }
        return None

    def create(self, validated_data):
        """Creates work order and auto-populates items from kit components if needed.

        Delegates the inventory mutation to ``WorkOrderService`` (MOD-02), which
        scopes every item lookup to the work order's company (SEC-01).
        """
        from ..services.work_order import WorkOrderService
        items_data = validated_data.pop('items', [])
        return WorkOrderService.create_with_items(validated_data, items_data)

    contents_summary = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_contents_summary(self, obj):
        """Summarizes the amount of inventory currently assigned to the work order."""
        batch_count = ProductBatch.objects.filter(work_order=obj, quantity__gt=0).count()
        item_count = PhysicalProduct.objects.filter(work_order=obj, status='ACTIVE').count()
        return {
            "batch_count": batch_count,
            "item_count": item_count,
            "total_items": batch_count + item_count
        }

class ProductBatchSerializer(serializers.ModelSerializer):
    """Serializer for ProductBatch items within a Bucket strategy."""
    class Meta:
        model = ProductBatch
        fields = ['id', 'product_model', 'location', 'batch_identifier', 'data', 'quantity', 'work_order', 'created_at']
        read_only_fields = ['id', 'created_at']
