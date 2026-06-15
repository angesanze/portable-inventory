"""
Tests for company isolation hardening:
- Cross-company FK validation on model save()
- CompanyScopeMiddleware attaching request.company
- StockViewSet company-scoped lookups
- ProductBatchViewSet API key validation
"""
import secrets

from django.core.exceptions import ValidationError
from django.test import TestCase, RequestFactory
from rest_framework.test import APIClient
from rest_framework import status
from inventory.models import (
    ProductModel, Location, Movement, ProductBatch,
    PhysicalProduct, WorkOrder, ProductComponent, DynamicQRCode,
)
from inventory.middleware.company_scope import CompanyScopeMiddleware
from inventory.tests.helpers import make_company as _make_company
from core.models import Company


class CompanyScopeMiddlewareTest(TestCase):
    """Test that middleware attaches request.company correctly."""

    def setUp(self):
        self.company_a, self.user_a, self.api_key_a = _make_company("A")
        self.factory = RequestFactory()

    def _get_response(self, request):
        """Dummy get_response for middleware."""
        return None

    def test_middleware_attaches_company_from_user(self):
        middleware = CompanyScopeMiddleware(self._get_response)
        request = self.factory.get("/")
        request.user = self.user_a
        middleware(request)
        self.assertEqual(request.company, self.company_a)
        self.assertTrue(request.is_company_scoped)

    def test_middleware_attaches_company_from_api_key_header(self):
        middleware = CompanyScopeMiddleware(self._get_response)
        request = self.factory.get("/", HTTP_X_API_KEY=self.api_key_a.key)
        request.user = type("Anon", (), {"is_authenticated": False})()
        middleware(request)
        self.assertEqual(request.company, self.company_a)

    def test_middleware_no_company_for_anonymous(self):
        middleware = CompanyScopeMiddleware(self._get_response)
        request = self.factory.get("/")
        request.user = type("Anon", (), {"is_authenticated": False})()
        middleware(request)
        self.assertIsNone(request.company)
        self.assertFalse(request.is_company_scoped)


class MovementCompanyIsolationTest(TestCase):
    """Movement save() must reject cross-company FKs."""

    def setUp(self):
        self.company_a, self.user_a, _ = _make_company("A")
        self.company_b, self.user_b, _ = _make_company("B")

        self.product_a = ProductModel.objects.create(
            company=self.company_a, sku="PROD-A", name="Product A"
        )
        self.loc_a = Location.objects.create(
            company=self.company_a, name="Warehouse A", type="WAREHOUSE"
        )
        self.loc_b = Location.objects.create(
            company=self.company_b, name="Warehouse B", type="WAREHOUSE"
        )

    def test_movement_rejects_cross_company_location(self):
        with self.assertRaises(ValidationError) as ctx:
            Movement.objects.create(
                product_model=self.product_a,
                from_location=self.loc_a,
                to_location=self.loc_b,
                quantity=1,
            )
        self.assertIn("to_location", str(ctx.exception))

    def test_movement_allows_same_company(self):
        loc_a2 = Location.objects.create(
            company=self.company_a, name="Store A", type="STORE"
        )
        movement = Movement.objects.create(
            product_model=self.product_a,
            from_location=self.loc_a,
            to_location=loc_a2,
            quantity=5,
        )
        self.assertIsNotNone(movement.pk)


class ProductComponentCompanyIsolationTest(TestCase):
    """ProductComponent parent/child must share company."""

    def setUp(self):
        self.company_a, _, _ = _make_company("A")
        self.company_b, _, _ = _make_company("B")

        self.parent = ProductModel.objects.create(
            company=self.company_a, sku="PARENT", name="Parent"
        )
        self.child_same = ProductModel.objects.create(
            company=self.company_a, sku="CHILD-A", name="Child Same"
        )
        self.child_other = ProductModel.objects.create(
            company=self.company_b, sku="CHILD-B", name="Child Other"
        )

    def test_rejects_cross_company_component(self):
        with self.assertRaises(ValidationError):
            ProductComponent.objects.create(
                parent=self.parent, child=self.child_other, quantity=1
            )

    def test_allows_same_company_component(self):
        comp = ProductComponent.objects.create(
            parent=self.parent, child=self.child_same, quantity=2
        )
        self.assertIsNotNone(comp.pk)


