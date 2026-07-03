from decimal import Decimal

from django.conf import settings
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes

from ..models import (
    Movement,
    EventLog,
    DynamicQRCode,
    ProductModel,
    Location,
    PhysicalProduct,
    WorkOrder,
    Supplier,
)
from ..services import LedgerService
from .locations import LocationSerializer
from .work_orders import ProductBatchSerializer


class MovementSerializer(serializers.ModelSerializer):
    """Serializer for stock movements (Ledger entry).

    Accepts flexible input fields for entity resolution:
    - Product: ``sku`` or ``product_id``
    - Locations: ``from``/``from_location_name`` or ``from_id``;
                 ``to``/``to_location_name`` or ``to_id``
    - Quantity: ``qty`` or ``quantity``

    Entity resolution and validation happen in ``validate()``.
    ``create()`` delegates to ``LedgerService.transfer_stock()``.
    """

    # --- Write-only input fields for entity resolution ---
    sku = serializers.CharField(write_only=True, required=False)
    product_id = serializers.UUIDField(write_only=True, required=False)
    from_location_name = serializers.CharField(write_only=True, required=False)
    from_id = serializers.UUIDField(write_only=True, required=False)
    to_location_name = serializers.CharField(write_only=True, required=False)
    to_id = serializers.UUIDField(write_only=True, required=False)
    qty = serializers.DecimalField(
        write_only=True,
        required=False,
        allow_null=True,
        max_digits=12,
        decimal_places=4,
    )

    # Batch handling
    batch_id = serializers.CharField(write_only=True, required=False, allow_null=True)
    batch_data = serializers.DictField(write_only=True, required=False, allow_null=True)
    batch = ProductBatchSerializer(read_only=True)

    # Related entity IDs
    physical_product_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    work_order_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    supplier_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    # --- Status-change transaction (tracker engine) ---
    transaction_type = serializers.ChoiceField(
        write_only=True,
        required=False,
        default="movement",
        choices=["movement", "status_change"],
    )
    physical_identifier = serializers.CharField(write_only=True, required=False, allow_blank=True)
    new_status = serializers.CharField(write_only=True, required=False, allow_blank=True)
    notes = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Movement
        fields = [
            "id",
            "product_model",
            "from_location",
            "to_location",
            "quantity",
            "reason",
            "occurred_at",
            "sku",
            "product_id",
            "from_location_name",
            "from_id",
            "to_location_name",
            "to_id",
            "qty",
            "batch_id",
            "batch_data",
            "batch",
            "physical_product_id",
            "work_order_id",
            "work_order",
            "supplier",
            "supplier_id",
            "transaction_type",
            "physical_identifier",
            "new_status",
            "notes",
        ]
        read_only_fields = [
            "id",
            "product_model",
            "from_location",
            "to_location",
            "occurred_at",
            "batch",
            "work_order",
            "supplier",
        ]
        extra_kwargs = {
            "quantity": {"required": False},
            "reason": {"required": False, "default": "API Movement"},
        }

    def to_internal_value(self, data):
        """Map legacy field aliases before standard validation."""
        # Convert QueryDict to plain dict for safe mutation
        if hasattr(data, "dict"):
            data = data.dict()
        else:
            data = dict(data)
        # 'from' is a Python keyword — accept it as alias for from_location_name
        if "from" in data and "from_location_name" not in data and "from_id" not in data:
            data["from_location_name"] = data.pop("from")
        # 'to' alias
        if "to" in data and "to_location_name" not in data and "to_id" not in data:
            data["to_location_name"] = data.pop("to")
        return super().to_internal_value(data)

    def validate_qty(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Quantity must be positive.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            return attrs

        user = request.user
        if not user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")

        # Effective company, not user.company: a developer acting on a child
        # tenant (X-Acting-Company) must create movements scoped to the child.
        from core.scope import resolve_effective_company

        company = resolve_effective_company(request)
        if company is None:
            raise serializers.ValidationError("A company context is required to create movements.")

        transaction_type = attrs.pop("transaction_type", "movement")
        attrs["_transaction_type"] = transaction_type
        is_status_change = transaction_type == "status_change"

        # --- Resolve ProductModel (required in both branches) ---
        product_id = attrs.pop("product_id", None)
        sku = attrs.pop("sku", None)
        if product_id:
            try:
                attrs["_product_model"] = ProductModel.objects.get(id=product_id, company=company)
            except ProductModel.DoesNotExist:
                raise serializers.ValidationError({"product_id": "Product not found."})
        elif sku:
            try:
                attrs["_product_model"] = ProductModel.objects.get(sku=sku, company=company)
            except ProductModel.DoesNotExist:
                raise serializers.ValidationError({"sku": f'Product with SKU "{sku}" not found.'})
        else:
            raise serializers.ValidationError('Either "sku" or "product_id" is required.')

        if is_status_change:
            physical_identifier = attrs.pop("physical_identifier", None)
            new_status = attrs.pop("new_status", None)
            if not physical_identifier:
                raise serializers.ValidationError(
                    {"physical_identifier": "Required for status_change transactions."}
                )
            if not new_status:
                raise serializers.ValidationError(
                    {"new_status": "Required for status_change transactions."}
                )
            try:
                attrs["_physical_product"] = PhysicalProduct.objects.get(
                    product_model=attrs["_product_model"],
                    identifier=physical_identifier,
                )
            except PhysicalProduct.DoesNotExist:
                raise serializers.ValidationError(
                    {"physical_identifier": f'Physical product "{physical_identifier}" not found.'}
                )
            attrs["_new_status"] = new_status
            attrs["_notes"] = attrs.pop("notes", "") or ""
            # Drop unused movement fields so create() doesn't trip on them
            attrs.pop("from_id", None)
            attrs.pop("from_location_name", None)
            attrs.pop("to_id", None)
            attrs.pop("to_location_name", None)
            attrs.pop("qty", None)
            attrs.pop("quantity", None)
            return attrs

        # --- Resolve from_location ---
        from_id = attrs.pop("from_id", None)
        from_name = attrs.pop("from_location_name", None)
        if from_id:
            try:
                attrs["_from_location"] = Location.objects.get(id=from_id, company=company)
            except Location.DoesNotExist:
                raise serializers.ValidationError({"from_id": "Source location not found."})
        elif from_name:
            if from_name == "External Vendor":
                attrs["_from_location"], _ = Location.objects.get_or_create(
                    company=company,
                    name="External Vendor",
                    defaults={"type": "VIRTUAL"},
                )
            else:
                try:
                    attrs["_from_location"] = Location.objects.get(name=from_name, company=company)
                except Location.DoesNotExist:
                    raise serializers.ValidationError(
                        {"from_location_name": f'Location "{from_name}" not found.'}
                    )
        else:
            raise serializers.ValidationError(
                'Either "from_location_name" or "from_id" is required.'
            )

        # --- Resolve to_location ---
        to_id = attrs.pop("to_id", None)
        to_name = attrs.pop("to_location_name", None)
        if to_id:
            try:
                attrs["_to_location"] = Location.objects.get(id=to_id, company=company)
            except Location.DoesNotExist:
                raise serializers.ValidationError({"to_id": "Destination location not found."})
        elif to_name:
            try:
                attrs["_to_location"] = Location.objects.get(name=to_name, company=company)
            except Location.DoesNotExist:
                raise serializers.ValidationError(
                    {"to_location_name": f'Location "{to_name}" not found.'}
                )
        else:
            raise serializers.ValidationError('Either "to_location_name" or "to_id" is required.')

        # --- Resolve quantity ---
        qty = attrs.pop("qty", None)
        quantity = attrs.pop("quantity", None)
        resolved_qty = qty if qty is not None else quantity
        if resolved_qty is None:
            resolved_qty = Decimal("0")
        attrs["_quantity"] = Decimal(str(resolved_qty))

        # --- Resolve physical_product (optional) ---
        pp_id = attrs.pop("physical_product_id", None)
        if pp_id:
            try:
                attrs["_physical_product"] = PhysicalProduct.objects.get(
                    id=pp_id,
                    product_model__company=company,
                )
            except PhysicalProduct.DoesNotExist:
                raise serializers.ValidationError(
                    {"physical_product_id": "Physical product not found."}
                )

        # --- Resolve work_order (optional) ---
        wo_id = attrs.pop("work_order_id", None)
        if wo_id:
            try:
                attrs["_work_order"] = WorkOrder.objects.get(id=wo_id, company=company)
            except WorkOrder.DoesNotExist:
                raise serializers.ValidationError({"work_order_id": "Work order not found."})

        # --- Resolve supplier (optional, inbound receipts) ---
        sup_id = attrs.pop("supplier_id", None)
        if sup_id:
            try:
                attrs["_supplier"] = Supplier.objects.get(id=sup_id, company=company)
            except Supplier.DoesNotExist:
                raise serializers.ValidationError({"supplier_id": "Supplier not found."})

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        user = request.user

        if validated_data.get("_transaction_type") == "status_change":
            return self._create_status_change(validated_data, user)

        movement = LedgerService.transfer_stock(
            product_model=validated_data["_product_model"],
            from_location=validated_data["_from_location"],
            to_location=validated_data["_to_location"],
            quantity=validated_data["_quantity"],
            user=user,
            reason=validated_data.get("reason", "API Movement"),
            batch_id=validated_data.get("batch_id"),
            batch_data=validated_data.get("batch_data"),
            physical_product=validated_data.get("_physical_product"),
            work_order=validated_data.get("_work_order"),
            supplier=validated_data.get("_supplier"),
        )
        return movement

    def _create_status_change(self, validated_data, user):
        """Drive a TrackerEngine status transition + emit an audit Movement row.

        Audit row uses ``quantity=0`` with ``from_location == to_location`` so
        StockService balances are unaffected. ``reason`` carries the status
        delta since Movement has no metadata column.
        """
        from ..engines import EngineFactory
        from ..strategies import TrackerStatusBehavior

        product_model = validated_data["_product_model"]
        pp = validated_data["_physical_product"]
        new_status = validated_data["_new_status"]
        notes = validated_data.get("_notes", "") or ""

        if product_model.engine_type != "tracker":
            raise serializers.ValidationError(
                {
                    "transaction_type": (
                        f"status_change requires a tracker engine "
                        f"(product engine_type={product_model.engine_type})."
                    )
                }
            )

        location = pp.location
        if location is None:
            raise serializers.ValidationError(
                {
                    "physical_identifier": (
                        "PhysicalProduct has no current location; cannot record "
                        "status_change audit row."
                    )
                }
            )

        engine = EngineFactory.get_engine_for_profile(product_model)

        try:
            TrackerStatusBehavior.execute_status_change(
                engine,
                {
                    "physical_product_id": pp.id,
                    "new_status": new_status,
                    "notes": notes,
                    "user": user,
                },
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)})

        # Strategy emits the audit Movement; surface the latest one for the
        # response body.
        movement = Movement.objects.filter(physical_product=pp).order_by("-occurred_at").first()
        return movement


