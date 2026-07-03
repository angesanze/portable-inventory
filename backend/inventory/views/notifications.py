from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from ..api.base import CompanyScopedViewSet, ReadOnlyCompanyScopedViewSet
from ..models import NotificationChannel, NotificationDelivery
from ..serializers.notifications import (
    NotificationChannelSerializer,
    NotificationDeliverySerializer,
)
from ..services.notifications import NotificationService


class NotificationChannelViewSet(CompanyScopedViewSet):
    """CRUD for notification channels + a `test/` action that sends a probe."""

    queryset = NotificationChannel.objects.all().order_by("-created_at")
    serializer_class = NotificationChannelSerializer
    filterset_fields = ["kind", "is_active"]
    search_fields = ["name", "url", "recipients"]

    def perform_update(self, serializer):
        # Model.save() runs full clean(); surface it as a DRF 400 like
        # CompanyScopedViewSet.perform_create does.
        try:
            serializer.save()
        except DjangoValidationError as e:
            raise DRFValidationError(e.message_dict if hasattr(e, "message_dict") else str(e))

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        """Send a synthetic TEST notification through this channel."""
        channel = self.get_object()
        ok, error = NotificationService.send_test(channel)
        return Response(
            {"success": ok, "error": error},
            status=status.HTTP_200_OK if ok else status.HTTP_502_BAD_GATEWAY,
        )


class NotificationDeliveryViewSet(ReadOnlyCompanyScopedViewSet):
    """Read-only delivery log (status / attempts / last error per channel)."""

    queryset = NotificationDelivery.objects.select_related(
        "channel",
        "event_log",
        "event_log__product",
    ).order_by("-created_at")
    serializer_class = NotificationDeliverySerializer
    company_field = "channel__company"
    filterset_fields = ["status", "channel"]
