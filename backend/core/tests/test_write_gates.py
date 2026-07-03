"""
End-to-end write-gate tests for the dual-tier (manager/developer) model.

These exercise the HTTP boundary where companies and users are provisioned:

* managers (leaf tenants) get ``403`` from the tenant-create endpoint;
* developers may create *manager* child companies parented to themselves,
  seeded with a default location and one API key;
* nobody may create a ``developer`` company through this endpoint;
* developers may create users only inside their OWN child companies;
* superusers may provision developer companies (via the dedicated path).

Complements the unit tests in ``test_permissions.py`` and ``test_user_invite.py``.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import ApiKey, Company
from inventory.models import Location

User = get_user_model()


class WriteGateTests(APITestCase):
    def setUp(self):
        self.tenant_url = reverse("tenant-list")

        self.developer_company = Company.objects.create(
            name="Dev Co", account_type=Company.AccountType.DEVELOPER
        )
        self.manager_company = Company.objects.create(
            name="Manager Co", parent=self.developer_company
        )
        # A manager owned by a DIFFERENT developer — not a child of ours.
        self.other_developer = Company.objects.create(
            name="Other Dev", account_type=Company.AccountType.DEVELOPER
        )
        self.foreign_company = Company.objects.create(
            name="Foreign Co", parent=self.other_developer
        )

        self.manager_user = User.objects.create_user(
            username="mgr", password="password123", company=self.manager_company
        )
        self.developer_user = User.objects.create_user(
            username="dev", password="password123", company=self.developer_company
        )
        self.superuser = User.objects.create_superuser(username="root", password="password123")

    # (1) manager → 403 on tenant create -------------------------------------
    def test_manager_cannot_create_tenant(self):
        self.client.force_authenticate(user=self.manager_user)
        before = Company.objects.count()
        response = self.client.post(self.tenant_url, {"name": "Nope Co"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Company.objects.count(), before)

    # (2) developer → seeded manager child parented to itself -----------------
    def test_developer_creates_seeded_manager_child(self):
        self.client.force_authenticate(user=self.developer_user)
        response = self.client.post(self.tenant_url, {"name": "New Tenant"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        company = Company.objects.get(name="New Tenant")
        self.assertEqual(company.account_type, Company.AccountType.MANAGER)
        self.assertEqual(company.parent_id, self.developer_company.id)
        # Seeded exactly like onboarding: default locations + one API key.
        self.assertTrue(Location.objects.filter(company=company).exists())
        self.assertEqual(ApiKey.objects.filter(company=company).count(), 1)

    # (3) developer → cannot create a developer company -----------------------
    def test_developer_cannot_create_developer_company(self):
        self.client.force_authenticate(user=self.developer_user)
        before = Company.objects.count()
        response = self.client.post(
            self.tenant_url,
            {"name": "Sneaky Dev", "account_type": "developer"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Company.objects.count(), before)

    # (4) developer → cannot create a user in a foreign company ---------------
    def test_developer_cannot_invite_into_foreign_company(self):
        self.client.force_authenticate(user=self.developer_user)
        before = User.objects.count()
        response = self.client.post(
            reverse("user-invite"),
            {
                "username": "foreign_user",
                "email": "foreign@example.com",
                "password": "sup3rsecret",
                "company": str(self.foreign_company.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(User.objects.count(), before)

    # (5) superuser → may provision a developer company -----------------------
    def test_superuser_can_create_developer_company(self):
        self.client.force_authenticate(user=self.superuser)
        company = Company.objects.create(
            name="Provisioned Dev",
            account_type=Company.AccountType.DEVELOPER,
        )
        self.assertTrue(company.is_developer)
        self.assertEqual(company.account_type, Company.AccountType.DEVELOPER)
