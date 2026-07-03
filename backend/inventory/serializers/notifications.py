from rest_framework import serializers

from ..models import NotificationChannel, NotificationDelivery


class NotificationChannelSerializer(serializers.ModelSerializer):
    """Channel CRUD. `company` is set by the viewset; `secret` is generated
    server-side and exposed read-only so the owner can verify signatures."""

    class Meta:
        model = NotificationChannel
        fields = [
            "id",
            "name",
            "kind",
            "is_active",
            "recipients",
            "url",
            "secret",
            "headers",
            "event_filter",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "secret", "created_at", "updated_at"]


class NotificationDeliverySerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source="channel.name", read_only=True)
    channel_kind = serializers.CharField(source="channel.kind", read_only=True)
    event_message = serializers.CharField(source="event_log.message", read_only=True)
    product_name = serializers.CharField(source="event_log.product.name", read_only=True)

    class Meta:
        model = NotificationDelivery
        fields = [
            "id",
            "channel",
            "channel_name",
            "channel_kind",
            "event_log",
            "event_message",
            "product_name",
            "status",
            "attempts",
            "last_error",
            "next_retry_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
