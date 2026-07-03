"""NOTIFICATIONS-02: EventLog fan-out to email + HMAC-signed webhooks.

Webhook transport is stubbed by patching ``urlopen`` in the service module —
no network. Email uses Django's test outbox (locmem backend under pytest).
"""

import hashlib
import hmac
import json
from datetime import timedelta
from urllib.error import URLError

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from inventory.models import (
    EventLog,
    MonitoringRule,
    NotificationChannel,
    NotificationDelivery,
)
from inventory.monitors import RuleEvaluator
from inventory.services.notifications import NotificationService
from .helpers import make_company, make_simple_product

import inventory.services.notifications as notifications_module


# ── Webhook transport stub ──────────────────────────────────────────


class FakeResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeTransport:
    """Captures every webhook Request; optionally fails the next N calls."""

    def __init__(self):
        self.requests = []
        self.fail_times = 0

    def __call__(self, req, timeout=None):
        self.timeout = timeout
        if self.fail_times > 0:
            self.fail_times -= 1
            raise URLError("connection refused")
        self.requests.append(req)
        return FakeResponse()


@pytest.fixture
def transport(monkeypatch):
    fake = FakeTransport()
    monkeypatch.setattr(notifications_module, "urlopen", fake)
    return fake


# ── Fixtures ────────────────────────────────────────────────────────


@pytest.fixture
def env(db):
    company_a, user_a, _ = make_company("NOTA")
    company_b, user_b, _ = make_company("NOTB")
    product = make_simple_product(company_a, sku="NOTIF-1", name="Notified Product")
    rule = MonitoringRule.objects.create(
        product_model=product,
        name="Low stock",
        trigger_type="THRESHOLD",
        condition_config={"min": 5},
        severity="CRITICAL",
    )
    return {
        "company_a": company_a,
        "user_a": user_a,
        "company_b": company_b,
        "user_b": user_b,
        "product": product,
        "rule": rule,
    }


def make_email_channel(company, recipients="ops@example.com,boss@example.com", **kw):
    return NotificationChannel.objects.create(
        company=company,
        name="Ops email",
        kind="EMAIL",
        recipients=recipients,
        **kw,
    )


def make_webhook_channel(company, url="https://hooks.example.com/pi", **kw):
    return NotificationChannel.objects.create(
        company=company,
        name="Ops webhook",
        kind="WEBHOOK",
        url=url,
        **kw,
    )


def open_event(env):
    """Run the monitor so it creates the OPEN EventLog (and dispatches)."""
    RuleEvaluator.evaluate_product(env["product"])
    return EventLog.objects.get(product=env["product"], status="OPEN")


# ── Dispatch: email ─────────────────────────────────────────────────


def test_threshold_violation_sends_email_within_monitor_run(env):
    channel = make_email_channel(env["company_a"])
    open_event(env)

    assert len(mail.outbox) == 1
    msg = mail.outbox[0]
    assert msg.subject == "[Portable Inventory] THRESHOLD — Notified Product"
    assert set(msg.to) == {"ops@example.com", "boss@example.com"}
    assert "below minimum threshold" in msg.body
    assert "CRITICAL" in msg.body
    assert str(env["product"].id) in msg.body  # link to the product

    delivery = NotificationDelivery.objects.get(channel=channel)
    assert delivery.status == "SENT"
    assert delivery.attempts == 1
    assert delivery.next_retry_at is None


def test_recheck_does_not_duplicate_delivery(env):
    make_email_channel(env["company_a"])
    open_event(env)
    RuleEvaluator.evaluate_product(env["product"])  # event already OPEN

    assert EventLog.objects.filter(product=env["product"]).count() == 1
    assert NotificationDelivery.objects.count() == 1
    assert len(mail.outbox) == 1


# ── Dispatch: webhook + signature ───────────────────────────────────


