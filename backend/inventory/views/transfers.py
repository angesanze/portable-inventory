from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..api.base import CompanyScopedViewSet
from ..exceptions import InventoryError
from ..models import TransferOrder
from ..models.transfers import TR_STATUS_DRAFT
from ..serializers.transfers import TransferOrderSerializer
from ..services.transfers import TransferService


class TransferOrderViewSet(CompanyScopedViewSet):
    """CRUD + lifecycle for inter-site transfers (TRANSFERS-07).

    Writes (update/delete) are limited to DRAFT; status only moves through the
    ``ship``, ``receive``, ``shortage`` and ``cancel`` actions. The list-level
    ``in_transit`` action exposes goods sitting in the virtual In Transit buffer.
    """

    queryset = TransferOrder.objects.select_related(
        "from_location",
        "to_location",
        "created_by",
    ).prefetch_related("lines__product_model", "lines__batch", "lines__physical_product")
    serializer_class = TransferOrderSerializer
    filterset_fields = ["status", "from_location", "to_location"]
    search_fields = ["number", "from_location__name", "to_location__name"]
    ordering_fields = ["number", "created_at", "shipped_at"]
    ordering = ["-created_at"]

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != TR_STATUS_DRAFT:
            return Response(
                {"detail": "Only DRAFT transfers can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != TR_STATUS_DRAFT:
            return Response(
                {"detail": "Only DRAFT transfers can be deleted. Cancel the transfer instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def _user(self, request):
        return request.user if request.user.is_authenticated else None

    @action(detail=True, methods=["post"])
    def ship(self, request, pk=None):
        order = self.get_object()
        try:
            movements = TransferService.ship(order, user=self._user(request))
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        order.refresh_from_db()
        data = self.get_serializer(order).data
        data["movement_ids"] = [str(m.id) for m in movements]
        return Response(data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        """Body: {receipts: [{line_id, quantity}]}."""
        order = self.get_object()
        receipts = request.data.get("receipts")
        if not isinstance(receipts, list) or not receipts:
            return Response(
                {"detail": "receipts must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            movements = TransferService.receive(order, receipts, user=self._user(request))
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        order.refresh_from_db()
        data = self.get_serializer(order).data
        data["movement_ids"] = [str(m.id) for m in movements]
        return Response(data)

    @action(detail=True, methods=["post"])
    def shortage(self, request, pk=None):
        """Body: {line_id, quantity}. Books the missing goods to LOSS."""
        order = self.get_object()
        line_id = request.data.get("line_id")
        quantity = request.data.get("quantity")
        if not line_id:
            return Response({"detail": "line_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            movements = TransferService.report_shortage(
                order, line_id, quantity, user=self._user(request)
            )
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        order.refresh_from_db()
        data = self.get_serializer(order).data
        data["movement_ids"] = [str(m.id) for m in movements]
        return Response(data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        try:
            order = TransferService.cancel(order)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(order).data)

    @action(detail=False, methods=["get"])
    def in_transit(self, request):
        """Goods currently parked in the company's In Transit virtual location."""
        company = self.get_effective_company()
        if company is None:
            return Response({"total": "0", "by_product": []})
        report = TransferService.in_transit_stock(company)
        return Response(
            {
                "total": str(report["total"]),
                "by_product": [
                    {**row, "quantity": str(row["quantity"])} for row in report["by_product"]
                ],
            }
        )
