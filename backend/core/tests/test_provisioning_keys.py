"""Provisioning invariant: every new manager company gets exactly one key.

DUAL-TIER-09 task 2. Both provisioning paths funnel through
``core.provisioning.provision_manager_company``, so a freshly provisioned
manager company — whether self-service onboarded or developer-created — owns
exactly one ``Default Key``. The ``manage_api_keys`` gate then prevents a
manager from ever minting a second key through the API.
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Company, ApiKey, User
from core.provisioning import provision_manager_company

# Known-valid Italian VAT (mod-10 checksum == 0); shared with test_registration_vat.
VALID_VAT = "00743110157"


@pytest.mark.django_db
class TestProvisioningKeyInvariant:
    def test_helper_seeds_exactly_one_key(self):
        """provision_manager_company creates exactly one Default Key."""
        company, api_key, api_key_value = provision_manager_company(name="Helper Co")

        keys = ApiKey.objects.filter(company=company)
        assert keys.count() == 1
        assert keys.get().pk == api_key.pk
        assert api_key.label == "Default Key"
        assert api_key_value  # plaintext surfaced once

    def test_onboarded_manager_has_exactly_one_key(self):
        """Self-service registration yields a manager company with one key."""
        client = APIClient()
        response = client.post(
            "/api/v1/onboarding/",
            {
                "company_name": "Acme Corp",
                "admin_email": "admin@acme.com",
                "admin_password": "securepass123",
                "industry_type": "manufacturing",
                "vat": VALID_VAT,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

        company = Company.objects.get(id=response.data["company"]["id"])
        assert company.is_manager
        assert ApiKey.objects.filter(company=company).count() == 1

    def test_developer_created_tenant_has_exactly_one_key(self):
        """A developer provisioning a tenant yields one key on the new tenant."""
        developer = Company.objects.create(
            name="Dev Corp",
            license_code="DEVKEY",
            account_type=Company.AccountType.DEVELOPER,
        )
        dev_user = User.objects.create_user(
            username="devadmin",
            password="password123",
            company=developer,
            role="Admin",
        )
        client = APIClient()
        client.force_authenticate(user=dev_user)

        response = client.post("/api/v1/tenants/", {"name": "New Tenant"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        tenant = Company.objects.get(id=response.data["id"])
        assert tenant.is_manager
        assert tenant.parent_id == developer.id
        assert ApiKey.objects.filter(company=tenant).count() == 1

    def test_manager_cannot_mint_second_key_via_api(self):
        """The manage_api_keys gate keeps a manager at exactly one key."""
        company, _api_key, _value = provision_manager_company(name="Mgr Co")
        manager = User.objects.create_user(
            username="mgradmin",
            password="password123",
            company=company,
            role="Admin",
        )
        client = APIClient()
        client.force_authenticate(user=manager)

        response = client.post("/api/v1/api-keys/", {"label": "Sneaky Key"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        # Still exactly the one provisioning key.
        assert ApiKey.objects.filter(company=company).count() == 1
