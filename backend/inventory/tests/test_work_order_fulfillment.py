"""Tests for WorkOrderFulfillmentService.fulfill() and its two endpoints.

Covers mixed WorkOrder contents (BATCH bucket + BULK counter + SERIAL/INDIVIDUAL),
idempotency on a CLOSED WO, the empty-WO edge case, atomic rollback on mid-loop
failure, and both the app action (`POST /api/v1/work-orders/<id>/fulfill/`) and the
widget transaction operation (`operation: fulfill`).

Setup mirrors the fixture style of test_work_order_serializer.py and
test_batch_manager_ledger.py.
"""

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from inventory.exceptions import InventoryError
from inventory.models import (
    Location,
    Movement,
    PhysicalProduct,
    ProductBatch,
    WorkOrder,
)
from inventory.services import WorkOrderFulfillmentService
from inventory.services.ledger import LedgerService
from inventory.tests.helpers import (
    make_batch_product,
    make_company,
    make_serialized_product,
    make_simple_product,
)


class WorkOrderFulfillmentTestBase(TestCase):
    """Build a WorkOrder holding one BATCH, one BULK, and one SERIAL item."""

    def setUp(self):
        self.company, self.user, self.api_key = make_company("FULFILL")

        # Explicit locations (a default WAREHOUSE may also be auto-seeded; the
        # fulfill path resolves the External sink by name, not by single-location).
        self.warehouse = Location.objects.create(
            company=self.company, name="Fulfill Warehouse", type="WAREHOUSE"
        )
        self.external = Location.objects.create(
            company=self.company, name="External", type="VIRTUAL"
        )

        # One product per engine family.
        self.batch_model = make_batch_product(
            self.company, sku="WO-BATCH", name="Batch Model"
        )  # BATCH_TRACKED → bucket
        self.bulk_model = make_simple_product(
            self.company, sku="WO-BULK", name="Bulk Model"
        )  # SIMPLE_COUNT → counter / BULK
        self.serial_model = make_serialized_product(
            self.company, sku="WO-SERIAL", name="Serial Model"
        )  # SERIALIZED → tracker / INDIVIDUAL

        self.wo = WorkOrder.objects.create(
            company=self.company, name="WO-FULFILL", status="OPEN"
        )

        # BATCH bucket: stock lives in the ProductBatch row itself.
        self.batch = ProductBatch.objects.create(
            product_model=self.batch_model,
            location=self.warehouse,
            batch_identifier="LOT-A",
            work_order=self.wo,
            quantity=Decimal("10"),
        )

        # BULK counter: the ProductBatch is the WO annotation; actual stock is the
        # movement ledger, so seed an inbound movement to satisfy stock validation.
        self.bulk_batch = ProductBatch.objects.create(
            product_model=self.bulk_model,
            location=self.warehouse,
            batch_identifier="BULK-A",
            work_order=self.wo,
            quantity=Decimal("5"),
        )
        Movement.objects.create(
            product_model=self.bulk_model,
            from_location=self.external,
            to_location=self.warehouse,
            quantity=Decimal("5"),
            performed_by=self.user,
            reason="Seed bulk stock",
        )

        # SERIAL: a single ACTIVE physical item assigned to the WO.
        self.item = PhysicalProduct.objects.create(
            product_model=self.serial_model,
            identifier="SN-1",
            status="ACTIVE",
            location=self.warehouse,
            work_order=self.wo,
        )