def test_webhook_posts_signed_payload(env, transport):
    channel = make_webhook_channel(env["company_a"], headers={"X-Custom": "abc"})
    event = open_event(env)

    assert len(transport.requests) == 1
    req = transport.requests[0]
    assert req.full_url == "https://hooks.example.com/pi"
    assert transport.timeout == notifications_module.WEBHOOK_TIMEOUT_SECONDS

    body = req.data
    payload = json.loads(body.decode("utf-8"))
    assert payload["event_id"] == str(event.id)
    assert payload["type"] == "THRESHOLD"
    assert payload["company_id"] == str(env["company_a"].id)
    assert payload["product"]["sku"] == "NOTIF-1"
    assert payload["payload"]["severity"] == "CRITICAL"
    assert payload["created_at"]

    # HMAC-SHA256 of the exact body, keyed with the channel secret.
    expected = hmac.new(channel.secret.encode(), body, hashlib.sha256).hexdigest()
    assert req.headers.get("X-pi-signature") == f"sha256={expected}"
    assert req.headers.get("X-custom") == "abc"

    delivery = NotificationDelivery.objects.get(channel=channel)
    assert delivery.status == "SENT"


# ── Retry / backoff ─────────────────────────────────────────────────


def test_failed_webhook_schedules_exponential_backoff(env, transport):
    channel = make_webhook_channel(env["company_a"])
    transport.fail_times = 2
    before = timezone.now()
    open_event(env)

    delivery = NotificationDelivery.objects.get(channel=channel)
    assert delivery.status == "PENDING"
    assert delivery.attempts == 1
    assert delivery.last_error
    # 2^1 * 60s backoff
    delta = delivery.next_retry_at - before
    assert timedelta(minutes=2) <= delta <= timedelta(minutes=2, seconds=30)

    # Not due yet → retry_pending skips it.
    assert NotificationService.retry_pending() == 0

    # Force due; second attempt still fails → 2^2 * 60s backoff.
    delivery.next_retry_at = timezone.now() - timedelta(seconds=1)
    delivery.save(update_fields=["next_retry_at"])
    before = timezone.now()
    assert NotificationService.retry_pending() == 1
    delivery.refresh_from_db()
    assert delivery.attempts == 2
    assert delivery.status == "PENDING"
    delta = delivery.next_retry_at - before
    assert timedelta(minutes=4) <= delta <= timedelta(minutes=4, seconds=30)

    # Third attempt succeeds.
    delivery.next_retry_at = timezone.now() - timedelta(seconds=1)
    delivery.save(update_fields=["next_retry_at"])
    assert NotificationService.retry_pending() == 1
    delivery.refresh_from_db()
    assert delivery.status == "SENT"
    assert delivery.attempts == 3
    assert delivery.last_error == ""
    assert delivery.next_retry_at is None


def test_webhook_failed_after_max_attempts(env, transport):
    channel = make_webhook_channel(env["company_a"])
    transport.fail_times = 99
    open_event(env)

    delivery = NotificationDelivery.objects.get(channel=channel)
    for _ in range(notifications_module.MAX_ATTEMPTS - 1):
        delivery.next_retry_at = timezone.now() - timedelta(seconds=1)
        delivery.save(update_fields=["next_retry_at"])
        NotificationService.retry_pending()
        delivery.refresh_from_db()

    assert delivery.attempts == notifications_module.MAX_ATTEMPTS
    assert delivery.status == "FAILED"
    assert delivery.next_retry_at is None
    # Terminal: no longer picked up.
    assert NotificationService.retry_pending() == 0


# ── Channel matching ────────────────────────────────────────────────


def test_inactive_channel_is_ignored(env):
    make_email_channel(env["company_a"], is_active=False)
    open_event(env)
    assert NotificationDelivery.objects.count() == 0
    assert len(mail.outbox) == 0


def test_event_filter_excludes_other_trigger_types(env, transport):
    make_webhook_channel(env["company_a"], event_filter=["DATE_OFFSET"])
    matching = make_email_channel(env["company_a"], event_filter=["THRESHOLD"])
    open_event(env)

    assert transport.requests == []
    deliveries = NotificationDelivery.objects.all()
    assert deliveries.count() == 1
    assert deliveries[0].channel_id == matching.id


