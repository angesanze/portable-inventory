"""Tests for MovementViewSet create flow via serializer validation.

Validates that entity resolution (product, locations, physical product,
work order) happens inside MovementSerializer.validate() and that
creation delegates to LedgerService.transfer_stock().
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from core.models import User
from inventory.models import (
    ProductModel, Location, Movement, PhysicalProduct, ProductBatch, WorkOrder,
)
from inventory.tests.helpers import make_company


class MovementViewSetCreateTest(TestCase):
    """Test POST /api/movements/ with the refactored serializer validation."""

    def setUp(self):
        self.company, self.user, _ = make_company("MV")
        self.user.set_password("testpass")
        self.user.save()

        self.product = ProductModel.objects.create(
            company=self.company, sku="MV-001", name="Movement Test Product",
        )
        self.warehouse = Location.objects.create(
            company=self.company, name="Warehouse", type="WAREHOUSE",
        )
        self.store = Location.objects.create(
            company=self.company, name="Store", type="STORE",
        )
        # Seed stock: External Vendor → Warehouse
        self.vendor, _ = Location.objects.get_or_create(
            company=self.company, name="External Vendor",
            defaults={"type": "VIRTUAL"},
        )
        Movement.objects.create(
            product_model=self.product,
            from_location=self.vendor,
            to_location=self.warehouse,
            quantity=Decimal("100"),
            performed_by=self.user,
            reason="Seed stock",
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/movements/"

    # --- Happy path: SKU + location names ---

    def test_create_movement_by_sku_and_names(self):
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from": "Warehouse",
            "to": "Store",
            "qty": "5",
            "reason": "Restock store",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Movement.objects.count(), 2)
        m = Movement.objects.order_by("-occurred_at").first()
        self.assertEqual(m.quantity, Decimal("5"))
        self.assertEqual(m.reason, "Restock store")

    # --- Happy path: IDs ---

    def test_create_movement_by_ids(self):
        resp = self.client.post(self.url, {
            "product_id": str(self.product.id),
            "from_id": str(self.warehouse.id),
            "to_id": str(self.store.id),
            "qty": "3",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    # --- Happy path: from_location_name / to_location_name aliases ---

    def test_create_movement_explicit_name_fields(self):
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from_location_name": "Warehouse",
            "to_location_name": "Store",
            "qty": "2",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    # --- External Vendor auto-create ---

    def test_external_vendor_auto_created(self):
        # Use a fresh company with no existing External Vendor
        company2, user2, _ = make_company("MV2")
        user2.set_password("testpass")
        user2.save()
        product2 = ProductModel.objects.create(
            company=company2, sku="MV-002", name="Test Product 2",
        )
        wh2 = Location.objects.create(company=company2, name="Warehouse", type="WAREHOUSE")
        self.assertFalse(
            Location.objects.filter(company=company2, name="External Vendor").exists()
        )

        self.client.force_authenticate(user=user2)
        resp = self.client.post(self.url, {
            "sku": "MV-002",
            "from": "External Vendor",
            "to": "Warehouse",
            "qty": "10",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Location.objects.filter(company=company2, name="External Vendor").exists()
        )

    # --- Validation errors ---

    def test_missing_product_identifier(self):
        resp = self.client.post(self.url, {
            "from": "Warehouse",
            "to": "Store",
            "qty": "1",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_sku(self):
        resp = self.client.post(self.url, {
            "sku": "DOES-NOT-EXIST",
            "from": "Warehouse",
            "to": "Store",
            "qty": "1",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sku", str(resp.data))

    def test_invalid_from_location(self):
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from": "Narnia",
            "to": "Store",
            "qty": "1",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("from_location_name", str(resp.data))

    def test_invalid_to_location(self):
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from": "Warehouse",
            "to": "Narnia",
            "qty": "1",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("to_location_name", str(resp.data))

    def test_missing_locations(self):
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "qty": "1",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_negative_quantity_rejected(self):
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from": "Warehouse",
            "to": "Store",
            "qty": "-5",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --- Work order resolution ---

    def test_work_order_resolved(self):
        wo = WorkOrder.objects.create(
            company=self.company, name="WO-1", status="OPEN",
        )
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from": "Warehouse",
            "to": "Store",
            "qty": "1",
            "work_order_id": str(wo.id),
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        m = Movement.objects.order_by("-occurred_at").first()
        self.assertEqual(m.work_order_id, wo.id)

    def test_invalid_work_order_rejected(self):
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from": "Warehouse",
            "to": "Store",
            "qty": "1",
            "work_order_id": "00000000-0000-0000-0000-000000000000",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("work_order_id", str(resp.data))

    # --- Default reason ---

    def test_default_reason(self):
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from": "Warehouse",
            "to": "Store",
            "qty": "1",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        m = Movement.objects.order_by("-occurred_at").first()
        self.assertEqual(m.reason, "API Movement")

    # --- Unauthenticated ---

    def test_unauthenticated_rejected(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(self.url, {
            "sku": "MV-001",
            "from": "Warehouse",
            "to": "Store",
            "qty": "1",
        })
        self.assertIn(resp.status_code, [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ])


class MovementViewSetFilterTest(TestCase):
    """Confirms list endpoint supports filtering by physical_product, batch,
    from_location, to_location, product_model, work_order.
    """

    def setUp(self):
        self.company, self.user, _ = make_company("MVF")
        self.user.set_password("testpass")
        self.user.save()

        self.product = ProductModel.objects.create(
            company=self.company, sku="MVF-001", name="Filter Test Product",
            profile="SERIALIZED",
        )
        self.batch_product = ProductModel.objects.create(
            company=self.company, sku="MVF-BATCH", name="Batch Product",
            profile="BATCH_TRACKED",
        )
        self.other_product = ProductModel.objects.create(
            company=self.company, sku="MVF-002", name="Other Product",
        )
        self.warehouse = Location.objects.create(
            company=self.company, name="Warehouse", type="WAREHOUSE",
        )
        self.store = Location.objects.create(
            company=self.company, name="Store", type="STORE",
        )
        self.vendor = Location.objects.create(
            company=self.company, name="External Vendor", type="VIRTUAL",
        )
        self.pp = PhysicalProduct.objects.create(
            product_model=self.product,
            identifier="SN-001",
            location=self.warehouse,
            status="ACTIVE",
        )
        self.batch = ProductBatch.objects.create(
            product_model=self.batch_product,
            location=self.warehouse,
            batch_identifier="LOT-001",
            quantity=Decimal("10"),
        )

        # Movement A: vendor → warehouse, ties to physical_product
        self.mv_pp = Movement.objects.create(
            product_model=self.product,
            from_location=self.vendor,
            to_location=self.warehouse,
            quantity=Decimal("1"),
            performed_by=self.user,
            reason="seed pp",
            physical_product=self.pp,
        )
        # Movement B: warehouse → store, ties to batch
        self.mv_batch = Movement.objects.create(
            product_model=self.batch_product,
            from_location=self.warehouse,
            to_location=self.store,
            quantity=Decimal("2"),
            performed_by=self.user,
            reason="seed batch",
            batch=self.batch,
        )
        # Movement C: unrelated product, vendor → warehouse
        self.mv_other = Movement.objects.create(
            product_model=self.other_product,
            from_location=self.vendor,
            to_location=self.warehouse,
            quantity=Decimal("3"),
            performed_by=self.user,
            reason="unrelated",
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/movements/"

    def _ids(self, resp):
        results = resp.data.get("results", resp.data)
        return {m["id"] for m in results}

    def test_filter_by_physical_product(self):
        resp = self.client.get(self.url, {"physical_product": str(self.pp.id)})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = self._ids(resp)
        self.assertIn(str(self.mv_pp.id), ids)
        self.assertNotIn(str(self.mv_batch.id), ids)
        self.assertNotIn(str(self.mv_other.id), ids)

    def test_filter_by_batch(self):
        resp = self.client.get(self.url, {"batch": str(self.batch.id)})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = self._ids(resp)
        self.assertEqual(ids, {str(self.mv_batch.id)})

    def test_filter_by_from_location(self):
        resp = self.client.get(self.url, {"from_location": str(self.warehouse.id)})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = self._ids(resp)
        self.assertEqual(ids, {str(self.mv_batch.id)})

    def test_filter_by_to_location(self):
        resp = self.client.get(self.url, {"to_location": str(self.warehouse.id)})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = self._ids(resp)
        self.assertEqual(ids, {str(self.mv_pp.id), str(self.mv_other.id)})

    def test_filter_by_product_model(self):
        resp = self.client.get(self.url, {"product_model": str(self.product.id)})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = self._ids(resp)
        self.assertEqual(ids, {str(self.mv_pp.id)})
