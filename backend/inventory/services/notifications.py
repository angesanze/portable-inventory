"""Active notifications: fan EventLog alerts out to email + signed webhooks.

Delivery is synchronous and inline (no celery/redis — the infra was simplified
on purpose, see the infra-simplification memory). Webhooks use stdlib urllib
with a tight 5s timeout so a dead endpoint can't stall a monitor run. Failures
are retried with exponential backoff on subsequent monitor runs via
``retry_pending()`` (piggyback — no new scheduler).
"""

import hashlib
import hmac
import ipaddress
import json
import logging
import socket
from datetime import timedelta
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from ..models import NotificationChannel, NotificationDelivery

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT_SECONDS = 5
MAX_ATTEMPTS = 5
BACKOFF_BASE_SECONDS = 60  # next_retry_at = now + 2^attempts * 60s


class NotificationService:
    """Dispatch EventLog records to the active channels of their company."""

    # ── Public API ───────────────────────────────────────────────────

    @staticmethod
    def dispatch_event(event_log):
        """Create a PENDING delivery per matching channel and try it inline.

        Channels are matched on the company of the event's product, must be
        active, and must accept the event's trigger type. Returns the list of
        NotificationDelivery rows created.
        """
        company_id = event_log.product.company_id
        event_type = NotificationService._event_type(event_log)
        channels = NotificationChannel.objects.filter(
            company_id=company_id,
            is_active=True,
        )
        deliveries = []
        for channel in channels:
            if not channel.accepts(event_type):
                continue
            delivery = NotificationDelivery.objects.create(
                channel=channel,
                event_log=event_log,
            )
            NotificationService._attempt(delivery)
            deliveries.append(delivery)
        return deliveries

    @staticmethod
    def retry_pending():
        """Retry every PENDING delivery whose backoff window has elapsed.

        Called at the start of each monitor run (piggyback scheduling).
        Returns the number of deliveries attempted.
        """
        due = NotificationDelivery.objects.filter(
            status="PENDING",
            next_retry_at__lte=timezone.now(),
        ).select_related("channel", "event_log", "event_log__product", "event_log__rule")
        count = 0
        for delivery in due:
            NotificationService._attempt(delivery)
            count += 1
        return count

    @staticmethod
    def send_test(channel):
        """Send a synthetic TEST notification through the channel.

        No NotificationDelivery row is written (there is no EventLog).
        Returns ``(ok: bool, error: str | None)``.
        """
        try:
            if channel.kind == "EMAIL":
                send_mail(
                    subject="[Portable Inventory] TEST — notification channel check",
                    message=(
                        f'This is a test notification for channel "{channel.name}".\n'
                        "If you are reading this, email delivery is configured correctly."
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=channel.recipient_list,
                    fail_silently=False,
                )
            else:
                payload = {
                    "event_id": None,
                    "type": "TEST",
                    "company_id": str(channel.company_id),
                    "product": None,
                    "payload": {"message": f'Test notification for channel "{channel.name}".'},
                    "created_at": timezone.now().isoformat(),
                }
                NotificationService._post_webhook(channel, payload)
            return True, None
        except Exception as exc:  # noqa: BLE001 — surface any transport error to the caller
            logger.warning("Test notification failed for channel %s: %s", channel.id, exc)
            return False, str(exc)

    # ── Internals ────────────────────────────────────────────────────

    @staticmethod
    def _event_type(event_log):
        """Trigger type of the event's rule; virtual/missing rules count as THRESHOLD."""
        rule = event_log.rule
        return rule.trigger_type if rule and rule.trigger_type else "THRESHOLD"

    @staticmethod
    def _attempt(delivery):
        """Single send attempt; updates status/attempts/backoff on the row."""
        channel = delivery.channel
        event_log = delivery.event_log
        try:
            if channel.kind == "EMAIL":
                NotificationService._send_email(channel, event_log)
            else:
                NotificationService._send_webhook(channel, event_log)
        except Exception as exc:  # noqa: BLE001 — any transport error schedules a retry
            delivery.attempts += 1
            # Never log the channel secret: only the exception text is stored.
            delivery.last_error = str(exc)[:1000]
            if delivery.attempts >= MAX_ATTEMPTS:
                delivery.status = "FAILED"
                delivery.next_retry_at = None
            else:
                delivery.status = "PENDING"
                delivery.next_retry_at = timezone.now() + timedelta(
                    seconds=(2**delivery.attempts) * BACKOFF_BASE_SECONDS,
                )
            delivery.save(
                update_fields=["attempts", "last_error", "status", "next_retry_at", "updated_at"]
            )
            logger.warning(
                "Notification delivery %s attempt %s failed: %s",
                delivery.id,
                delivery.attempts,
                exc,
            )
            return False

        delivery.attempts += 1
        delivery.status = "SENT"
        delivery.last_error = ""
        delivery.next_retry_at = None
        delivery.save(
            update_fields=["attempts", "last_error", "status", "next_retry_at", "updated_at"]
        )
        return True

    @staticmethod
    def _send_email(channel, event_log):
        product = event_log.product
        event_type = NotificationService._event_type(event_log)
        severity = event_log.rule.severity if event_log.rule else "WARNING"
        link = f"{settings.FRONTEND_BASE_URL}/products/{product.id}"
        subject = f"[Portable Inventory] {event_type} — {product.name}"
        body = (
            f"Product: {product.name} (SKU {product.sku})\n"
            f"Severity: {severity}\n"
            f"Alert: {event_log.message}\n"
            f"Raised at: {event_log.created_at.isoformat()}\n"
            f"Details: {link}\n"
        )
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=channel.recipient_list,
            fail_silently=False,
        )

    @staticmethod
    def _send_webhook(channel, event_log):
        product = event_log.product
        payload = {
            "event_id": str(event_log.id),
            "type": NotificationService._event_type(event_log),
            "company_id": str(channel.company_id),
            "product": {
                "id": str(product.id),
                "sku": product.sku,
                "name": product.name,
            },
            "payload": {
                "message": event_log.message,
                "severity": event_log.rule.severity if event_log.rule else "WARNING",
                "rule_id": str(event_log.rule_id) if event_log.rule_id else None,
                "batch_id": str(event_log.batch_id) if event_log.batch_id else None,
                "status": event_log.status,
            },
            "created_at": event_log.created_at.isoformat(),
        }
        NotificationService._post_webhook(channel, payload)

    @staticmethod
    def _assert_public_host(url):
        """SSRF guard at send time: refuse URLs resolving to non-public IPs.

        Complements the literal check in ``NotificationChannel.clean()`` by
        catching public hostnames that resolve to private/loopback/link-local
        addresses (DNS rebinding). If the host cannot be resolved here, we do
        NOT block — ``urlopen`` will surface the failure (and tests using
        non-resolving example hosts keep working).
        """
        parsed = urlparse(url)
        host = parsed.hostname
        if not host:
            raise ValueError("Webhook URL has no host.")
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        try:
            infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        except OSError:
            return
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if not ip.is_global:
                raise ValueError(f"Refusing webhook to non-public address {ip} ({host}).")

    @staticmethod
    def _post_webhook(channel, payload):
        """POST JSON to the channel URL, signed with HMAC-SHA256 of the body."""
        NotificationService._assert_public_host(channel.url)
        body = json.dumps(payload).encode("utf-8")
        signature = hmac.new(channel.secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "X-PI-Signature": f"sha256={signature}",
        }
        for key, value in (channel.headers or {}).items():
            headers[str(key)] = str(value)
        req = Request(channel.url, data=body, headers=headers, method="POST")
        # urlopen raises HTTPError on 4xx/5xx and URLError on network failures.
        with urlopen(req, timeout=WEBHOOK_TIMEOUT_SECONDS):
            pass
