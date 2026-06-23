from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter, OpenApiResponse
from inventory.models import Location
from inventory.services import StockService
from ..auth import ApiKeyAuthMixin
from ..throttling import WidgetAPIThrottle, WidgetAPIBurstThrottle


class _LocationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    type = serializers.CharField()


class _CreateLocationRequestSerializer(serializers.Serializer):
    api_key = serializers.CharField(required=False)
    name = serializers.CharField(help_text="Location name")
    type = serializers.ChoiceField(choices=["WAREHOUSE", "STORE", "TRANSIT"], default="WAREHOUSE", required=False)


class _LocationInventoryResponseSerializer(serializers.Serializer):
    location = serializers.CharField()
    contents = serializers.ListField(child=serializers.DictField())


@extend_schema_view(
    list=extend_schema(
        summary="List locations",
        description="List active locations for the company (excludes VIRTUAL locations).",
        tags=["Inventory"],
        parameters=[OpenApiParameter(name="api_key", type=str, location="query", description="API key for authentication")],
        responses={200: _LocationSerializer(many=True)},
    ),
)
class LocationWidgetViewSet(ApiKeyAuthMixin, viewsets.ViewSet):
    """
    Viewset for location management in the widget.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [WidgetAPIThrottle, WidgetAPIBurstThrottle]

    def list(self, request):
        """List active locations for the company."""
        api_key = self._validate_api_key(request)
        locations = Location.objects.filter(company=api_key.company).exclude(type='VIRTUAL')
        
        return Response([{
            "id": str(l.id),
            "name": l.name,
            "type": l.type
        } for l in locations])

    @extend_schema(
        summary="Create location",
        description="Create a new location for the company.",
        tags=["Inventory"],
        request=_CreateLocationRequestSerializer,
        responses={200: OpenApiResponse(description="Created location with id and name"), 400: OpenApiResponse(description="Name required")},
    )
    @action(detail=False, methods=['post'], url_path='create')
    def create_location(self, request):
        """Create a new location."""
        api_key = self._validate_api_key(request)
        name = request.data.get('name')
        loc_type = request.data.get('type', 'WAREHOUSE')
        
        if not name:
            return Response({"detail": "Name required"}, status=400)
            
        location = Location.objects.create(
            company=api_key.company,
            name=name,
            type=loc_type
        )
        return Response({"id": str(location.id), "name": location.name})

    @extend_schema(
        summary="Get location inventory",
        description="Get inventory breakdown for a specific location.",
        tags=["Inventory"],
        parameters=[
            OpenApiParameter(name="api_key", type=str, location="query", description="API key for authentication"),
            OpenApiParameter(name="location_id", type=str, location="query", required=True, description="Location UUID"),
        ],
        responses={200: _LocationInventoryResponseSerializer, 400: OpenApiResponse(description="location_id required"), 404: OpenApiResponse(description="Location not found")},
    )
    @action(detail=False, methods=['get'], url_path='inventory')
    def location_inventory(self, request):
        """Get inventory breakdown for a specific location."""
        api_key = self._validate_api_key(request)
        location_id = request.query_params.get('location_id')
        
        if not location_id:
            return Response({"detail": "location_id required"}, status=400)
            
        location = get_object_or_404(Location, id=location_id, company=api_key.company)
        contents = StockService.get_location_contents(location)
        
        return Response({
            "location": location.name,
            "contents": contents
        })
