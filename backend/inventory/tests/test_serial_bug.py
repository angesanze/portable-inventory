from django.test import TestCase
from inventory.models import PhysicalProduct, WorkOrder, ProductModel, Location
from core.models import Company
from inventory.services import WidgetService
import uuid


class TestSerialRemoval(TestCase):
    def test_remove_serial_from_work_order(self):
        company = Company.objects.create(
            name="SerialCo1", license_code=uuid.uuid4().hex[:6].upper()
        )
        model = ProductModel.objects.create(
            company=company, name="Test Model", sku="TEST-01", profile="SERIALIZED"
        )
        loc = Location.objects.create(name="Test Loc", company=company, type="WAREHOUSE")

        wo = WorkOrder.objects.create(name="TEST_WO_SERIAL", status="OPEN", company=company)
        serial1 = PhysicalProduct.objects.create(
            product_model=model,
            location=loc,
            identifier="TESTERIAL123",
            status="ACTIVE",
            work_order=wo,
        )
        serial2 = PhysicalProduct.objects.create(
            product_model=model,
            location=loc,
            identifier="TESTERIAL456",
            status="ACTIVE",
            work_order=wo,
        )

        self.assertEqual(serial1.work_order_id, wo.id)

        data = {
            "operation": "batch_update_item",
            "product_model_id": str(model.id),
            "delta": -1,
            "physical_identifier": "TESTERIAL123",
            "physical_product_id": str(serial1.id),
            "batch_id": None,
        }

        res = WidgetService._handle_batch_manager_transaction(wo, data)
        self.assertTrue(res.get("success"), res)

        serial1.refresh_from_db()
        self.assertIsNone(
            serial1.work_order_id,
            f"Serial work_order_id is {serial1.work_order_id}, should be None",
        )

        # Now test serialization
        widget_data = WidgetService.get_widget_product_details(company, wo.id, None)
        grouped = widget_data.get("grouped_items", {})
        model_group = grouped.get(str(model.id), {})
        items = model_group.get("items", [])

        # Should have 1 item now that 1 out of 2 is detached
        self.assertEqual(model_group.get("model", {}).get("name"), "Test Model")
        self.assertEqual(len(items), 1)
        self.assertEqual(model_group.get("total_quantity"), 1)

    def test_add_bulk_to_work_order(self):
        company = Company.objects.create(
            name="SerialCo2", license_code=uuid.uuid4().hex[:6].upper()
        )
        model = ProductModel.objects.create(
            company=company, name="Test Bulk Model", sku="TEST-BULK", profile="SIMPLE_COUNT"
        )
        loc = Location.objects.create(name="Test Loc 2", company=company, type="WAREHOUSE")
        wo = WorkOrder.objects.create(name="TEST_WO_BULK", status="OPEN", company=company)

        from inventory.models import ProductBatch

        batch = ProductBatch.objects.create(
            product_model=model,
            work_order=wo,
            location=loc,
            quantity=10,
            batch_identifier="BULK_BATCH_1",
        )

        data = {
            "operation": "batch_update_item",
            "product_model_id": str(model.id),
            "delta": 3,
            "batch_id": str(batch.id),
        }
        res = WidgetService._handle_batch_manager_transaction(wo, data)
        self.assertTrue(res.get("success"), res)

        batch.refresh_from_db()
        self.assertEqual(batch.quantity, 13)

        widget_data = WidgetService.get_widget_product_details(company, wo.id, None)
        grouped = widget_data.get("grouped_items", {})
        model_group = grouped.get(str(model.id), {})

        self.assertEqual(model_group.get("model", {}).get("name"), "Test Bulk Model")
        self.assertEqual(model_group.get("total_quantity"), 13)
        items = model_group.get("items", [])
        self.assertEqual(len(items), 1)
