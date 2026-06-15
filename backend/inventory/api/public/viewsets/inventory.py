from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from inventory.models import ProductModel, ProductBatch, PhysicalProduct
from inventory.exceptions import InventoryError
from ..auth import ApiKeyAuthMixin
from ..throttling import WidgetAPIThrottle, WidgetAPIBurstThrottle


class _PhysicalItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    identifier = serializers.CharField()
    location = serializers.CharField()


class _BatchSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    batch_identifier = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4)
    work_order = serializers.UUIDField(allow_null=True)
    product_model = serializers.UUIDField()
    location = serializers.CharField()
    location_id = serializers.UUIDField(allow_null=True)


class InventoryQueryViewSet(ApiKeyAuthMixin, viewsets.ViewSet):
    """
    Viewset for querying batches and items.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [WidgetAPIThrottle, WidgetAPIBurstThrottle]

    @extend_schema(
        summary="List physical items",
        description="List active physical items for a product, optionally filtered by location.",
        tags=["Inventory"],
        parameters=[
            OpenApiParameter(name="api_key", type=str, location="query", description="API key for authentication"),
            OpenApiParameter(name="product_id", type=str, location="query", required=True, description="Product model UUID"),
            OpenApiParameter(name="location_id", type=str, location="query", required=False, description="Filter by location UUID"),
        ],
        responses={200: _PhysicalItemSerializer(many=True), 400: OpenApiResponse(description="product_id required")},
    )
    @action(detail=False, methods=['get'])
    def items(self, request):
        """List physical items for a product. All statuses returned so the
        widget's tracker status-change UI can target items currently sitting
        in BROKEN / REPAIRED / custom-state buckets. The previous
        `status='ACTIVE'` filter caused items to vanish from the widget the
        moment their status changed."""
        api_key = self._validate_api_key(request)
        product_id = request.query_params.get('product_id')

        if not product_id:
            raise InventoryError("product_id is required.")

        items = PhysicalProduct.objects.filter(
            product_model_id=product_id,
            product_model__company=api_key.company,
        )

        location_id = request.query_params.get('location_id')
        if location_id:
            items = items.filter(location_id=location_id)

        items = items.select_related('location')

        return Response([{
            "id": str(i.id),
            "identifier": i.identifier,
            "status": i.status,
            "location": i.location.name if i.location else "Unknown"
        } for i in items])

    @extend_schema(
        summary="List batches",
        description="List batches with remaining stock for a product.",
        tags=["Inventory"],
        parameters=[
            OpenApiParameter(name="api_key", type=str, location="query", description="API key for authentication"),
            OpenApiParameter(name="product_id", type=str, location="query", required=True, description="Product model UUID"),
        ],
        responses={200: _BatchSerializer(many=True), 400: OpenApiResponse(description="product_id required")},
    )
    @action(detail=False, methods=['get'])
    def batches(self, request):
        """List batches with stock for a product."""
        api_key = self._validate_api_key(request)
        product_id = request.query_params.get('product_id')
        
        if not product_id:
            raise InventoryError("product_id is required.")

        batches = ProductBatch.objects.filter(
            product_model_id=product_id,
            product_model__company=api_key.company,
            quantity__gt=0
        ).select_related('location')
        
        return Response([{
            "id": str(b.id),
            "batch_identifier": b.batch_identifier,
            "quantity": float(b.quantity),
            "work_order": str(b.work_order.id) if b.work_order else None,
            "product_model": str(b.product_model.id),
            "location": b.location.name if b.location else "Unknown",
            "location_id": str(b.location.id) if b.location else None
        } for b in batches])
