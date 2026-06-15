"""
Tests for superuser cross-tenant data access.

Documents that superusers using CompanyScopedViewSet-based endpoints can
access data across ALL companies (no company filter applied). This is
current intentional behavior — flag for RBAC review if scoping is desired.

Also documents that some viewsets (MovementViewSet, StockViewSet) use custom
get_queryset that does NOT include a superuser bypass, so superusers without
a company see empty results on those endpoints.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from core.models import User
from inventory.models import (
    ProductModel, Location, Movement, ProductBatch,
    PhysicalProduct, WorkOrder, EventLog,
)
from inventory.tests.helpers import make_company as _make_company


class SuperuserCrossTenantBaseSetUp(TestCase):
    """Shared setup: two companies with data, one superuser without company."""

    def setUp(self):
        self.company_a, self.user_a, _ = _make_company("A")
        self.company_b, self.user_b, _ = _make_company("B")

        # Superuser with no company — exercises the bypass path
        self.superuser = User.objects.create_superuser(
            username="admin_super",
            password="testpass123",
            email="admin@test.com",
        )
        # Ensure superuser has no company (the bypass condition)
        self.superuser.company = None
        self.superuser.save()

        # -- Company A data --
        self.product_a = ProductModel.objects.create(
            company=self.company_a, sku="PROD-A", name="Product A",
        )
        self.loc_a = Location.objects.create(
            company=self.company_a, name="Warehouse A", type="WAREHOUSE",
        )

        # -- Company B data --
        self.product_b = ProductModel.objects.create(
            company=self.company_b, sku="PROD-B", name="Product B",
        )
        self.loc_b = Location.objects.create(
            company=self.company_b, name="Warehouse B", type="WAREHOUSE",
        )

        self.client = APIClient()


class SuperuserLocationAccessTest(SuperuserCrossTenantBaseSetUp):
    """Superuser can list locations from ALL companies via LocationViewSet."""

    def test_superuser_sees_all_company_locations(self):
        """CompanyScopedViewSet bypass: superuser gets unfiltered queryset."""
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get("/api/v1/locations/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        location_names = [loc["name"] for loc in response.data["results"]]
        self.assertIn("Warehouse A", location_names)
        self.assertIn("Warehouse B", location_names)

    def test_regular_user_sees_only_own_locations(self):
        """Contrast: regular user only sees their company's locations."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get("/api/v1/locations/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        location_names = [loc["name"] for loc in response.data["results"]]
        self.assertIn("Warehouse A", location_names)
        self.assertNotIn("Warehouse B", location_names)


class SuperuserWorkOrderAccessTest(SuperuserCrossTenantBaseSetUp):
    """Superuser can list work orders from ALL companies."""

    def setUp(self):
        super().setUp()
        self.wo_a = WorkOrder.objects.create(
            company=self.company_a, name="WO-A", product_model=self.product_a,
        )
        self.wo_b = WorkOrder.objects.create(
            company=self.company_b, name="WO-B", product_model=self.product_b,
        )

    def test_superuser_sees_all_company_work_orders(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get("/api/v1/work-orders/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        wo_names = [wo["name"] for wo in response.data["results"]]
        self.assertIn("WO-A", wo_names)
        self.assertIn("WO-B", wo_names)

    def test_regular_user_sees_only_own_work_orders(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get("/api/v1/work-orders/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        wo_names = [wo["name"] for wo in response.data["results"]]
        self.assertIn("WO-A", wo_names)
        self.assertNotIn("WO-B", wo_names)


class SuperuserEventLogAccessTest(SuperuserCrossTenantBaseSetUp):
    """Superuser can list event logs from ALL companies via ReadOnlyCompanyScopedViewSet."""

    def setUp(self):
        super().setUp()
        self.event_a = EventLog.objects.create(
            product=self.product_a, message="Alert for A",
        )
        self.event_b = EventLog.objects.create(
            product=self.product_b, message="Alert for B",
        )

    def test_superuser_sees_all_company_event_logs(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get("/api/v1/event-logs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        messages = [e["message"] for e in response.data["results"]]
        self.assertIn("Alert for A", messages)
        self.assertIn("Alert for B", messages)

    def test_regular_user_sees_only_own_event_logs(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get("/api/v1/event-logs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        messages = [e["message"] for e in response.data["results"]]
        self.assertIn("Alert for A", messages)
        self.assertNotIn("Alert for B", messages)


class SuperuserPhysicalProductAccessTest(SuperuserCrossTenantBaseSetUp):
    """Superuser can list physical products from ALL companies."""

    def setUp(self):
        super().setUp()
        # PhysicalProducts require INDIVIDUAL tracking + tracker engine
        self.product_a.profile = "SERIALIZED"
        self.product_a.save()
        self.product_b.profile = "SERIALIZED"
        self.product_b.save()

        self.pp_a = PhysicalProduct.objects.create(
            product_model=self.product_a,
            identifier="PP-A-001",
            location=self.loc_a,
        )
        self.pp_b = PhysicalProduct.objects.create(
            product_model=self.product_b,
            identifier="PP-B-001",
            location=self.loc_b,
        )

    def test_superuser_sees_all_company_physical_products(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get("/api/v1/physical-products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        identifiers = [pp["identifier"] for pp in response.data["results"]]
        self.assertIn("PP-A-001", identifiers)
        self.assertIn("PP-B-001", identifiers)

    def test_regular_user_sees_only_own_physical_products(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get("/api/v1/physical-products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        identifiers = [pp["identifier"] for pp in response.data["results"]]
        self.assertIn("PP-A-001", identifiers)
        self.assertNotIn("PP-B-001", identifiers)


class SuperuserMovementAccessTest(SuperuserCrossTenantBaseSetUp):
    """
    MovementViewSet now uses CompanyScopedMixin, so its scoping matrix
    matches every other endpoint: a company-less superuser sees ALL
    movements (platform-admin view), a superuser with a company sees that
    company's movements. The historical inconsistency (custom get_queryset
    without bypass) was removed in the 2026-06 audit fixes.
    """

    def setUp(self):
        super().setUp()
        loc_a2 = Location.objects.create(
            company=self.company_a, name="Store A", type="STORE",
        )
        self.movement_a = Movement.objects.create(
            product_model=self.product_a,
            from_location=self.loc_a,
            to_location=loc_a2,
            quantity=5,
        )

    def test_superuser_without_company_sees_all_movements(self):
        """Company-less superuser gets the platform-wide view, like other viewsets."""
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get("/api/v1/movements/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_superuser_with_company_sees_own_movements(self):
        """If superuser has a company, they see that company's movements only."""
        self.superuser.company = self.company_a
        self.superuser.save()
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get("/api/v1/movements/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)


class SuperuserDetailAccessTest(SuperuserCrossTenantBaseSetUp):
    """Superuser can retrieve individual objects from other companies by ID."""

    def test_superuser_can_retrieve_other_company_location(self):
        """Detail view on CompanyScopedViewSet also bypasses for superuser."""
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(f"/api/v1/locations/{self.loc_b.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Warehouse B")

    def test_regular_user_cannot_retrieve_other_company_location(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(f"/api/v1/locations/{self.loc_b.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
