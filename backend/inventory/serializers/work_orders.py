from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from ..models import WorkOrder, ProductBatch, Location, ProductComponent, PhysicalProduct

class WorkOrderListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for WorkOrder listing."""
    product_model_sku = serializers.ReadOnlyField(source='product_model.sku')
    
    class Meta:
        model = WorkOrder
        fields = ['id', 'name', 'status', 'product_model', 'product_model_sku', 'created_at']
        read_only_fields = ['id', 'created_at', 'company']

class WorkOrderSerializer(serializers.ModelSerializer):
    """Detailed serializer for WorkOrder management and composition."""
    class Meta:
        model = WorkOrder
        fields = [
            'id', 'company', 'name', 'description', 'status',
            'product_model', 'created_at', 'updated_at',
            'items', 'product_model_details', 'contents_summary',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'company']

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
        """Creates work order and auto-populates items from kit components if needed."""
        items_data = validated_data.pop('items', [])
        work_order = WorkOrder.objects.create(**validated_data)
        
        # Helper to find a default location (Warehouse)
        warehouse = Location.objects.filter(company=work_order.company, type='WAREHOUSE').first()
        
        # If no explicit items provided but a product_model (Kit) is set, auto-populate components
        if not items_data and work_order.product_model:
            components = ProductComponent.objects.filter(parent=work_order.product_model)
            for comp in components:
                items_data.append({
                    'product_model_id': comp.child.id,
                    'quantity': comp.quantity
                })

        for item in items_data:
            product_model_id = item.get('product_model_id')
            quantity = item.get('quantity')
            physical_product_id = item.get('physical_product_id')
            
            # Sanitize empty string to None
            if physical_product_id == "":
                physical_product_id = None
            
            if physical_product_id:
                # Handle Serialized Item assignment
                PhysicalProduct.objects.filter(id=physical_product_id).update(
                    work_order=work_order,
                    location=warehouse # Can be None, calling update with location=None sets it to Null (valid for PP)
                )
            elif product_model_id and quantity:
                # Handle Bulk/Batch items
                if not warehouse:
                     raise serializers.ValidationError({"non_field_errors": ["No default 'WAREHOUSE' location found for this company. Please create one to manage batches."]})

                ProductBatch.objects.create(
                    product_model_id=product_model_id,
                    work_order=work_order,
                    quantity=quantity,
                    batch_identifier=f"BATCH-{work_order.id.hex[:6].upper()}-{str(product_model_id)[:4]}",
                    location=warehouse, 
                    data={"source": "WorkOrder Composition Auto-Population"} if not items_data else {"source": "WorkOrder Initial Config"}
                )
        return work_order

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