def test_other_company_channel_never_receives_event(env):
    make_email_channel(env["company_b"], recipients="b@example.com")
    open_event(env)
    assert NotificationDelivery.objects.count() == 0
    assert len(mail.outbox) == 0


# ── Model validation ────────────────────────────────────────────────


def test_email_channel_validates_recipients(env):
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        make_email_channel(env["company_a"], recipients="not-an-email")
    with pytest.raises(ValidationError):
        make_email_channel(env["company_a"], recipients="")
    with pytest.raises(ValidationError):
        NotificationChannel.objects.create(
            company=env["company_a"],
            name="No URL",
            kind="WEBHOOK",
            url="",
        )


# ── API ─────────────────────────────────────────────────────────────


def api_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_channel_api_is_company_scoped(env):
    channel = make_email_channel(env["company_a"])
    client_a = api_client(env["user_a"])
    client_b = api_client(env["user_b"])

    res_a = client_a.get("/api/v1/notification-channels/")
    assert res_a.status_code == 200
    data_a = res_a.json()
    rows_a = data_a["results"] if isinstance(data_a, dict) and "results" in data_a else data_a
    assert [row["id"] for row in rows_a] == [str(channel.id)]

    res_b = client_b.get("/api/v1/notification-channels/")
    assert res_b.status_code == 200
    data_b = res_b.json()
    rows_b = data_b["results"] if isinstance(data_b, dict) and "results" in data_b else data_b
    assert rows_b == []

    # Cross-tenant detail access is a 404.
    assert client_b.get(f"/api/v1/notification-channels/{channel.id}/").status_code == 404


def test_channel_create_via_api_sets_company_and_secret(env):
    client = api_client(env["user_a"])
    res = client.post(
        "/api/v1/notification-channels/",
        {
            "name": "Hook",
            "kind": "WEBHOOK",
            "url": "https://hooks.example.com/x",
        },
        format="json",
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert len(body["secret"]) == 64  # server-generated
    channel = NotificationChannel.objects.get(id=body["id"])
    assert channel.company_id == env["company_a"].id


def test_channel_create_invalid_email_is_400(env):
    client = api_client(env["user_a"])
    res = client.post(
        "/api/v1/notification-channels/",
        {
            "name": "Bad",
            "kind": "EMAIL",
            "recipients": "nope",
        },
        format="json",
    )
    assert res.status_code == 400


def test_test_action_sends_probe_email(env):
    channel = make_email_channel(env["company_a"])
    client = api_client(env["user_a"])
    res = client.post(f"/api/v1/notification-channels/{channel.id}/test/")
    assert res.status_code == 200
    assert res.json() == {"success": True, "error": None}
    assert len(mail.outbox) == 1
    assert "TEST" in mail.outbox[0].subject
    # A probe writes no delivery row (there is no EventLog behind it).
    assert NotificationDelivery.objects.count() == 0


def test_test_action_reports_webhook_failure(env, transport):
    transport.fail_times = 1
    channel = make_webhook_channel(env["company_a"])
    client = api_client(env["user_a"])
    res = client.post(f"/api/v1/notification-channels/{channel.id}/test/")
    assert res.status_code == 502
    body = res.json()
    assert body["success"] is False
    assert "connection refused" in body["error"]


def test_deliveries_api_scoped_and_secretless(env, transport):
    make_webhook_channel(env["company_a"])
    open_event(env)

    client_a = api_client(env["user_a"])
    res = client_a.get("/api/v1/notification-deliveries/")
    assert res.status_code == 200
    data = res.json()
    rows = data["results"] if isinstance(data, dict) and "results" in data else data
    assert len(rows) == 1
    assert rows[0]["status"] == "SENT"
    assert "secret" not in rows[0]

    client_b = api_client(env["user_b"])
    res_b = client_b.get("/api/v1/notification-deliveries/")
    data_b = res_b.json()
    rows_b = data_b["results"] if isinstance(data_b, dict) and "results" in data_b else data_b
    assert rows_b == []
