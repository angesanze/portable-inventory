from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Company, User
from inventory.models import ProductModel, EventLog, Location, MonitoringRule


class EventLogReadOnlyTest(TestCase):
    """Verify EventLogViewSet only allows read operations."""

    def setUp(self):
        self.company = Company.objects.create(name="EventLog Co", license_code="EVTLG1")
        self.user = User.objects.create_user(
            username="tester", password="pass", company=self.company
        )
        self.warehouse = Location.objects.create(
            company=self.company, name="Warehouse", type="WAREHOUSE"
        )
        self.product = ProductModel.objects.create(
            company=self.company,
            sku="TEST-01",
            name="Test Product",
            profile="SIMPLE_COUNT",
        )
        self.rule = MonitoringRule.objects.create(
            product_model=self.product,
            name="Test Rule",
            trigger_type="THRESHOLD",
            condition_config={"min": 10},
            severity="WARNING",
        )
        self.event = EventLog.objects.create(
            product=self.product,
            rule=self.rule,
            message="Test event",
            status="OPEN",
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_allowed(self):
        resp = self.client.get("/api/v1/event-logs/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_retrieve_allowed(self):
        resp = self.client.get(f"/api/v1/event-logs/{self.event.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_create_blocked(self):
        resp = self.client.post(
            "/api/v1/event-logs/",
            {"product": self.product.pk, "message": "hack"},
        )
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_update_blocked(self):
        resp = self.client.put(
            f"/api/v1/event-logs/{self.event.pk}/",
            {"message": "tampered"},
        )
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_partial_update_blocked(self):
        resp = self.client.patch(
            f"/api/v1/event-logs/{self.event.pk}/",
            {"status": "RESOLVED"},
        )
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_delete_blocked(self):
        resp = self.client.delete(f"/api/v1/event-logs/{self.event.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_cross_company_isolation(self):
        """Events from another company should not be visible."""
        other_company = Company.objects.create(name="Other Co", license_code="OTHEV1")
        other_product = ProductModel.objects.create(
            company=other_company,
            sku="OTHER-01",
            name="Other Product",
            profile="SIMPLE_COUNT",
        )
        EventLog.objects.create(
            product=other_product,
            message="Secret event",
            status="OPEN",
        )

        resp = self.client.get("/api/v1/event-logs/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = (
            [e["id"] for e in resp.data["results"]]
            if "results" in resp.data
            else [e["id"] for e in resp.data]
        )
        self.assertNotIn(str(other_product.pk), [str(i) for i in ids])
