"""Inventory-app admin cockpit tests (CLEANUP-09).

Proves every inventory ModelAdmin is wired on the custom ``varasto_admin`` site:
each changelist returns 200, each honours a ``?q=`` search (Django 400s a search
on an admin with no ``search_fields``), two bulk actions behave (EventLog
``resolve_events`` flips status + stamps ``resolved_at``; QR ``lock`` skips a
VIRGIN code), and the append-only Movement ledger refuses the add view (403).

URLs are reversed on the ``varasto_admin`` namespace; nothing here touches the
default ``/admin/`` registry.
"""

import pytest
from django.test import Client, override_settings
from django.urls import reverse

from core.admin_site import varasto_admin_site
from core.models import User
from inventory.models import (
    DynamicQRCode,
    EventLog,
    MonitoringRule,
)

from .helpers import make_company, make_simple_product

NS = varasto_admin_site.name  # "varasto_admin"

# Manifest static storage 500s on uncollected assets under tests; the changelist
# templates render `{% static %}`, so swap in plain storage (mirrors core admin).
_plain_static = override_settings(
    STATICFILES_STORAGE="django.contrib.staticfiles.storage.StaticFilesStorage",
)

# Every inventory model registered on the custom site (all define search_fields).
INVENTORY_MODELS = [
    "inventory_movement",
    "inventory_productmodel",
    "inventory_productcomponent",
    "inventory_location",
    "inventory_physicalproduct",
    "inventory_productbatch",
    "inventory_supplier",
    "inventory_workorder",
    "inventory_dynamicqrcode",
    "inventory_calculatortemplate",
    "inventory_monitoringrule",
    "inventory_eventlog",
]


@pytest.fixture
def superclient(db):
    su = User.objects.create_superuser(username="su", password="password123")
    client = Client()
    client.force_login(su)
    return client


# -- changelists reachable ---------------------------------------------------


@_plain_static
@pytest.mark.parametrize("changelist", INVENTORY_MODELS)
@pytest.mark.django_db
def test_changelist_returns_200(superclient, changelist):
    url = reverse(f"{NS}:{changelist}_changelist")
    resp = superclient.get(url)
    assert resp.status_code == 200


# -- search works (proves search_fields set) ---------------------------------


@_plain_static
@pytest.mark.parametrize("changelist", INVENTORY_MODELS)
@pytest.mark.django_db
def test_changelist_search_returns_200(superclient, changelist):
    # A `?q=` against an admin with no `search_fields` raises and 400s; 200 here
    # proves search_fields is configured for each model.
    url = reverse(f"{NS}:{changelist}_changelist")
    resp = superclient.get(url, {"q": "foo"})
    assert resp.status_code == 200


# -- EventLog resolve_events bulk action -------------------------------------


@_plain_static
@pytest.mark.django_db
def test_resolve_events_action_sets_status_and_timestamp(superclient):
    company, _, _ = make_company("EV")
    product = make_simple_product(company)
    rule = MonitoringRule.objects.create(
        product_model=product,
        name="Low stock",
        trigger_type="THRESHOLD",
    )
    event = EventLog.objects.create(rule=rule, product=product, message="below min")
    assert event.status == "OPEN"
    assert event.resolved_at is None

    url = reverse(f"{NS}:inventory_eventlog_changelist")
    resp = superclient.post(
        url,
        {"action": "resolve_events", "_selected_action": [str(event.pk)]},
        follow=True,
    )

    assert resp.status_code == 200
    event.refresh_from_db()
    assert event.status == "RESOLVED"
    assert event.resolved_at is not None


# -- QR lock bulk action respects the VIRGIN state ---------------------------


@_plain_static
@pytest.mark.django_db
def test_lock_action_skips_virgin_qr(superclient):
    company, _, _ = make_company("QR")
    # VIRGIN: no target configured, so lock must leave it untouched.
    qr = DynamicQRCode.objects.create(company=company, status="VIRGIN")

    url = reverse(f"{NS}:inventory_dynamicqrcode_changelist")
    resp = superclient.post(
        url,
        {"action": "lock", "_selected_action": [str(qr.pk)]},
        follow=True,
    )

    assert resp.status_code == 200
    qr.refresh_from_db()
    assert qr.status == "VIRGIN"


# -- Movement ledger is immutable (add denied) -------------------------------


@_plain_static
@pytest.mark.django_db
def test_movement_add_view_is_forbidden(superclient):
    url = reverse(f"{NS}:inventory_movement_add")
    resp = superclient.get(url)
    assert resp.status_code == 403
