from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..api.base import CompanyScopedViewSet
from ..exceptions import InventoryError
from ..models import Location, SalesOrder
from ..models.sales import SO_STATUS_DRAFT
from ..serializers.sales import SalesOrderSerializer
from ..services.sales import SalesService


class SalesOrderViewSet(CompanyScopedViewSet):
    """CRUD + lifecycle for sales orders (SALES-ORDERS-04).

    Writes (update/delete) are limited to DRAFT; status only moves through the
    ``confirm``, ``ship`` and ``cancel`` actions (``pick_list`` is read-only).
    """
    queryset = SalesOrder.objects.select_related('customer', 'created_by').prefetch_related(
        'lines__product_model'
    )
    serializer_class = SalesOrderSerializer
    filterset_fields = ['status', 'customer']
    search_fields = ['number', 'customer__name']
    ordering_fields = ['number', 'created_at', 'promised_at']
    ordering = ['-created_at']

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != SO_STATUS_DRAFT:
            return Response(
                {"detail": "Only DRAFT orders can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != SO_STATUS_DRAFT:
            return Response(
                {"detail": "Only DRAFT orders can be deleted. Cancel the order instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def _resolve_location(self, so, location_id):
        try:
            return Location.objects.get(id=location_id, company=so.company)
        except (Location.DoesNotExist, ValueError, TypeError):
            return None

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm + reserve. Body: {location_id, allow_partial?}."""
        so = self.get_object()
        location_id = request.data.get('location_id')
        allow_partial = bool(request.data.get('allow_partial', False))
        if not location_id:
            return Response({"detail": "location_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        location = self._resolve_location(so, location_id)
        if location is None:
            return Response({"detail": "Location not found."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            so = SalesService.confirm(so, location, allow_partial=allow_partial)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(so).data)

    @action(detail=True, methods=['get'])
    def pick_list(self, request, pk=None):
        so = self.get_object()
        data = SalesService.pick_list(so)
        return Response(data)

    @action(detail=True, methods=['post'])
    def ship(self, request, pk=None):
        """Ship goods. Body: {shipments: [{line_id, quantity, batch_id?, serials?}]}."""
        so = self.get_object()
        shipments = request.data.get('shipments')
        if not isinstance(shipments, list) or not shipments:
            return Response({"detail": "shipments must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            movements = SalesService.ship(
                so, shipments,
                user=request.user if request.user.is_authenticated else None,
            )
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        so.refresh_from_db()
        data = self.get_serializer(so).data
        data['movement_ids'] = [str(m.id) for m in movements]
        return Response(data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        so = self.get_object()
        try:
            so = SalesService.cancel(so)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(so).data)
