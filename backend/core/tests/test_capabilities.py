"""Capability-map tests for the dual-tier (manager/developer) identity payload.

Two layers:

* unit tests over :func:`core.scope.company_capabilities` — the single source
  of truth feeding both the identity endpoint and the server-side write gates;
* HTTP tests over the ``me`` identity endpoint (APIClient + real JWT) asserting
  ``account_type`` and ``capabilities`` ship the expected booleans per tier.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Company
from core.scope import CAPABILITY_KEYS, company_capabilities

User = get_user_model()


class CompanyCapabilitiesUnitTests(TestCase):
    """Unit coverage for the tier -> capability mapping."""

    def test_manager_still_gets_view_widget_preview(self):
        company = Company.objects.create(name="Mgr Co")  # defaults to MANAGER
        user = User.objects.create_user(
            username='mgr', password='password123', company=company
        )

        caps = company_capabilities(user)

        self.assertEqual(set(caps), set(CAPABILITY_KEYS))
        self.assertTrue(caps['manage_own_inventory'])
        self.assertTrue(caps['view_widget_preview'])
        self.assertFalse(caps['manage_api_keys'])
        self.assertFalse(caps['view_widget_generator'])
        self.assertFalse(caps['create_users'])
        self.assertFalse(caps['manage_tenants'])

    def test_developer_does_not_get_view_widget_preview(self):
        company = Company.objects.create(
            name="Dev Co", account_type=Company.AccountType.DEVELOPER
        )
        user = User.objects.create_user(
            username='dev', password='password123', company=company
        )

        caps = company_capabilities(user)

        self.assertEqual(set(caps), set(CAPABILITY_KEYS))
        self.assertFalse(caps['view_widget_preview'])
        # Every other capability must remain True for the developer tier —
        # EXCEPT manage_users, which is OWNER-only (a developer user created
        # without a role resolves to ADMIN under GOVERNANCE-11).
        for key in CAPABILITY_KEYS:
            if key in ('view_widget_preview', 'manage_users'):
                continue
            self.assertTrue(caps[key], f"developer should have {key}=True")

    def test_superuser_still_gets_view_widget_preview(self):
        # Superuser without any company still gets every capability true,
        # including view_widget_preview (the developer-tier exception does
        # NOT apply to superusers).
        user = User.objects.create_superuser(
            username='root', password='password123'
        )

        caps = company_capabilities(user)

        self.assertEqual(set(caps), set(CAPABILITY_KEYS))
        self.assertTrue(caps['view_widget_preview'])
        self.assertTrue(all(caps.values()))

    def test_capability_matrix_snapshot_per_tier(self):
        """Locks the full capability dict per tier.

        Any drift on any key trips the equality check on the offending tier,
        so a future capability-map edit cannot silently regress either side.
        """
        # Users created without an explicit role resolve to ADMIN (the
        # conservative default in GOVERNANCE-11): full intra-company powers
        # EXCEPT in-app user management (manage_users), which is OWNER-only.
        expected = {
            "manager": {
                "manage_api_keys": False,
                "view_widget_generator": False,
                "view_widget_preview": True,
                "create_users": False,
                "manage_tenants": False,
                "manage_own_inventory": True,
                "delete_inventory": True,
                "manage_thresholds": True,
                "manage_settings": True,
                "manage_users": False,
            },
            "developer": {
                "manage_api_keys": True,
                "view_widget_generator": True,
                "view_widget_preview": False,
                "create_users": True,
                "manage_tenants": True,
                "manage_own_inventory": True,
                "delete_inventory": True,
                "manage_thresholds": True,
                "manage_settings": True,
                "manage_users": False,
            },
            "superuser": {
                "manage_api_keys": True,
                "view_widget_generator": True,
                "view_widget_preview": True,
                "create_users": True,
                "manage_tenants": True,
                "manage_own_inventory": True,
                "delete_inventory": True,
                "manage_thresholds": True,
                "manage_settings": True,
                "manage_users": True,
            },
        }

        manager_company = Company.objects.create(name="Snap Mgr Co")
        manager_user = User.objects.create_user(
            username='snap_mgr', password='password123', company=manager_company
        )
        developer_company = Company.objects.create(
            name="Snap Dev Co", account_type=Company.AccountType.DEVELOPER
        )
        developer_user = User.objects.create_user(
            username='snap_dev', password='password123', company=developer_company
        )
        superuser = User.objects.create_superuser(
            username='snap_root', password='password123'
        )

        users_by_tier = {
            "manager": manager_user,
            "developer": developer_user,
            "superuser": superuser,
        }

        for tier, user in users_by_tier.items():
            with self.subTest(tier=tier):
                self.assertEqual(company_capabilities(user), expected[tier])


class IdentityCapabilitiesEndpointTests(APITestCase):
    """The ``me`` identity endpoint ships account_type + capabilities.

    Uses a real JWT obtained from ``/api/token/`` (APIClient + Bearer) rather
    than ``force_authenticate`` so the full auth path is exercised.
    """

    def setUp(self):
        self.me_url = reverse('user-me')
        self.token_url = reverse('token_obtain_pair')

        self.manager_company = Company.objects.create(
            name="Manager Co", license_code="MGRLICENSE"
        )
        self.developer_company = Company.objects.create(
            name="Developer Co", license_code="DEVLICENSE",
            account_type=Company.AccountType.DEVELOPER,
        )
        self.manager_user = User.objects.create_user(
            username='mgr', password='password123', company=self.manager_company
        )
        self.developer_user = User.objects.create_user(
            username='dev', password='password123', company=self.developer_company
        )

    def _authenticate(self, username, license_code, password='password123'):
        response = self.client.post(
            self.token_url,
            {'username': username, 'password': password, 'license_code': license_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_me_for_manager_reports_manager_capabilities(self):
        self._authenticate('mgr', 'MGRLICENSE')
        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['account_type'], Company.AccountType.MANAGER)
        caps = response.data['capabilities']
        self.assertEqual(set(caps), set(CAPABILITY_KEYS))
        self.assertTrue(caps['manage_own_inventory'])
        self.assertTrue(caps['view_widget_preview'])
        self.assertFalse(caps['manage_api_keys'])
        self.assertFalse(caps['view_widget_generator'])
        self.assertFalse(caps['create_users'])
        self.assertFalse(caps['manage_tenants'])

    def test_me_for_developer_reports_developer_capabilities(self):
        self._authenticate('dev', 'DEVLICENSE')
        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['account_type'], Company.AccountType.DEVELOPER)
        caps = response.data['capabilities']
        self.assertEqual(set(caps), set(CAPABILITY_KEYS))
        # Developer gets everything EXCEPT the manager-safe widget preview
        # (redundant with the full Widget Generator the developer already has).
        self.assertFalse(caps['view_widget_preview'])
        for key in CAPABILITY_KEYS:
            if key in ('view_widget_preview', 'manage_users'):
                continue
            self.assertTrue(caps[key], f"developer should have {key}=True")
