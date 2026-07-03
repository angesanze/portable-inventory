"""Tests for POST /api/v1/movements with transaction_type=status_change.

Covers the tracker-engine status mutation branch added in TRACKER-STATUS-03:
a valid transition updates PhysicalProduct.status and emits a quantity=0
audit Movement row; an invalid transition returns 400, not 500.
"""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from inventory.models import Location, Movement, PhysicalProduct, ProductModel
from inventory.tests.helpers import make_company


class MovementStatusChangeTest(TestCase):
    def setUp(self):
        self.company, self.user, _ = make_company("SC")
        self.product = ProductModel.objects.create(
            company=self.company,
            sku="SC-001",
            name="Serialized Asset",
            profile="SERIALIZED",
            engine_config={
                "status_transitions": {
                    "ACTIVE": ["IN_USE", "DISPOSED"],
                    "IN_USE": ["RETURNED", "DISPOSED"],
                    "RETURNED": ["ACTIVE", "DISPOSED"],
                    "DISPOSED": [],
                }
            },
        )
        self.warehouse = Location.objects.create(
            company=self.company,
            name="Warehouse",
            type="WAREHOUSE",
        )
        self.pp = PhysicalProduct.objects.create(
            product_model=self.product,
            identifier="SN-0001",
            status="ACTIVE",
            location=self.warehouse,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/movements/"

    def test_valid_status_change_returns_201_and_persists(self):
        resp = self.client.post(
            self.url,
            {
                "product_id": str(self.product.id),
                "physical_identifier": "SN-0001",
                "transaction_type": "status_change",
                "new_status": "IN_USE",
                "notes": "Assigned to dev team",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

        self.pp.refresh_from_db()
        self.assertEqual(self.pp.status, "IN_USE")

        audit = Movement.objects.filter(physical_product=self.pp).order_by("-occurred_at").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.quantity, Decimal("0"))
        self.assertEqual(audit.from_location_id, self.warehouse.id)
        self.assertEqual(audit.to_location_id, self.warehouse.id)
        self.assertIn("ACTIVE", audit.reason)
        self.assertIn("IN_USE", audit.reason)

    def test_invalid_transition_returns_400(self):
        # ACTIVE → RETURNED is not in the configured transitions
        resp = self.client.post(
            self.url,
            {
                "product_id": str(self.product.id),
                "physical_identifier": "SN-0001",
                "transaction_type": "status_change",
                "new_status": "RETURNED",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.pp.refresh_from_db()
        self.assertEqual(self.pp.status, "ACTIVE")
