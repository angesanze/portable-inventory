"""Bulk threshold endpoint: auth, scoping, and field updates."""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from inventory.models import ProductModel
from inventory.tests.helpers import make_company_full


BULK_URL = "/api/v1/restock/thresholds/bulk/"


class BulkThresholdEndpointTests(TestCase):
    def setUp(self):
        self.company_a, self.user_a, _ = make_company_full("BTA")
        self.company_b, self.user_b, _ = make_company_full("BTB")

        self.mine = ProductModel.objects.create(
            company=self.company_a,
            sku="MINE-1",
            name="Mine",
            profile="SIMPLE_COUNT",
        )
        self.other = ProductModel.objects.create(
            company=self.company_b,
            sku="OTHER-1",
            name="Other",
            profile="SIMPLE_COUNT",
        )

    def test_requires_authentication(self):
        client = APIClient()
        resp = client.post(BULK_URL, [], format="json")
        self.assertIn(resp.status_code, (401, 403))

    def test_updates_thresholds_for_caller_company(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        payload = [{
            "id": str(self.mine.id),
            "reorder_threshold": 12,
            "critical_threshold": 4,
            "max_threshold": 100,
            "reorder_qty": 25,
        }]
        resp = client.post(BULK_URL, payload, format="json")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"updated": [str(self.mine.id)]})

        self.mine.refresh_from_db()
        self.assertEqual(self.mine.reorder_threshold, Decimal("12"))
        self.assertEqual(self.mine.critical_threshold, Decimal("4"))
        self.assertEqual(self.mine.max_threshold, Decimal("100"))
        self.assertEqual(self.mine.reorder_qty, Decimal("25"))

    def test_cross_company_products_filtered_out(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        payload = [
            {"id": str(self.mine.id), "reorder_threshold": 5},
            {"id": str(self.other.id), "reorder_threshold": 999},
        ]
        resp = client.post(BULK_URL, payload, format="json")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"updated": [str(self.mine.id)]})

        self.other.refresh_from_db()
        self.assertIsNone(self.other.reorder_threshold)

    def test_partial_payload_only_updates_listed_fields(self):
        self.mine.critical_threshold = Decimal("2")
        self.mine.max_threshold = Decimal("80")
        self.mine.save()

        client = APIClient()
        client.force_authenticate(user=self.user_a)
        payload = [{"id": str(self.mine.id), "reorder_threshold": 15}]
        resp = client.post(BULK_URL, payload, format="json")

        self.assertEqual(resp.status_code, 200)
        self.mine.refresh_from_db()
        self.assertEqual(self.mine.reorder_threshold, Decimal("15"))
        self.assertEqual(self.mine.critical_threshold, Decimal("2"))
        self.assertEqual(self.mine.max_threshold, Decimal("80"))

    def test_null_clears_threshold(self):
        self.mine.reorder_threshold = Decimal("10")
        self.mine.save()

        client = APIClient()
        client.force_authenticate(user=self.user_a)
        payload = [{"id": str(self.mine.id), "reorder_threshold": None}]
        resp = client.post(BULK_URL, payload, format="json")

        self.assertEqual(resp.status_code, 200)
        self.mine.refresh_from_db()
        self.assertIsNone(self.mine.reorder_threshold)

    def test_invalid_body_rejected(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        resp = client.post(BULK_URL, {"not": "a list"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_unknown_id_skipped(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        payload = [{"id": "00000000-0000-0000-0000-000000000000", "reorder_threshold": 9}]
        resp = client.post(BULK_URL, payload, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"updated": []})