class WorkOrderCompanyIsolationTest(TestCase):
    """WorkOrder.product_model must share company with WorkOrder."""

    def setUp(self):
        self.company_a, _, _ = _make_company("A")
        self.company_b, _, _ = _make_company("B")
        self.product_b = ProductModel.objects.create(
            company=self.company_b, sku="PROD-B", name="Product B"
        )

    def test_rejects_cross_company_product_model(self):
        with self.assertRaises(ValidationError):
            WorkOrder.objects.create(
                company=self.company_a,
                name="WO Test",
                product_model=self.product_b,
            )


class DynamicQRCodeCompanyIsolationTest(TestCase):
    """DynamicQRCode FK targets must belong to same company."""

    def setUp(self):
        self.company_a, _, self.api_key_a = _make_company("A")
        self.company_b, _, _ = _make_company("B")

        self.product_a = ProductModel.objects.create(
            company=self.company_a, sku="QR-PROD", name="QR Product"
        )
        self.loc_b = Location.objects.create(
            company=self.company_b, name="Loc B", type="WAREHOUSE"
        )

    def test_rejects_cross_company_location(self):
        with self.assertRaises(ValidationError):
            DynamicQRCode.objects.create(
                company=self.company_a,
                product_model=self.product_a,
                location=self.loc_b,
            )


class ProductBatchCompanyIsolationTest(TestCase):
    """ProductBatch location must share company with product."""

    def setUp(self):
        self.company_a, _, _ = _make_company("A")
        self.company_b, _, _ = _make_company("B")

        self.product_a = ProductModel.objects.create(
            company=self.company_a, sku="BATCH-PROD", name="Batch Product"
        )
        self.loc_a = Location.objects.create(
            company=self.company_a, name="Loc A", type="WAREHOUSE"
        )
        self.loc_b = Location.objects.create(
            company=self.company_b, name="Loc B", type="WAREHOUSE"
        )

    def test_rejects_cross_company_location(self):
        with self.assertRaises(ValidationError):
            ProductBatch.objects.create(
                product_model=self.product_a,
                location=self.loc_b,
                batch_identifier="LOT-001",
                quantity=10,
            )

    def test_allows_same_company(self):
        batch = ProductBatch.objects.create(
            product_model=self.product_a,
            location=self.loc_a,
            batch_identifier="LOT-002",
            quantity=10,
        )
        self.assertIsNotNone(batch.pk)


class StockViewSetCompanyIsolationTest(TestCase):
    """StockViewSet must filter by company."""

    def setUp(self):
        self.company_a, self.user_a, _ = _make_company("A")
        self.company_b, self.user_b, _ = _make_company("B")

        self.product_b = ProductModel.objects.create(
            company=self.company_b, sku="SECRET", name="Secret Product"
        )
        self.client = APIClient()

    def test_user_cannot_access_other_company_product_stock(self):
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/v1/stock/{self.product_b.id}/level/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_can_access_own_company_product_stock(self):
        product_a = ProductModel.objects.create(
            company=self.company_a, sku="OWN", name="Own Product"
        )
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/v1/stock/{product_a.id}/level/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ApiKeyCompanyIsolationTest(TestCase):
    """API key from Company A cannot query Company B data via widget."""

    def setUp(self):
        self.company_a, self.user_a, self.api_key_a = _make_company("A")
        self.company_b, self.user_b, self.api_key_b = _make_company("B")

        # Create product only in Company B
        self.product_b = ProductModel.objects.create(
            company=self.company_b, sku="B-ONLY", name="Company B Product"
        )
        self.client = APIClient()

    def test_api_key_a_cannot_see_company_b_products(self):
        response = self.client.get(
            f'/api/v1/widget/?api_key={self.api_key_a.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product_names = [
            p.get('name', '') for p in response.data.get('products', [])
        ]
        self.assertNotIn("Company B Product", product_names)

    def test_api_key_b_can_see_own_products(self):
        response = self.client.get(
            f'/api/v1/widget/?api_key={self.api_key_b.key}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product_names = [
            p.get('name', '') for p in response.data.get('products', [])
        ]
        self.assertIn("Company B Product", product_names)


