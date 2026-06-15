from rest_framework import viewsets, permissions, serializers
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from inventory.models import WorkOrder
from ..auth import ApiKeyAuthMixin
from ..throttling import WidgetAPIThrottle, WidgetAPIBurstThrottle


class _WorkOrderSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    status = serializers.CharField()


@extend_schema_view(
    list=extend_schema(
        summary="List open work orders",
        description="List open work orders for the company associated with the API key.",
        tags=["Widget"],
        parameters=[OpenApiParameter(name="api_key", type=str, location="query", description="API key for authentication")],
        responses={200: _WorkOrderSummarySerializer(many=True)},
    ),
)
class WorkOrderWidgetViewSet(ApiKeyAuthMixin, viewsets.ViewSet):
    """
    Viewset for listing work orders in the widget.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [WidgetAPIThrottle, WidgetAPIBurstThrottle]

    def list(self, request):
        """List open work orders for the company."""
        api_key = self._validate_api_key(request)
        work_orders = WorkOrder.objects.filter(company=api_key.company, status='OPEN')
        
        return Response([{
            "id": str(wo.id),
            "name": wo.name,
            "status": wo.status
        } for wo in work_orders])
