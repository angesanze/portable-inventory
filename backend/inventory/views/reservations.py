from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Reservation
from ..serializers.reservations import ReservationSerializer
from ..api.base import CompanyScopedViewSet
from ..services.reservations import ReservationService
from ..exceptions import InventoryError


class ReservationViewSet(CompanyScopedViewSet):
    """CRUD + lifecycle for stock reservations.

    Updates limited to reference/expires_at; quantity changes = release +
    re-reserve (keeps the availability check in one place). Physical DELETE
    forbidden — release/ consume are the logical terminal states.
    """

    queryset = Reservation.objects.select_related(
        "product_model", "location", "batch", "physical_product"
    ).order_by("-created_at")
    serializer_class = ReservationSerializer
    filterset_fields = ["status", "product_model", "location"]
    search_fields = ["reference", "product_model__sku", "product_model__name"]

    def perform_create(self, serializer):
        # ReservationService sets company from the product; bypass the
        # default serializer.save(company=...) (Reservation.create handled
        # in serializer.create()).
        serializer.save()

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != "ACTIVE":
            return Response(
                {"detail": "Only ACTIVE reservations can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed = {"reference", "expires_at"}
        if set(request.data.keys()) - allowed:
            return Response(
                {
                    "detail": f"Only {sorted(allowed)} can be edited. Release and re-reserve to change quantity."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, partial=True)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Reservations are not deleted; use release."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        reservation = self.get_object()
        try:
            ReservationService.release(reservation)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(reservation).data)
