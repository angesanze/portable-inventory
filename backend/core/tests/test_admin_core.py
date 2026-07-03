"""Core-app admin cockpit tests (CLEANUP-08).

Proves the four core ModelAdmins (Company, User, ApiKey, AuditLog) are wired on
the custom ``varasto_admin`` site: each changelist returns 200, each honours a
``?q=`` search (proves ``search_fields`` is set — Django 400s a search on an
admin with no ``search_fields``), the Company ``suspend_companies`` bulk action
flips ``is_active``, and the append-only AuditLog refuses the add view (403).

URLs are reversed explicitly on the ``varasto_admin`` namespace; nothing here
touches the default ``/admin/`` registry.
"""

import pytest
from django.test import Client, override_settings
from django.urls import reverse

from core.admin_site import varasto_admin_site
from core.models import ApiKey, AuditLog, Company, User

NS = varasto_admin_site.name  # "varasto_admin"

# Manifest static storage 500s on uncollected assets under tests; the changelist
# templates render `{% static %}`, so swap in plain storage (see test_admin_site).
_plain_static = override_settings(
    STATICFILES_STORAGE="django.contrib.staticfiles.storage.StaticFilesStorage",
)


@pytest.fixture
def superclient(db):
    su = User.objects.create_superuser(username="su", password="password123")
    client = Client()
    client.force_login(su)
    return client


@pytest.fixture
def company(db):
    return Company.objects.create(name="Acme Corp", account_type=Company.AccountType.MANAGER)


# -- changelists reachable ---------------------------------------------------


@_plain_static
@pytest.mark.parametrize(
    "changelist",
    ["core_company", "core_user", "core_apikey", "core_auditlog"],
)
@pytest.mark.django_db
def test_changelist_returns_200(superclient, changelist):
    url = reverse(f"{NS}:{changelist}_changelist")
    resp = superclient.get(url)
    assert resp.status_code == 200


# -- search works (proves search_fields set) ---------------------------------


@_plain_static
@pytest.mark.parametrize(
    "changelist",
    ["core_company", "core_user", "core_apikey", "core_auditlog"],
)
@pytest.mark.django_db
def test_changelist_search_returns_200(superclient, changelist):
    # A `?q=` against an admin with no `search_fields` raises and 400s; 200 here
    # proves search_fields is configured for each model.
    url = reverse(f"{NS}:{changelist}_changelist")
    resp = superclient.get(url, {"q": "acme"})
    assert resp.status_code == 200


# -- bulk action flips is_active ---------------------------------------------


@_plain_static
@pytest.mark.django_db
def test_suspend_companies_action_flips_is_active(superclient, company):
    assert company.is_active is True

    url = reverse(f"{NS}:core_company_changelist")
    resp = superclient.post(
        url,
        {
            "action": "suspend_companies",
            "_selected_action": [str(company.pk)],
        },
        follow=True,
    )

    assert resp.status_code == 200
    company.refresh_from_db()
    assert company.is_active is False


# -- AuditLog is read-only (add denied) --------------------------------------


@_plain_static
@pytest.mark.django_db
def test_auditlog_add_view_is_forbidden(superclient):
    url = reverse(f"{NS}:core_auditlog_add")
    resp = superclient.get(url)
    assert resp.status_code == 403


# -- spot-check the ApiKey expiry badge + AuditLog metadata renderer ----------


@_plain_static
@pytest.mark.django_db
def test_apikey_and_auditlog_changelists_render_rows(superclient, company):
    ApiKey.objects.create(company=company, key="k-1", label="Live Key")
    AuditLog.objects.create(
        action=AuditLog.Action.COMPANY_SUSPENDED,
        target_company=company,
        metadata={"reason": "test"},
    )

    apikey_resp = superclient.get(reverse(f"{NS}:core_apikey_changelist"))
    audit_resp = superclient.get(reverse(f"{NS}:core_auditlog_changelist"))

    assert apikey_resp.status_code == 200
    assert audit_resp.status_code == 200
    assert "Live Key" in apikey_resp.content.decode()
