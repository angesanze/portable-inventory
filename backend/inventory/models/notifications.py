"""Active notification channels: deliver EventLog alerts via email/webhook.

A `NotificationChannel` is a company-scoped destination (email recipients or a
signed webhook). Every attempt to deliver an `EventLog` through a channel is
recorded as a `NotificationDelivery`, which carries the retry state (attempts,
backoff schedule) so the monitor run can piggyback pending retries without a
dedicated scheduler.
"""

import ipaddress
import secrets
import uuid
from urllib.parse import urlparse

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import models

from core.models import Company
from .monitoring import EventLog

# SSRF guard: webhook URLs must not target internal infrastructure. The literal
# check below runs at save time (no DNS so it never breaks on a non-resolving
# host); the service does a second, resolution-based check at send time.
_INTERNAL_HOST_SUFFIXES = (".local", ".internal", ".localhost")


def validate_webhook_url(url):
    """Reject obviously-internal webhook destinations (SSRF guard, no DNS).

    Blocks non-http(s) schemes, IP literals in private/loopback/link-local/
    reserved ranges, and internal hostnames (``localhost``, ``*.local`` …).
    A public hostname that *resolves* to a private IP is caught at send time.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValidationError({"url": "Webhook URL must use http or https."})
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValidationError({"url": "Webhook URL must include a host."})
    if host == "localhost" or host.endswith(_INTERNAL_HOST_SUFFIXES):
        raise ValidationError({"url": "Webhook URL must not target an internal host."})
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and not ip.is_global:
        raise ValidationError({"url": f"Webhook URL must not target a non-public address ({ip})."})


def generate_webhook_secret():
    """64 hex chars used as the HMAC-SHA256 signing key for webhook payloads."""
    return secrets.token_hex(32)


class NotificationChannel(models.Model):
    KIND_CHOICES = [
        ("EMAIL", "Email"),
        ("WEBHOOK", "Webhook"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        Company, on_delete=models.CASCADE, related_name="notification_channels"
    )
    name = models.CharField(max_length=255)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    is_active = models.BooleanField(default=True)

    # EMAIL: comma-separated list of recipient addresses.
    recipients = models.TextField(
        blank=True, help_text="Comma-separated email addresses (EMAIL kind)."
    )

    # WEBHOOK: destination + server-generated signing secret + optional extra headers.
    url = models.URLField(blank=True, help_text="Destination URL (WEBHOOK kind).")
    secret = models.CharField(
        max_length=64,
        default=generate_webhook_secret,
        editable=False,
        help_text="HMAC-SHA256 signing key for the X-PI-Signature header.",
    )
    headers = models.JSONField(
        default=dict, blank=True, help_text="Optional extra HTTP headers (WEBHOOK kind)."
    )

    # Empty list = deliver every event type (THRESHOLD, DATE_OFFSET, ...).
    event_filter = models.JSONField(
        default=list,
        blank=True,
        help_text="Trigger types this channel accepts (empty = all).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        super().clean()
        if self.kind == "EMAIL":
            emails = self.recipient_list
            if not emails:
                raise ValidationError(
                    {"recipients": "At least one recipient email address is required."}
                )
            for email in emails:
                try:
                    validate_email(email)
                except ValidationError:
                    raise ValidationError({"recipients": f"Invalid email address: {email}"})
        elif self.kind == "WEBHOOK":
            if not self.url:
                raise ValidationError({"url": "A webhook URL is required."})
            validate_webhook_url(self.url)
        if self.headers and not isinstance(self.headers, dict):
            raise ValidationError({"headers": "headers must be a JSON object."})
        if self.event_filter and not isinstance(self.event_filter, list):
            raise ValidationError({"event_filter": "event_filter must be a list of trigger types."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def recipient_list(self):
        return [e.strip() for e in (self.recipients or "").split(",") if e.strip()]

    def accepts(self, event_type):
        """True when this channel wants the given trigger type (empty filter = all)."""
        return not self.event_filter or event_type in self.event_filter

    def __str__(self):
        return f"{self.name} [{self.kind}]"


class NotificationDelivery(models.Model):
    """One EventLog × one channel: delivery attempt log with retry state."""

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("SENT", "Sent"),
        ("FAILED", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    channel = models.ForeignKey(
        NotificationChannel, on_delete=models.CASCADE, related_name="deliveries"
    )
    event_log = models.ForeignKey(EventLog, on_delete=models.CASCADE, related_name="deliveries")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "next_retry_at"]),
        ]

    def __str__(self):
        return f"Delivery {self.channel.name} → event {self.event_log_id} [{self.status}]"
