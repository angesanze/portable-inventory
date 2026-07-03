from rest_framework import viewsets, permissions, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from drf_spectacular.utils import (
    extend_schema,
    extend_schema_view,
    OpenApiParameter,
    OpenApiResponse,
)
from inventory.models import ProductModel, Location
from inventory.services import StockService
from inventory.engines import EngineFactory
from inventory.exceptions import InventoryError
from ..auth import ApiKeyAuthMixin
from ..throttling import WidgetAPIThrottle, WidgetAPIBurstThrottle


class _ProductListResponseSerializer(serializers.Serializer):
    company = serializers.CharField()
    products = serializers.ListField(child=serializers.DictField())
    poly_products = serializers.ListField(
        child=serializers.DictField(), help_text="Deprecated, always empty."
    )


class _TransactionRequestSerializer(serializers.Serializer):
    api_key = serializers.CharField(
        required=False, help_text="API key (also accepted via X-API-Key header or query param)"
    )
    operation = serializers.ChoiceField(
        choices=["batch_update_item", "produce_kit", "fulfill"],
        required=False,
        help_text="Batch Manager / WorkOrder operation. Omit for a plain stock direction transaction. 'fulfill' fulfills an existing WorkOrder.",
    )
    direction = serializers.ChoiceField(
        choices=["Inbound", "Outbound"],
        required=False,
        help_text="Stock direction (omit when 'operation' is set)",
    )
    quantity = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        help_text="Quantity to add/subtract (omit when 'operation' is set)",
    )
    location_id = serializers.UUIDField(required=False, help_text="Target location UUID")
    reason = serializers.CharField(required=False, help_text="Reason for transaction")
    idempotency_key = serializers.CharField(
        required=False,
        help_text="Optional key to make a 'fulfill' operation idempotent (safe to retry)",
    )


class _TransactionResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    new_stock_display = serializers.CharField(required=False)