class FulfillServiceTest(WorkOrderFulfillmentTestBase):
    """Direct service-level coverage."""

    def test_fulfill_discharges_all_contents(self):
        summary = WorkOrderFulfillmentService.fulfill(self.wo, user=self.user)

        # Summary reflects 2 ProductBatch rows + 1 PhysicalProduct.
        self.assertTrue(summary["success"])
        self.assertEqual(summary["batches_fulfilled"], 2)
        self.assertEqual(summary["items_fulfilled"], 1)
        self.assertEqual(summary["status"], "CLOSED")

        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "CLOSED")

        # WorkOrder contents() invariant: nothing left to show.
        self.assertEqual(
            ProductBatch.objects.filter(work_order=self.wo, quantity__gt=0).count(),
            0,
        )
        self.assertEqual(
            PhysicalProduct.objects.filter(
                work_order=self.wo, status="ACTIVE"
            ).count(),
            0,
        )

        # One outbound movement per item, tagged with the WO, into External.
        outbound = Movement.objects.filter(
            work_order=self.wo, to_location=self.external
        )
        self.assertEqual(outbound.count(), 3)

    def test_fulfill_idempotent_on_closed(self):
        WorkOrderFulfillmentService.fulfill(self.wo, user=self.user)
        movements_after_first = Movement.objects.filter(work_order=self.wo).count()

        with self.assertRaises(InventoryError):
            WorkOrderFulfillmentService.fulfill(self.wo, user=self.user)

        # Second (rejected) call must not create any extra movements.
        self.assertEqual(
            Movement.objects.filter(work_order=self.wo).count(),
            movements_after_first,
        )

    def test_fulfill_empty_work_order(self):
        empty_wo = WorkOrder.objects.create(
            company=self.company, name="WO-EMPTY", status="OPEN"
        )

        summary = WorkOrderFulfillmentService.fulfill(empty_wo, user=self.user)

        self.assertTrue(summary["success"])
        self.assertEqual(summary["batches_fulfilled"], 0)
        self.assertEqual(summary["items_fulfilled"], 0)
        self.assertEqual(summary["status"], "CLOSED")

        empty_wo.refresh_from_db()
        self.assertEqual(empty_wo.status, "CLOSED")
        self.assertEqual(Movement.objects.filter(work_order=empty_wo).count(), 0)

    def test_fulfill_atomic_rollback(self):
        """A failure on the 2nd transfer must roll back the whole evasion."""
        real_transfer = LedgerService.transfer_stock
        state = {"calls": 0}

        def flaky_transfer(*args, **kwargs):
            state["calls"] += 1
            if state["calls"] == 2:
                raise InventoryError(detail="Simulated mid-loop failure")
            return real_transfer(*args, **kwargs)

        with patch(
            "inventory.services.work_order_fulfillment.LedgerService.transfer_stock",
            side_effect=flaky_transfer,
        ):
            with self.assertRaises(InventoryError):
                WorkOrderFulfillmentService.fulfill(self.wo, user=self.user)

        # Nothing persisted: the first (real) transfer's movement is rolled back.
        self.assertEqual(Movement.objects.filter(work_order=self.wo).count(), 0)

        # WorkOrder stays OPEN, contents intact.
        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "OPEN")
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal("10"))


class FulfillAppEndpointTest(WorkOrderFulfillmentTestBase):
    """App action: POST /api/v1/work-orders/<id>/fulfill/."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_fulfill_action_endpoint(self):
        resp = self.client.post(f"/api/v1/work-orders/{self.wo.id}/fulfill/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["success"])
        self.assertEqual(resp.data["status"], "CLOSED")
        self.assertEqual(resp.data["batches_fulfilled"], 2)
        self.assertEqual(resp.data["items_fulfilled"], 1)

        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "CLOSED")


class FulfillWidgetEndpointTest(WorkOrderFulfillmentTestBase):
    """Widget transaction operation: {"operation": "fulfill"}."""

    def test_fulfill_via_widget_transaction(self):
        client = APIClient()
        url = reverse("widget-transaction", kwargs={"pk": self.wo.id})

        resp = client.post(
            f"{url}?api_key={self.api_key.key}",
            {"operation": "fulfill"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "CLOSED")
        self.assertEqual(data["batches_fulfilled"], 2)
        self.assertEqual(data["items_fulfilled"], 1)

        self.wo.refresh_from_db()
        self.assertEqual(self.wo.status, "CLOSED")