class ProductModelMiniSerializer(serializers.ModelSerializer):
    """Lightweight product reference for embedding in list rows.

    Deliberately excludes ``stock_status``/``engine_ui_config`` — those run a
    StockService query + build an engine *per object*, so nesting the full
    ProductModelSerializer in a list (e.g. movements) is an N+1. The movement
    list only displays sku/name, so this is all it needs.
    """

    tracking_mode = serializers.CharField(read_only=True)

    class Meta:
        model = ProductModel
        fields = ["id", "sku", "name", "profile", "tracking_mode"]


class MovementReadSerializer(MovementSerializer):
    """Rich serializer for listing movements with expanded relations."""

    product_model = ProductModelMiniSerializer(read_only=True)
    from_location = LocationSerializer(read_only=True)
    to_location = LocationSerializer(read_only=True)

    class Meta(MovementSerializer.Meta):
        fields = MovementSerializer.Meta.fields + [
            "delta",
            "sku",
            "product_name",
            "serial_number",
            "work_order_name",
            "supplier_name",
        ]

    # Override quantity to include signed delta
    quantity = serializers.SerializerMethodField()
    delta = serializers.SerializerMethodField()

    # Flattened fields for easy frontend display
    sku = serializers.ReadOnlyField(source="product_model.sku")
    product_name = serializers.ReadOnlyField(source="product_model.name")
    serial_number = serializers.ReadOnlyField(source="physical_product.identifier")
    work_order_name = serializers.ReadOnlyField(source="work_order.name")
    supplier_name = serializers.ReadOnlyField(source="supplier.name")

    @extend_schema_field(OpenApiTypes.NUMBER)
    def get_quantity(self, obj):
        """Returns signed quantity based on direction relative to Warehouse."""
        try:
            qty = float(obj.quantity)
        except (ValueError, TypeError):
            return 0.0

        # Check if outbound (From Warehouse -> External/Virtual)
        # We consider 'WAREHOUSE' as the internal stock reference
        is_from_warehouse = obj.from_location and obj.from_location.type == "WAREHOUSE"
        is_to_warehouse = obj.to_location and obj.to_location.type == "WAREHOUSE"

        # Outbound: Warehouse -> !Warehouse (e.g. Consumption, External)
        if is_from_warehouse and not is_to_warehouse:
            return -qty

        return qty

    @extend_schema_field(OpenApiTypes.NUMBER)
    def get_delta(self, obj):
        return self.get_quantity(obj)