@extend_schema_view(
    list=extend_schema(
        summary="List products",
        description="List all products with stock info for the company associated with the API key.",
        tags=["Widget"],
        parameters=[
            OpenApiParameter(
                name="api_key", type=str, location="query", description="API key for authentication"
            ),
            OpenApiParameter(
                name="location_id",
                type=str,
                location="query",
                required=False,
                description="Filter by location UUID",
            ),
        ],
        responses={200: _ProductListResponseSerializer},
    ),
    retrieve=extend_schema(
        summary="Get product details",
        description="Get details for a specific ProductModel or WorkOrder, including stock breakdown by location.",
        tags=["Widget"],
        parameters=[
            OpenApiParameter(
                name="api_key", type=str, location="query", description="API key for authentication"
            ),
            OpenApiParameter(
                name="location_id",
                type=str,
                location="query",
                required=False,
                description="Filter stock by location",
            ),
        ],
        responses={
            200: OpenApiResponse(description="Product details with stock info"),
            404: OpenApiResponse(description="Product not found"),
        },
    ),
)
class ProductWidgetViewSet(ApiKeyAuthMixin, viewsets.ViewSet):
    """
    Viewset for listing products and stock status in the widget.
    Supports both standard ProductModels and WorkOrder (Batch Manager) context.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [WidgetAPIThrottle, WidgetAPIBurstThrottle]

    def list(self, request):
        """
        List all products for the company associated with the API key.
        Delegated to WidgetService.
        """
        from inventory.services import WidgetService

        api_key = self._validate_api_key(request)
        location_id = request.query_params.get("location_id")

        data = WidgetService.get_widget_products(api_key.company, location_id)

        return Response(
            {
                "company": api_key.company.name,
                "products": data,
                "poly_products": [],  # Deprecated
            }
        )

    def retrieve(self, request, pk=None):
        """
        Get details for a specific item (ProductModel or WorkOrder).
        Used by the widget to initialize the view.
        Delegated to WidgetService.
        """
        from inventory.services import WidgetService

        api_key = self._validate_api_key(request)
        location_id = request.query_params.get("location_id")

        data = WidgetService.get_widget_product_details(api_key.company, pk, location_id)
        return Response(data)

    @extend_schema(
        summary="Resolve a barcode / QR code to a product",
        description=(
            "Resolve a scanned code to a widget product payload. Matches an exact "
            "ProductModel.barcode (GTIN/EAN/UPC) first; falls back to a DynamicQRCode.code "
            "whose target is a product. Returns the same payload as the widget-detail endpoint."
        ),
        tags=["Widget"],
        parameters=[
            OpenApiParameter(
                name="api_key", type=str, location="query", description="API key for authentication"
            ),
            OpenApiParameter(
                name="code",
                type=str,
                location="query",
                required=True,
                description="Barcode or QR code string",
            ),
            OpenApiParameter(
                name="location_id",
                type=str,
                location="query",
                required=False,
                description="Filter stock by location",
            ),
        ],
        responses={
            200: OpenApiResponse(description="Product details with stock info"),
            404: OpenApiResponse(description="No product matches the code"),
        },
    )
    @action(detail=False, methods=["get"], url_path="resolve_barcode")
    def resolve_barcode(self, request):
        """Resolve a scanned barcode/QR code to the widget product payload.

        Single entry point for the scanner: a manufacturer EAN/UPC barcode and a
        proprietary DynamicQRCode both land here. Barcode (exact, company-scoped)
        wins; otherwise we fall back to a DynamicQRCode.code that targets a product.
        """
        from inventory.services import WidgetService
        from inventory.models import DynamicQRCode

        api_key = self._validate_api_key(request)
        company = api_key.company
        code = (request.query_params.get("code") or "").strip()
        location_id = request.query_params.get("location_id")

        if not code:
            return Response({"detail": "Missing 'code' parameter."}, status=400)

        # 1) Exact barcode match (company-scoped, only non-blank barcodes).
        product = (
            ProductModel.objects.filter(company=company, barcode=code).exclude(barcode="").first()
        )

        # 2) Fallback: DynamicQRCode.code → its product_model.
        if product is None:
            qr = DynamicQRCode.objects.filter(code=code, company=company).first()
            if qr is not None and qr.product_model_id is not None:
                product = qr.product_model

        if product is None:
            return Response(
                {"detail": "No product matches the scanned code."},
                status=404,
            )

        data = WidgetService.get_widget_product_details(company, str(product.id), location_id)
        # A bare barcode scan (unlike a QR deep link) carries no location, so the
        # scanner would dead-end on "missing product or location context" even
        # though the transaction endpoint can resolve one. Surface the effective
        # location — explicit query param, else the API key's forced default — as
        # an {id, name} object the scanner reads (WIDGET-04).
        effective_location = None
        if location_id:
            effective_location = Location.objects.filter(id=location_id, company=company).first()
        if effective_location is None and api_key.default_location_id:
            effective_location = api_key.default_location
        if effective_location is not None:
            data["default_location"] = {
                "id": str(effective_location.id),
                "name": effective_location.name,
            }
        return Response(data)

    @extend_schema(
        summary="Process stock transaction",
        description="Handle stock updates (add/subtract) or batch management operations for a product.",
        tags=["Widget"],
        parameters=[
            OpenApiParameter(
                name="api_key", type=str, location="query", description="API key for authentication"
            )
        ],
        request=_TransactionRequestSerializer,
        responses={
            200: _TransactionResponseSerializer,
            400: OpenApiResponse(description="Validation error"),
            404: OpenApiResponse(description="Product not found"),
            409: OpenApiResponse(description="Insufficient stock"),
        },
    )
    @action(detail=True, methods=["post"])
    def transaction(self, request, pk=None):
        """
        Handle stock updates (add/subtract) or batch management operations.
        Delegated to WidgetService.
        """
        from inventory.services import WidgetService

        api_key = self._validate_api_key(request)
        company = api_key.company
        data = request.data

        try:
            result = WidgetService.process_transaction(company, api_key, pk, data)
        except InventoryError as e:
            detail = str(e.detail)
            return Response(
                {"detail": detail, "error": detail},
                status=e.status_code,
            )

        if result.get("success") and "product" in result:
            product = result.pop("product")
            # Format new stock display
            engine = EngineFactory.get_engine_for_profile(product)
            if product.engine_type == "tracker":
                display_data = StockService.get_tracker_status_counts(product)
            elif product.engine_type == "time_based":
                display_data = StockService.get_expiry_display_data(product, product.engine_config)
            else:
                stock_info = StockService.get_stock_for_model(product)
                display_data = stock_info["total"]
            return Response(
                {"success": True, "new_stock_display": engine.format_stock_display(display_data)}
            )

        # Catch-all for batch manager successes
        if "product" in result:
            del result["product"]
        return Response(result)
