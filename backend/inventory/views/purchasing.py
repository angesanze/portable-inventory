from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..api.base import CompanyScopedViewSet
from ..exceptions import InventoryError
from ..models import Location, PurchaseOrder
from ..models.purchasing import PO_STATUS_DRAFT
from ..serializers.purchasing import PurchaseOrderSerializer
from ..services.purchasing import PurchasingService


class PurchaseOrderViewSet(CompanyScopedViewSet):
    """CRUD + lifecycle for purchase orders (PURCHASE-ORDERS-03).

    Writes (update/delete) are limited to DRAFT; status only moves through
    the ``confirm``, ``receive`` and ``cancel`` actions.
    """

    queryset = PurchaseOrder.objects.select_related("supplier", "created_by").prefetch_related(
        "lines__product_model"
    )
    serializer_class = PurchaseOrderSerializer
    filterset_fields = ["status", "supplier"]
    search_fields = ["number", "supplier__name"]
    ordering_fields = ["number", "created_at", "expected_at"]
    ordering = ["-created_at"]

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != PO_STATUS_DRAFT:
            return Response(
                {"detail": "Only DRAFT orders can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != PO_STATUS_DRAFT:
            return Response(
                {"detail": "Only DRAFT orders can be deleted. Cancel the order instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        po = self.get_object()
        try:
            po = PurchasingService.confirm(po)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(po).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        po = self.get_object()
        try:
            po = PurchasingService.cancel(po)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(po).data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        """Receive goods. Body: {location_id, receipts: [{line_id, quantity,
        batch_data?, serials?, expiry_date?}], allow_over?}."""
        po = self.get_object()
        location_id = request.data.get("location_id")
        receipts = request.data.get("receipts")
        allow_over = bool(request.data.get("allow_over", False))

        if not location_id:
            return Response(
                {"detail": "location_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not isinstance(receipts, list) or not receipts:
            return Response(
                {"detail": "receipts must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            location = Location.objects.get(id=location_id, company=po.company)
        except (Location.DoesNotExist, ValueError):
            return Response({"detail": "Location not found."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            movements = PurchasingService.receive(
                po,
                receipts,
                location,
                user=request.user if request.user.is_authenticated else None,
                allow_over=allow_over,
            )
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)

        po.refresh_from_db()
        data = self.get_serializer(po).data
        data["movement_ids"] = [str(m.id) for m in movements]
        return Response(data)