class EventLogSerializer(serializers.ModelSerializer):
    """Read-only serializer for EventLog model."""

    class Meta:
        model = EventLog
        fields = [
            "id",
            "rule",
            "product",
            "batch",
            "message",
            "status",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = fields


class DynamicQRCodeSerializer(serializers.ModelSerializer):
    """Serializer for DynamicQRCode model with target display logic."""

    target_display = serializers.SerializerMethodField()
    qr_url = serializers.SerializerMethodField()
    product_model_name = serializers.SerializerMethodField()
    batch_identifier = serializers.SerializerMethodField()
    work_order_name = serializers.SerializerMethodField()
    physical_product_identifier = serializers.SerializerMethodField()
    api_key_label = serializers.SerializerMethodField()

    class Meta:
        model = DynamicQRCode
        fields = [
            "id",
            "code",
            "status",
            "label",
            "api_key",
            "api_key_label",
            "product_model",
            "product_model_name",
            "batch",
            "batch_identifier",
            "work_order",
            "work_order_name",
            "physical_product",
            "physical_product_identifier",
            "custom_url",
            "target_display",
            "qr_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "code",
            "created_at",
            "updated_at",
            "target_display",
            "qr_url",
            "api_key_label",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_target_display(self, obj):
        try:
            return obj.get_target_display()
        except Exception as e:
            return f"Error displaying target: {str(e)}"

    @extend_schema_field(OpenApiTypes.STR)
    def get_qr_url(self, obj):
        """Absolute URL embedded in the QR code, reachable from phone scanners.

        Points at the FRONTEND origin (settings.FRONTEND_BASE_URL) — Vite/nginx
        proxies /go/<code>/ to the backend, so the scanned QR lands the user on
        the frontend, the backend's QRRedirectView fires, and its redirect to
        /widget?... resolves within the frontend origin (where the React route
        actually lives). Never bake in the backend host: backend has no /widget.
        Falls back to PUBLIC_BASE_URL, then the request origin, then a relative
        path — strictly degraded modes for tests.
        """
        path = f"/go/{obj.code}"
        base = (
            getattr(settings, "FRONTEND_BASE_URL", "")
            or getattr(settings, "PUBLIC_BASE_URL", "")
            or ""
        )
        if base:
            return f"{base}{path}"
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(path)
        return path

    @extend_schema_field(OpenApiTypes.STR)
    def get_product_model_name(self, obj):
        return obj.product_model.name if obj.product_model else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_physical_product_identifier(self, obj):
        return obj.physical_product.identifier if obj.physical_product else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_api_key_label(self, obj):
        return obj.api_key.label if obj.api_key else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_batch_identifier(self, obj):
        try:
            return obj.batch.batch_identifier if obj.batch else None
        except Exception:
            return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_work_order_name(self, obj):
        return obj.work_order.name if obj.work_order else None
