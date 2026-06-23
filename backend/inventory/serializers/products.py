import copy
import logging
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from ..models import ProductModel, PhysicalProduct, ProductComponent
from ..constants import INVENTORY_PROFILES
from ..engines import EngineFactory
from ..profiles import profile_to_legacy
from .locations import LocationSerializer

logger = logging.getLogger(__name__)


def _seed_engine_config_from_preset(validated_data, *, instance=None, payload_keys=None):
    """Deep-copy preset.engine_config into validated_data when client omitted it.

    Mutates validated_data in place. Only runs when:
      - default_calculator is set on the resolved product (create) or being changed (update)
      - client did not send a non-empty engine_config in this request

    On engine_type mismatch between template and product, logs a warning and skips.
    """
    template = validated_data.get('default_calculator')
    if template is None:
        return

    if instance is not None:
        current = instance.default_calculator
        if current is not None and current.pk == template.pk:
            return  # not changing preset → don't auto-seed

    sent_config = (payload_keys is not None) and ('engine_config' in payload_keys)
    if sent_config and validated_data.get('engine_config'):
        return  # explicit non-empty engine_config wins

    profile = validated_data.get('profile') or getattr(instance, 'profile', 'SIMPLE_COUNT')
    _, product_engine_type, _ = profile_to_legacy(profile)
    if template.engine_type != product_engine_type:
        logger.warning(
            "Skipping engine_config copy from preset %s: template engine_type=%s != product engine_type=%s",
            template.pk, template.engine_type, product_engine_type,
        )
        return

    validated_data['engine_config'] = copy.deepcopy(template.engine_config or {})


def _resolve_threshold(obj, field_name):
    """Prefer model field, fall back to attributes['min_threshold'] for reorder_threshold."""
    value = getattr(obj, field_name, None)
    if value is not None:
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    if field_name == 'reorder_threshold' and obj.attributes and 'min_threshold' in obj.attributes:
        try:
            return float(obj.attributes['min_threshold'])
        except (ValueError, TypeError):
            return None
    return None

class ProductComponentSerializer(serializers.ModelSerializer):
    """Serializer for ProductComponent (kit composition)."""
    child_sku = serializers.ReadOnlyField(source='child.sku')
    child_name = serializers.ReadOnlyField(source='child.name')

    class Meta:
        model = ProductComponent
        fields = ['id', 'child', 'child_sku', 'child_name', 'quantity']

class ProductModelListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for ProductModel listing."""
    tracking_mode = serializers.CharField(read_only=True)
    engine_type = serializers.CharField(read_only=True)
    stock_summary = serializers.SerializerMethodField()

    class Meta:
        model = ProductModel
        fields = [
            'id', 'sku', 'name', 'barcode', 'profile', 'tracking_mode', 'engine_type',
            'stock_summary', 'created_at', 'updated_at',
            'reorder_threshold', 'critical_threshold', 'max_threshold', 'reorder_qty',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_stock_summary(self, obj):
        """Returns lightweight stock summary for list display."""
        from ..services import StockService
        from ..models import ProductBatch
        stock_data = StockService.get_stock_for_model(obj)
        total = float(stock_data.get('total', 0))

        reorder_t = _resolve_threshold(obj, 'reorder_threshold')

        status = 'OK'
        if total <= 0:
            status = 'ZERO'
        elif reorder_t is not None and total < reorder_t:
            status = 'LOW'

        unit = None
        try:
            engine = EngineFactory.get_engine_for_profile(obj)
            unit = engine.get_display_unit()
        except Exception as exc:
            logger.warning("Could not resolve display unit for product %s: %s", obj.pk, exc)

        # COSTING-06: weighted-average unit cost + booked value for the list.
        from ..models import ProductCost
        from decimal import Decimal as _D
        cost_state = ProductCost.objects.filter(product_model=obj).first()
        avg = float(cost_state.avg_unit_cost) if cost_state else 0.0
        result = {
            'total': total,
            'tracking_mode': obj.tracking_mode,
            'status': status,
            'unit': unit,
            'avg_unit_cost': avg,
            'stock_value': float(_D(str(total)) * _D(str(avg))),
        }

        if obj.tracking_mode == 'BATCH':
            result['batch_count'] = ProductBatch.objects.filter(
                product_model=obj, quantity__gt=0
            ).count()

        return result

class ProductModelSerializer(serializers.ModelSerializer):
    """Full detail serializer for ProductModel including stock status and components."""
    components = ProductComponentSerializer(many=True, required=False)
    initial_location_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    initial_supplier_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    initial_batch = serializers.JSONField(write_only=True, required=False, allow_null=True)
    initial_serials = serializers.JSONField(write_only=True, required=False, allow_null=True)
    initial_dimensions = serializers.JSONField(write_only=True, required=False, allow_null=True)
    stock_status = serializers.SerializerMethodField()
    engine_ui_config = serializers.SerializerMethodField()
    default_calculator_detail = serializers.SerializerMethodField()
    profile = serializers.ChoiceField(choices=INVENTORY_PROFILES)
    tracking_mode = serializers.CharField(read_only=True)
    engine_type = serializers.CharField(read_only=True)

    class Meta:
        model = ProductModel
        fields = [
            'id', 'sku', 'name', 'barcode', 'attributes', 'created_at', 'updated_at',
            'default_calculator', 'default_calculator_detail',
            'profile', 'tracking_mode', 'initial_balance',
            'initial_location_id', 'initial_supplier_id', 'initial_batch', 'initial_serials',
            'initial_dimensions',
            'stock_status',
            'engine_type', 'engine_config', 'engine_ui_config', 'components',
            'reorder_threshold', 'critical_threshold', 'max_threshold', 'reorder_qty',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_default_calculator_detail(self, obj):
        template = obj.default_calculator
        if template is None:
            return None
        return {
            'id': str(template.id),
            'name': template.name,
            'engine_type': template.engine_type,
        }

    def validate(self, attrs):
        from ..profiles import profile_to_legacy
        profile = attrs.get('profile', getattr(self.instance, 'profile', 'SIMPLE_COUNT'))
        _, engine_type, _ = profile_to_legacy(profile)
        engine_config = attrs.get('engine_config', getattr(self.instance, 'engine_config', {}))
        if engine_config:
            errors = EngineFactory.validate_config(engine_type, engine_config)
            if errors:
                raise serializers.ValidationError({"engine_config": errors})
        return attrs

    def create(self, validated_data):
        components_data = validated_data.pop('components', [])
        validated_data.pop('initial_location_id', None) # Remove non-model field
        validated_data.pop('initial_supplier_id', None) # Remove non-model field
        validated_data.pop('initial_batch', None) # Consumed by viewset.perform_create
        validated_data.pop('initial_serials', None) # Consumed by viewset.perform_create
        validated_data.pop('initial_dimensions', None) # Consumed by viewset.perform_create
        payload_keys = set(self.initial_data.keys()) if hasattr(self, 'initial_data') else None
        _seed_engine_config_from_preset(validated_data, instance=None, payload_keys=payload_keys)
        product_model = ProductModel.objects.create(**validated_data)
        for comp_data in components_data:
            ProductComponent.objects.create(parent=product_model, **comp_data)
        return product_model

    def update(self, instance, validated_data):
        components_data = validated_data.pop('components', None)
        payload_keys = set(self.initial_data.keys()) if hasattr(self, 'initial_data') else None
        _seed_engine_config_from_preset(validated_data, instance=instance, payload_keys=payload_keys)
        instance = super().update(instance, validated_data)
        
        if components_data is not None:
            # Simple sync: delete old, create new
            instance.components.all().delete()
            for comp_data in components_data:
                ProductComponent.objects.create(parent=instance, **comp_data)
        
        return instance

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_engine_ui_config(self, obj):
        """Resolved engine UI schema (fields + status_transitions) for MovementCreate forms."""
        try:
            engine = EngineFactory.get_engine_for_profile(obj)
            if engine is None:
                return None
            return engine.get_ui_config()
        except Exception as exc:
            logger.warning("Could not resolve engine_ui_config for product %s: %s", obj.pk, exc)
            return None

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_stock_status(self, obj):
        """Calculates current stock and buckets it for Kanban scoring.

        Prefers first-class threshold columns; falls back to legacy
        `attributes['min_threshold']` for `reorder_threshold` (back-compat).
        """
        from ..services import StockService
        stock_data = StockService.get_stock_for_model(obj)
        try:
            qty = float(stock_data.get('total', 0) or 0)
        except (ValueError, TypeError):
            qty = 0.0

        reorder_t = _resolve_threshold(obj, 'reorder_threshold')
        critical_t = _resolve_threshold(obj, 'critical_threshold')
        max_t = _resolve_threshold(obj, 'max_threshold')

        effective_critical = critical_t
        if effective_critical is None and reorder_t is not None:
            effective_critical = reorder_t / 2

        if qty <= 0:
            bucket = 'OUT'
        elif effective_critical is not None and qty < effective_critical:
            bucket = 'CRITICAL'
        elif reorder_t is not None and qty < reorder_t:
            bucket = 'REORDER'
        elif max_t is not None and qty > max_t:
            bucket = 'OVERSTOCK'
        else:
            bucket = 'HEALTHY'

        status = 'LOW' if bucket in {'REORDER', 'CRITICAL', 'OUT'} else 'OK'

        return {
            "quantity": qty,
            "reorder_threshold": reorder_t,
            "critical_threshold": critical_t,
            "max_threshold": max_t,
            "bucket": bucket,
            "status": status,
            "threshold": reorder_t,
        }

class PhysicalProductSerializer(serializers.ModelSerializer):
    """Serializer for individual serialized item (PhysicalProduct)."""
    product_model_details = serializers.SerializerMethodField()
    product_model_name = serializers.ReadOnlyField(source='product_model.name')
    location_name = serializers.ReadOnlyField(source='location.name')
    location_id = serializers.UUIDField(required=False, write_only=True, allow_null=True)
    status_label = serializers.SerializerMethodField()
    last_status_change = serializers.SerializerMethodField()
    attributes = serializers.SerializerMethodField()
    batch = serializers.SerializerMethodField()

    class Meta:
        model = PhysicalProduct
        fields = [
            'id', 'identifier', 'batch_date',
            'product_model', 'product_model_name', 'product_model_details',
            'status', 'status_label',
            'location', 'location_name', 'location_id',
            'work_order', 'batch',
            'created_at', 'updated_at',
            'attributes', 'last_status_change',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    location = serializers.UUIDField(read_only=True)

    def validate_location_id(self, value):
        if value is None:
            return value
        from ..models import Location
        request = self.context.get('request')
        if not request or not request.user or not request.user.company:
            raise serializers.ValidationError("Authentication required.")
        if not Location.objects.filter(id=value, company=request.user.company).exists():
            raise serializers.ValidationError("Location not found.")
        return value

    def validate_product_model(self, value):
        """SEC-05: a serialized item may only point at a product owned by the
        caller's company — otherwise it could be attached to another tenant's
        product model (cross-tenant mass-assignment)."""
        if value is None:
            return value
        request = self.context.get('request')
        company = getattr(getattr(request, 'user', None), 'company', None)
        if company is None:
            raise serializers.ValidationError("Authentication required.")
        if value.company_id != company.id:
            raise serializers.ValidationError("Product model not found.")
        return value

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_product_model_details(self, obj):
        return {
            "id": str(obj.product_model.id),
            "sku": obj.product_model.sku,
            "name": obj.product_model.name,
            "profile": obj.product_model.profile,
        }

    @extend_schema_field(OpenApiTypes.STR)
    def get_status_label(self, obj):
        return obj.get_status_display()

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_attributes(self, obj):
        # PhysicalProduct has no per-item attributes column.
        # Surface the product_model's attributes so the show page
        # has a uniform read field.
        return dict(obj.product_model.attributes or {})

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_batch(self, obj):
        # PhysicalProduct has no batch FK; explicit null keeps the
        # show-page payload shape stable.
        return None

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_last_status_change(self, obj):
        from ..models import Movement
        movement = (
            Movement.objects
            .filter(physical_product=obj, quantity=0)
            .order_by('-occurred_at')
            .first()
        )
        if movement is None:
            return None
        return {
            "occurred_at": movement.occurred_at.isoformat(),
            "reason": movement.reason,
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.product_model_id:
            data['product_model'] = {
                "id": str(instance.product_model.id),
                "sku": instance.product_model.sku,
                "name": instance.product_model.name,
                "profile": instance.product_model.profile,
            }
        if instance.location_id:
            data['location'] = {
                "id": str(instance.location.id),
                "name": instance.location.name,
                "type": instance.location.type,
            }
        else:
            data['location'] = None
        if instance.work_order_id:
            data['work_order'] = {
                "id": str(instance.work_order.id),
                "name": instance.work_order.name,
            }
        else:
            data['work_order'] = None
        return data

    def create(self, validated_data):
        loc_id = validated_data.pop('location_id', None)
        product = super().create(validated_data)
        if loc_id is not None:
            product.location_id = loc_id
            product.save()
        return product

    def update(self, instance, validated_data):
        loc_id = validated_data.pop('location_id', ...)
        if loc_id is not ...:
            if loc_id is None:
                instance.location = None
            else:
                instance.location_id = loc_id
        return super().update(instance, validated_data)