class DeveloperTenantIsolationTest(TestCase):
    """Adversarial cross-developer isolation suite (DUAL-TIER-03).

    Fixture graph::

        DevA (developer) ── TenantA1
                         └─ TenantA2
        DevB (developer) ── TenantB1
        MgrSolo (manager, standalone)

    The ``parent`` FK is the only bridge between a developer and the tenant
    data it can reach via ``X-Acting-Company``. These tests prove developer A
    can never read or write developer B's tenants, and that a manager can
    never act-as anyone. Positive-access, denial, and backward-compat tests
    are added on top of this fixture in later tasks.
    """

    def _make_developer(self, suffix):
        company, user, api_key = _make_company(suffix)
        company.account_type = Company.AccountType.DEVELOPER
        company.save(update_fields=['account_type'])
        return company, user, api_key

    def _make_tenant(self, suffix, parent):
        company, user, api_key = _make_company(suffix)
        company.account_type = Company.AccountType.MANAGER
        company.parent = parent
        company.save(update_fields=['account_type', 'parent'])
        return company, user, api_key

    def setUp(self):
        # Developer A and its two child tenants.
        self.dev_a, self.user_dev_a, _ = self._make_developer("DevA")
        self.tenant_a1, self.user_a1, _ = self._make_tenant("TenantA1", self.dev_a)
        self.tenant_a2, self.user_a2, _ = self._make_tenant("TenantA2", self.dev_a)

        # Developer B and its single child tenant.
        self.dev_b, self.user_dev_b, _ = self._make_developer("DevB")
        self.tenant_b1, self.user_b1, _ = self._make_tenant("TenantB1", self.dev_b)

        # Standalone manager owned by no developer.
        self.mgr_solo, self.user_mgr_solo, _ = _make_company("MgrSolo")

        # Seed one company-scoped record (a Location) in every company so
        # cross-reads are observable in API payloads.
        self.locations = {}
        for company in (
            self.dev_a, self.tenant_a1, self.tenant_a2,
            self.dev_b, self.tenant_b1, self.mgr_solo,
        ):
            self.locations[company.id] = Location.objects.create(
                company=company,
                name=f"Warehouse {company.name}",
                type="WAREHOUSE",
            )

    # ── JWT-authenticated client helpers ──────────────────────────────
    LOCATIONS_URL = "/api/v1/locations/"

    def _client_for(self, user):
        """Return an APIClient authenticated as ``user`` via a real JWT."""
        from rest_framework_simplejwt.tokens import RefreshToken
        client = APIClient()
        token = RefreshToken.for_user(user).access_token
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return client

    def _list_location_ids(self, response):
        """Extract the set of Location ids from a (paginated) list payload."""
        rows = response.data["results"] if "results" in response.data else response.data
        return {str(row["id"]) for row in rows}

    def test_fixture_graph_wired_correctly(self):
        """Sanity-check the fixture: account types, parent FKs, and seeds."""
        # Developers are flagged as developers.
        self.assertTrue(self.dev_a.is_developer)
        self.assertTrue(self.dev_b.is_developer)
        # Tenants and the standalone manager are managers.
        for company in (self.tenant_a1, self.tenant_a2, self.tenant_b1, self.mgr_solo):
            self.assertTrue(company.is_manager)
        # Parent FKs bridge only to the owning developer.
        self.assertEqual(self.tenant_a1.parent_id, self.dev_a.id)
        self.assertEqual(self.tenant_a2.parent_id, self.dev_a.id)
        self.assertEqual(self.tenant_b1.parent_id, self.dev_b.id)
        self.assertIsNone(self.mgr_solo.parent_id)
        # DevA owns exactly TenantA1 + TenantA2; DevB owns exactly TenantB1.
        self.assertCountEqual(
            list(self.dev_a.children.values_list('id', flat=True)),
            [self.tenant_a1.id, self.tenant_a2.id],
        )
        self.assertCountEqual(
            list(self.dev_b.children.values_list('id', flat=True)),
            [self.tenant_b1.id],
        )
        # Each company has its own seeded, company-scoped Location.
        self.assertEqual(len(self.locations), 6)
        for company_id, location in self.locations.items():
            self.assertEqual(location.company_id, company_id)

    # ── Positive access (DUAL-TIER-03) ────────────────────────────────

    def test_developer_acting_as_child_sees_only_that_child(self):
        """DevA acting as TenantA1 lists/reads ONLY TenantA1's records."""
        client = self._client_for(self.user_dev_a)

        # List: only TenantA1's location, nothing from DevA/TenantA2/others.
        response = client.get(
            self.LOCATIONS_URL, HTTP_X_ACTING_COMPANY=str(self.tenant_a1.id)
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self._list_location_ids(response),
            {str(self.locations[self.tenant_a1.id].id)},
        )

        # Detail read of TenantA1's own location succeeds.
        loc_a1 = self.locations[self.tenant_a1.id]
        detail = client.get(
            f"{self.LOCATIONS_URL}{loc_a1.id}/",
            HTTP_X_ACTING_COMPANY=str(self.tenant_a1.id),
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(str(detail.data["id"]), str(loc_a1.id))

    def test_developer_can_switch_between_its_own_tenants(self):
        """The same DevA user switches header to TenantA2 and sees only A2."""
        client = self._client_for(self.user_dev_a)

        response = client.get(
            self.LOCATIONS_URL, HTTP_X_ACTING_COMPANY=str(self.tenant_a2.id)
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned = self._list_location_ids(response)
        self.assertEqual(returned, {str(self.locations[self.tenant_a2.id].id)})
        # TenantA1's record must NOT leak when acting as TenantA2.
        self.assertNotIn(str(self.locations[self.tenant_a1.id].id), returned)

    def test_developer_without_header_sees_only_own_company(self):
        """DevA with NO acting header is scoped to DevA's own records."""
        client = self._client_for(self.user_dev_a)

        response = client.get(self.LOCATIONS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned = self._list_location_ids(response)
        self.assertEqual(returned, {str(self.locations[self.dev_a.id].id)})
        # No child-tenant data without an explicit act-as switch.
        self.assertNotIn(str(self.locations[self.tenant_a1.id].id), returned)
        self.assertNotIn(str(self.locations[self.tenant_a2.id].id), returned)

    # ── Denial — the security core (DUAL-TIER-03) ─────────────────────
    #
    # A failed act-as resolves to ``PermissionDenied`` in
    # ``core.scope.resolve_effective_company`` (deferred by the middleware,
    # surfaced by ``CompanyScopedMixin.get_queryset`` / ``perform_create``),
    # so the API returns HTTP 403 and the response carries NO tenant rows.
    # A 403 with an empty body is strictly stronger than "silently ignored":
    # the requester never receives a single row of the targeted tenant.

    def test_developer_acting_as_foreign_developers_tenant_denied(self):
        """DevA acting as TenantB1 (a tenant of DevB) is denied — no DevB data.

        This is the headline cross-developer leak case: the ``parent`` FK does
        not bridge DevA to DevB's child, so resolution must 403 and leak zero
        rows of TenantB1.
        """
        client = self._client_for(self.user_dev_a)
        response = client.get(
            self.LOCATIONS_URL, HTTP_X_ACTING_COMPANY=str(self.tenant_b1.id)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # A list payload, if any, must never contain TenantB1's row.
        rows = response.data
        if isinstance(rows, dict) and "results" in rows:
            self.assertNotIn(
                str(self.locations[self.tenant_b1.id].id),
                self._list_location_ids(response),
            )

    def test_developer_acting_as_unrelated_manager_denied(self):
        """DevA acting as MgrSolo (an unrelated standalone manager) is denied."""
        client = self._client_for(self.user_dev_a)
        response = client.get(
            self.LOCATIONS_URL, HTTP_X_ACTING_COMPANY=str(self.mgr_solo.id)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        rows = response.data
        if isinstance(rows, dict) and "results" in rows:
            self.assertNotIn(
                str(self.locations[self.mgr_solo.id].id),
                self._list_location_ids(response),
            )

    def test_manager_acting_header_grants_nothing(self):
        """A manager can never act-as — the header is rejected, own scope stands.

        Per the DUAL-TIER-02 contract a non-developer carrying the header is
        denied (403), so it can never reach another tenant's data. With NO
        header the same manager still sees ONLY its own company — the header
        grants nothing either way.
        """
        # Standalone manager pointing at a developer's child tenant -> 403.
        solo_client = self._client_for(self.user_mgr_solo)
        denied = solo_client.get(
            self.LOCATIONS_URL, HTTP_X_ACTING_COMPANY=str(self.tenant_a1.id)
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        # A tenant (itself a manager) pointing at a sibling tenant -> 403.
        tenant_client = self._client_for(self.user_a1)
        denied_sibling = tenant_client.get(
            self.LOCATIONS_URL, HTTP_X_ACTING_COMPANY=str(self.tenant_a2.id)
        )
        self.assertEqual(denied_sibling.status_code, status.HTTP_403_FORBIDDEN)

        # Without a header the manager is confined to its own company only.
        own = solo_client.get(self.LOCATIONS_URL)
        self.assertEqual(own.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self._list_location_ids(own),
            {str(self.locations[self.mgr_solo.id].id)},
        )

    def test_developer_cannot_write_into_non_child_tenant(self):
        """DevA cannot POST/create a record into a tenant it does not own.

        A write acting-as TenantB1 must 403 in ``perform_create`` before any
        save, leaving TenantB1's row count untouched.
        """
        client = self._client_for(self.user_dev_a)
        before = Location.objects.filter(company=self.tenant_b1).count()
        response = client.post(
            self.LOCATIONS_URL,
            {"name": "Smuggled Location", "type": "WAREHOUSE"},
            format="json",
            HTTP_X_ACTING_COMPANY=str(self.tenant_b1.id),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # No row leaked into TenantB1 (nor created anywhere).
        self.assertEqual(
            Location.objects.filter(company=self.tenant_b1).count(), before
        )
        self.assertFalse(
            Location.objects.filter(name="Smuggled Location").exists()
        )

    # ── Backward compatibility (DUAL-TIER-03) ─────────────────────────

    def test_manager_no_header_behaves_exactly_as_before(self):
        """A manager's normal (header-less) request is unchanged by the refactor.

        The scope refactor only adds an act-as path for developers. A plain
        manager request must still resolve to its OWN company and return the
        exact same rows a raw company-scoped DB query yields — same set, same
        200 status — proving backward compatibility.
        """
        # Seed a couple extra rows so "same rows" is a meaningful set, not a
        # single-element coincidence.
        extra_solo = Location.objects.create(
            company=self.mgr_solo, name="Solo Extra", type="STORE"
        )
        Location.objects.create(
            company=self.tenant_b1, name="Foreign Noise", type="STORE"
        )

        # Ground truth: exactly what a raw company-scoped query returns.
        expected_ids = {
            str(pk)
            for pk in Location.objects.filter(
                company=self.mgr_solo
            ).values_list("id", flat=True)
        }
        self.assertIn(str(self.locations[self.mgr_solo.id].id), expected_ids)
        self.assertIn(str(extra_solo.id), expected_ids)

        client = self._client_for(self.user_mgr_solo)
        response = client.get(self.LOCATIONS_URL)

        # Same status, same rows — and nothing from any other company.
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._list_location_ids(response), expected_ids)
