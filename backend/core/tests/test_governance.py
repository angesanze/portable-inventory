"""GOVERNANCE-11 — role matrix (C2) + license enforcement (C1).

Table-driven role×endpoint coverage plus license expiry/quota/rotation tests.
All gates default conservatively: a user created with no role resolves to ADMIN
and keeps full intra-company powers; only OPERATOR/VIEWER are constrained.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Company
from core.permissions import (
    ROLE_ADMIN,
    ROLE_OPERATOR,
    ROLE_OWNER,
    ROLE_VIEWER,
    normalize_role,
    role_capabilities,
)
from inventory.models import Location, ProductModel

User = get_user_model()


# ── Pure role-matrix unit coverage ──────────────────────────────────────────
class RoleMatrixUnitTests(APITestCase):
    def test_normalize_role_defaults_to_admin(self):
        for legacy in [None, "", "Admin", "unknown-junk", "worker"]:
            with self.subTest(legacy=legacy):
                self.assertIn(normalize_role(legacy), {ROLE_ADMIN, ROLE_OPERATOR})
        # Explicit mappings.
        self.assertEqual(normalize_role(None), ROLE_ADMIN)
        self.assertEqual(normalize_role(""), ROLE_ADMIN)
        self.assertEqual(normalize_role("Admin"), ROLE_ADMIN)
        self.assertEqual(normalize_role("worker"), ROLE_OPERATOR)
        self.assertEqual(normalize_role("OWNER"), ROLE_OWNER)
        self.assertEqual(normalize_role("VIEWER"), ROLE_VIEWER)

    def test_role_capability_table(self):
        owner = role_capabilities(ROLE_OWNER)
        admin = role_capabilities(ROLE_ADMIN)
        operator = role_capabilities(ROLE_OPERATOR)
        viewer = role_capabilities(ROLE_VIEWER)

        self.assertTrue(all(owner.values()))
        self.assertTrue(admin["delete_inventory"])
        self.assertFalse(admin["manage_users"])
        self.assertTrue(operator["manage_own_inventory"])
        self.assertFalse(operator["delete_inventory"])
        self.assertFalse(operator["manage_thresholds"])
        self.assertFalse(operator["manage_settings"])
        self.assertFalse(any(viewer.values()))


# ── Role × endpoint HTTP matrix ─────────────────────────────────────────────
class RoleEndpointMatrixTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Co", license_code="ROLECO")
        self.loc = Location.objects.create(company=self.company, name="WH", type="WAREHOUSE")
        self.users = {}
        for role in (ROLE_OWNER, ROLE_ADMIN, ROLE_OPERATOR, ROLE_VIEWER):
            self.users[role] = User.objects.create_user(
                username=f"u_{role}", password="pw", company=self.company, role=role
            )

    def _product(self):
        return ProductModel.objects.create(
            company=self.company,
            sku=f"S-{timezone.now().timestamp()}",
            name="P",
            profile="SIMPLE_COUNT",
        )

    # bulk-delete on product-models: OWNER/ADMIN allowed, OPERATOR/VIEWER 403.
    def test_bulk_delete_products_role_matrix(self):
        url = reverse("productmodel-bulk-delete")
        expected = {
            ROLE_OWNER: status.HTTP_200_OK,
            ROLE_ADMIN: status.HTTP_200_OK,
            ROLE_OPERATOR: status.HTTP_403_FORBIDDEN,
            ROLE_VIEWER: status.HTTP_403_FORBIDDEN,
        }
        for role, code in expected.items():
            with self.subTest(role=role):
                product = self._product()
                self.client.force_authenticate(user=self.users[role])
                resp = self.client.post(url, {"ids": [str(product.id)]}, format="json")
                self.assertEqual(resp.status_code, code, role)

    # destroy on product-models: same delete gate.
    def test_destroy_product_role_matrix(self):
        expected = {
            ROLE_OWNER: (status.HTTP_204_NO_CONTENT, status.HTTP_200_OK),
            ROLE_ADMIN: (status.HTTP_204_NO_CONTENT, status.HTTP_200_OK),
            ROLE_OPERATOR: (status.HTTP_403_FORBIDDEN,),
            ROLE_VIEWER: (status.HTTP_403_FORBIDDEN,),
        }
        for role, allowed in expected.items():
            with self.subTest(role=role):
                product = self._product()
                url = reverse("productmodel-detail", args=[product.id])
                self.client.force_authenticate(user=self.users[role])
                resp = self.client.delete(url)
                self.assertIn(resp.status_code, allowed, role)

    # POST movement: VIEWER read-only -> 403; everyone else allowed past the gate.
    def test_movement_create_role_matrix(self):
        url = reverse("movement-list")
        product = self._product()
        loc2 = Location.objects.create(company=self.company, name="WH2", type="WAREHOUSE")
        for role in (ROLE_OWNER, ROLE_ADMIN, ROLE_OPERATOR):
            with self.subTest(role=role):
                self.client.force_authenticate(user=self.users[role])
                resp = self.client.post(
                    url,
                    {
                        "product_model": str(product.id),
                        "to_location": str(self.loc.id),
                        "quantity": "1",
                        "reason": "RECEIPT",
                    },
                    format="json",
                )
                # Not a 403 from the role gate (may be 201 or a 400 validation,
                # but never blocked for write-capable roles).
                self.assertNotEqual(resp.status_code, status.HTTP_403_FORBIDDEN, role)

        # VIEWER is blocked by the role gate.
        self.client.force_authenticate(user=self.users[ROLE_VIEWER])
        resp = self.client.post(
            url,
            {
                "product_model": str(product.id),
                "to_location": str(self.loc.id),
                "quantity": "1",
                "reason": "RECEIPT",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # bulk threshold edit: OWNER/ADMIN only.
    def test_threshold_bulk_role_matrix(self):
        url = reverse("restock-thresholds-bulk")
        expected = {
            ROLE_OWNER: status.HTTP_200_OK,
            ROLE_ADMIN: status.HTTP_200_OK,
            ROLE_OPERATOR: status.HTTP_403_FORBIDDEN,
            ROLE_VIEWER: status.HTTP_403_FORBIDDEN,
        }
        product = self._product()
        for role, code in expected.items():
            with self.subTest(role=role):
                self.client.force_authenticate(user=self.users[role])
                resp = self.client.post(
                    url, [{"id": str(product.id), "reorder_threshold": "5"}], format="json"
                )
                self.assertEqual(resp.status_code, code, role)

    # company settings PATCH: OWNER/ADMIN only; GET open to all.
    def test_settings_patch_role_matrix(self):
        url = reverse("company-settings")
        expected = {
            ROLE_OWNER: status.HTTP_200_OK,
            ROLE_ADMIN: status.HTTP_200_OK,
            ROLE_OPERATOR: status.HTTP_403_FORBIDDEN,
            ROLE_VIEWER: status.HTTP_403_FORBIDDEN,
        }
        for role, code in expected.items():
            with self.subTest(role=role):
                self.client.force_authenticate(user=self.users[role])
                resp = self.client.patch(url, {"timezone": "Europe/Rome"}, format="json")
                self.assertEqual(resp.status_code, code, role)
        # GET is open.
        self.client.force_authenticate(user=self.users[ROLE_VIEWER])
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)


# ── In-app user management ──────────────────────────────────────────────────
class CompanyUserManagementTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Co", license_code="USRCO")
        self.owner = User.objects.create_user(
            username="owner", password="pw", company=self.company, role=ROLE_OWNER
        )
        self.admin = User.objects.create_user(
            username="admin", password="pw", company=self.company, role=ROLE_ADMIN
        )
        self.operator = User.objects.create_user(
            username="op", password="pw", company=self.company, role=ROLE_OPERATOR
        )

    def test_owner_lists_company_users(self):
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get(reverse("company-user-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_admin_cannot_list_company_users(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(reverse("company-user-list"))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_operator_cannot_list_company_users(self):
        self.client.force_authenticate(user=self.operator)
        resp = self.client.get(reverse("company-user-list"))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_changes_role(self):
        self.client.force_authenticate(user=self.owner)
        url = reverse("company-user-set-role", args=[self.operator.id])
        resp = self.client.patch(url, {"role": ROLE_ADMIN}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.operator.refresh_from_db()
        self.assertEqual(self.operator.role, ROLE_ADMIN)

    def test_last_owner_cannot_self_demote(self):
        self.client.force_authenticate(user=self.owner)
        url = reverse("company-user-set-role", args=[self.owner.id])
        resp = self.client.patch(url, {"role": ROLE_ADMIN}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.role, ROLE_OWNER)

    def test_second_owner_allows_demote(self):
        User.objects.create_user(
            username="owner2", password="pw", company=self.company, role=ROLE_OWNER
        )
        self.client.force_authenticate(user=self.owner)
        url = reverse("company-user-set-role", args=[self.owner.id])
        resp = self.client.patch(url, {"role": ROLE_ADMIN}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_last_owner_cannot_be_deactivated(self):
        self.client.force_authenticate(user=self.owner)
        url = reverse("company-user-deactivate", args=[self.owner.id])
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_can_deactivate_operator(self):
        self.client.force_authenticate(user=self.owner)
        url = reverse("company-user-deactivate", args=[self.operator.id])
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.operator.refresh_from_db()
        self.assertFalse(self.operator.is_active)


# ── License expiry: read-only grace ─────────────────────────────────────────
class LicenseExpiryTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Exp Co", license_code="EXPCO")
        self.product = ProductModel.objects.create(
            company=self.company,
            sku="EXP-1",
            name="P",
            profile="SIMPLE_COUNT",
        )
        self.user = User.objects.create_user(
            username="u", password="pw", company=self.company, role=ROLE_OWNER
        )

    def _expire(self):
        self.company.license_expires_at = timezone.now() - timedelta(days=1)
        self.company.save(update_fields=["license_expires_at"])

    def test_expired_license_blocks_write(self):
        self._expire()
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("productmodel-list"),
            {
                "name": "New",
                "sku": "NEW-1",
                "profile": "SIMPLE_COUNT",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.json().get("code"), "license_expired")

    def test_expired_license_allows_read(self):
        self._expire()
        self.client.force_authenticate(user=self.user)
        resp = self.client.get(reverse("productmodel-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_valid_license_allows_write(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("productmodel-list"),
            {
                "name": "New",
                "sku": "NEW-2",
                "profile": "SIMPLE_COUNT",
            },
            format="json",
        )
        self.assertNotEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_bypasses_expiry(self):
        self._expire()
        su = User.objects.create_superuser(username="root", password="pw")
        su.company = self.company
        su.save(update_fields=["company"])
        self.client.force_authenticate(user=su)
        resp = self.client.post(
            reverse("productmodel-list"),
            {
                "name": "New",
                "sku": "NEW-3",
                "profile": "SIMPLE_COUNT",
            },
            format="json",
        )
        self.assertNotEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ── License quotas: checked only at create ──────────────────────────────────
class LicenseLimitTests(APITestCase):
    def test_max_users_blocks_sixth_invite(self):
        developer = Company.objects.create(name="Dev", account_type=Company.AccountType.DEVELOPER)
        child = Company.objects.create(name="Child", parent=developer, max_users=5)
        dev_user = User.objects.create_user(username="dev", password="pw", company=developer)
        # Seed the child up to its cap (5 users).
        for i in range(5):
            User.objects.create_user(username=f"c{i}", password="pw", company=child)
        self.client.force_authenticate(user=dev_user)
        resp = self.client.post(
            reverse("user-invite"),
            {
                "username": "sixth",
                "email": "s@x.com",
                "password": "sup3rsecret",
                "company": str(child.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        body = resp.json()
        self.assertEqual(body.get("code"), "limit_reached")
        self.assertEqual(body.get("details", {}).get("limit_type"), "max_users")

    def test_max_products_blocks_create(self):
        company = Company.objects.create(name="Cap Co", max_products=1)
        ProductModel.objects.create(company=company, sku="C-1", name="P", profile="SIMPLE_COUNT")
        user = User.objects.create_user(
            username="u", password="pw", company=company, role=ROLE_OWNER
        )
        self.client.force_authenticate(user=user)
        resp = self.client.post(
            reverse("productmodel-list"),
            {
                "name": "Second",
                "sku": "C-2",
                "profile": "SIMPLE_COUNT",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        body = resp.json()
        self.assertEqual(body.get("code"), "limit_reached")
        self.assertEqual(body.get("details", {}).get("limit_type"), "max_products")

    def test_max_managed_companies_blocks_onboarding(self):
        developer = Company.objects.create(
            name="Dev",
            account_type=Company.AccountType.DEVELOPER,
            max_managed_companies=1,
        )
        Company.objects.create(name="Existing Child", parent=developer)
        dev_user = User.objects.create_user(username="dev", password="pw", company=developer)
        self.client.force_authenticate(user=dev_user)
        resp = self.client.post(reverse("tenant-list"), {"name": "Second Child"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        body = resp.json()
        self.assertEqual(body.get("code"), "limit_reached")
        self.assertEqual(body.get("details", {}).get("limit_type"), "max_managed_companies")


# ── License rotation ────────────────────────────────────────────────────────
class LicenseRotationTests(APITestCase):
    def test_rotate_invalidates_old_code_at_login(self):
        company = Company.objects.create(name="Rot Co", license_code="OLDCODE")
        User.objects.create_user(username="u", password="password123", company=company)
        token_url = reverse("token_obtain_pair")

        # Old code authenticates.
        ok = self.client.post(
            token_url,
            {
                "username": "u",
                "password": "password123",
                "license_code": "OLDCODE",
            },
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

        new_code = company.rotate_license()
        self.assertNotEqual(new_code, "OLDCODE")
        self.assertIsNotNone(company.license_rotated_at)

        # Old code now rejected.
        bad = self.client.post(
            token_url,
            {
                "username": "u",
                "password": "password123",
                "license_code": "OLDCODE",
            },
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        # New code works.
        good = self.client.post(
            token_url,
            {
                "username": "u",
                "password": "password123",
                "license_code": new_code,
            },
            format="json",
        )
        self.assertEqual(good.status_code, status.HTTP_200_OK)
