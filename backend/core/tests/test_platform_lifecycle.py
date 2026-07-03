"""Company lifecycle write API — SUPERADMIN-02 task 4.

The superadmin console drives a company's whole lifecycle over REST: provision a
new developer, promote/demote its tier, suspend/reactivate it, and act-as any
company. Every action is ``IsSuperuser``-gated. The headline assertions are the
security gate (a non-superuser gets 403 on every action) and the suspension
enforcement at login. Mirrors the APIClient style of
``core/tests/test_platform_companies.py``.
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from core.models import ApiKey, Company, User
from core.provisioning import provision_manager_company
from inventory.models.core import Location

PLATFORM_URL = "/api/v1/platform/companies/"
PROVISION_URL = PLATFORM_URL + "provision-developer/"
TOKEN_URL = "/api/token/"
LOCATIONS_URL = "/api/v1/locations/"


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
class TestProvisionDeveloper:
    def test_superuser_provisions_developer_with_admin_and_key(self):
        """Superuser POST → 201, developer tier, exactly 1 admin user + 1 key."""
        client, _superuser = _superuser_client()

        response = client.post(
            PROVISION_URL,
            {
                "name": "New Developer Co",
                "admin_email": "admin@newdev.example",
                "admin_password": "sup3r-secret-pw",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["account_type"] == "developer"
        # The plaintext key + admin echo are surfaced once at creation.
        assert response.data["api_key"]
        assert response.data["admin"]["email"] == "admin@newdev.example"

        company = Company.objects.get(id=response.data["id"])
        assert company.is_developer
        assert company.parent_id is None
        assert User.objects.filter(company=company).count() == 1
        assert ApiKey.objects.filter(company=company).count() == 1


@pytest.mark.django_db
class TestLifecycleSecurityGate:
    """SECURITY GATE: a non-superuser never reaches any lifecycle action."""

    def test_non_superuser_forbidden_on_every_action(self):
        target = _developer(name="Target Dev")
        _company, manager = _manager(company_name="Plain Manager")
        client = APIClient()
        client.force_authenticate(user=manager)

        cases = [
            ("post", PROVISION_URL, {"name": "X"}),
            ("post", f"{PLATFORM_URL}{target.id}/set-tier/", {"account_type": "manager"}),
            ("post", f"{PLATFORM_URL}{target.id}/suspend/", {}),
            ("post", f"{PLATFORM_URL}{target.id}/reactivate/", {}),
        ]
        for method, url, body in cases:
            response = getattr(client, method)(url, body, format="json")
            assert response.status_code == status.HTTP_403_FORBIDDEN, url

        # The target was never mutated by the rejected calls.
        target.refresh_from_db()
        assert target.is_active
        assert target.is_developer


@pytest.mark.django_db
class TestSetTier:
    def test_promote_manager_to_developer(self):
        """set-tier manager→developer flips account_type and returns 200."""
        company, _ = _manager(company_name="Climber Co")
        client, _superuser = _superuser_client()

        response = client.post(
            f"{PLATFORM_URL}{company.id}/set-tier/",
            {"account_type": "developer"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["account_type"] == "developer"
        company.refresh_from_db()
        assert company.is_developer

    def test_demote_developer_with_children_rejected(self):
        """Demoting a developer that still owns children → 400 (invariant held)."""
        developer = _developer(name="Owner Dev")
        Company.objects.create(
            name="Owned Tenant",
            account_type=Company.AccountType.MANAGER,
            parent=developer,
        )
        client, _superuser = _superuser_client()

        response = client.post(
            f"{PLATFORM_URL}{developer.id}/set-tier/",
            {"account_type": "manager"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        developer.refresh_from_db()
        # Tier unchanged: the failed full_clean() blocked the save.
        assert developer.is_developer


@pytest.mark.django_db
class TestSuspensionEnforcedAtLogin:
    def test_suspend_blocks_login_then_reactivate_restores(self):
        """Suspend → user login rejected; reactivate → login works again."""
        company, user = _manager(company_name="Suspendable Co")
        creds = {
            "username": user.username,
            "password": "password123",
            "license_code": company.license_code,
        }
        anon = APIClient()

        # Baseline: login works while active.
        ok = anon.post(TOKEN_URL, creds, format="json")
        assert ok.status_code == status.HTTP_200_OK

        admin_client, _superuser = _superuser_client()
        suspend = admin_client.post(f"{PLATFORM_URL}{company.id}/suspend/", {}, format="json")
        assert suspend.status_code == status.HTTP_200_OK
        company.refresh_from_db()
        assert not company.is_active

        # Suspended: login rejected with the suspension message.
        denied = anon.post(TOKEN_URL, creds, format="json")
        assert denied.status_code == status.HTTP_400_BAD_REQUEST
        assert "suspended" in str(denied.data).lower()

        # Reactivate: login works once more.
        reactivate = admin_client.post(f"{PLATFORM_URL}{company.id}/reactivate/", {}, format="json")
        assert reactivate.status_code == status.HTTP_200_OK
        restored = anon.post(TOKEN_URL, creds, format="json")
        assert restored.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestSuperuserActAs:
    def test_superuser_acts_as_any_company(self):
        """Superuser GET /locations/ with X-Acting-Company → that company's rows.

        The superuser owns no company, so the acting-company header is the only
        scope: resolution returns the targeted company (superuser may target any)
        and the response carries exactly that company's seeded location.
        """
        company, _ = _manager(company_name="ActAs Target")
        location = Location.objects.create(
            company=company,
            name="Target Warehouse",
            type="WAREHOUSE",
        )
        # A second company's location must NOT leak into the scoped response.
        other, _ = _manager(company_name="ActAs Other")
        other_location = Location.objects.create(
            company=other,
            name="Other Warehouse",
            type="WAREHOUSE",
        )

        client, _superuser = _superuser_client()
        response = client.get(LOCATIONS_URL, HTTP_X_ACTING_COMPANY=str(company.id))

        assert response.status_code == status.HTTP_200_OK
        rows = response.data["results"] if "results" in response.data else response.data
        ids = {str(row["id"]) for row in rows}
        assert str(location.id) in ids
        assert str(other_location.id) not in ids
