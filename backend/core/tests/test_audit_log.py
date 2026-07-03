"""Platform audit trail — SUPERADMIN-04 task 4.

Lifecycle actions must leave a durable, superuser-readable record of *who* did
*what* to *which* company. These tests assert that provisioning, tier changes,
and suspension write the right :class:`core.models.AuditLog` rows, that the
superuser-only ``/platform/audit/`` endpoint lists them newest-first and filters
by ``?action=``, and — the security gate — that a non-superuser is refused.
Mirrors the APIClient style of ``core/tests/test_platform_lifecycle.py``.
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog, Company, User
from core.provisioning import provision_manager_company

PLATFORM_URL = "/api/v1/platform/companies/"
PROVISION_URL = PLATFORM_URL + "provision-developer/"
AUDIT_URL = "/api/v1/platform/audit/"


def _superuser_client():
    superuser = User.objects.create_superuser(
        username="platform-admin",
        password="password123",
    )
    client = APIClient()
    client.force_authenticate(user=superuser)
    return client, superuser


def _manager(company_name="Mgr Co", **kwargs):
    company, _api_key, _value = provision_manager_company(name=company_name, **kwargs)
    user = User.objects.create_user(
        username=f"mgr-{company.id}",
        password="password123",
        company=company,
        role="Admin",
    )
    return company, user


def _developer(name="Dev Co"):
    return Company.objects.create(
        name=name,
        account_type=Company.AccountType.DEVELOPER,
    )


@pytest.mark.django_db
class TestLifecycleWritesAudit:
    def test_provision_developer_writes_audit_row(self):
        """Provisioning a developer → COMPANY_PROVISIONED with actor + target."""
        client, superuser = _superuser_client()

        response = client.post(PROVISION_URL, {"name": "Audited Dev Co"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        company = Company.objects.get(id=response.data["id"])
        entry = AuditLog.objects.get(action=AuditLog.Action.COMPANY_PROVISIONED)
        assert entry.actor_id == superuser.id
        assert entry.target_company_id == company.id
        assert entry.metadata["name"] == "Audited Dev Co"

    def test_set_tier_writes_audit_with_from_to_metadata(self):
        """set-tier → TIER_CHANGED carrying {from, to} tiers in metadata."""
        company, _ = _manager(company_name="Climber Co")
        client, superuser = _superuser_client()

        response = client.post(
            f"{PLATFORM_URL}{company.id}/set-tier/",
            {"account_type": "developer"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        entry = AuditLog.objects.get(action=AuditLog.Action.TIER_CHANGED)
        assert entry.actor_id == superuser.id
        assert entry.target_company_id == company.id
        assert entry.metadata["from"] == Company.AccountType.MANAGER
        assert entry.metadata["to"] == Company.AccountType.DEVELOPER

    def test_suspend_writes_audit_row(self):
        """suspend → COMPANY_SUSPENDED with actor + target."""
        company, _ = _manager(company_name="Suspendable Co")
        client, superuser = _superuser_client()

        response = client.post(f"{PLATFORM_URL}{company.id}/suspend/", {}, format="json")
        assert response.status_code == status.HTTP_200_OK

        entry = AuditLog.objects.get(action=AuditLog.Action.COMPANY_SUSPENDED)
        assert entry.actor_id == superuser.id
        assert entry.target_company_id == company.id


@pytest.mark.django_db
class TestAuditEndpoint:
    def test_lists_newest_first_and_filters_by_action(self):
        """GET /platform/audit/ → newest-first; ?action= narrows the result set."""
        company, _ = _manager(company_name="Lifecycle Co")
        client, _superuser = _superuser_client()

        # Two distinct actions, in order: tier change then suspend.
        client.post(
            f"{PLATFORM_URL}{company.id}/set-tier/",
            {"account_type": "developer"},
            format="json",
        )
        client.post(f"{PLATFORM_URL}{company.id}/suspend/", {}, format="json")

        response = client.get(AUDIT_URL)
        assert response.status_code == status.HTTP_200_OK
        rows = response.data["results"] if "results" in response.data else response.data
        actions = [row["action"] for row in rows]
        assert actions == [
            AuditLog.Action.COMPANY_SUSPENDED,
            AuditLog.Action.TIER_CHANGED,
        ]

        filtered = client.get(AUDIT_URL, {"action": AuditLog.Action.TIER_CHANGED})
        assert filtered.status_code == status.HTTP_200_OK
        f_rows = filtered.data["results"] if "results" in filtered.data else filtered.data
        assert len(f_rows) == 1
        assert f_rows[0]["action"] == AuditLog.Action.TIER_CHANGED


@pytest.mark.django_db
class TestAuditSecurityGate:
    """SECURITY GATE: a non-superuser never reads the platform audit trail."""

    def test_non_superuser_forbidden(self):
        _company, manager = _manager(company_name="Plain Manager")
        client = APIClient()
        client.force_authenticate(user=manager)

        response = client.get(AUDIT_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN
