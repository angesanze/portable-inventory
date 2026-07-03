"""
Tests for batch manager audit trail — verifies that _handle_batch_manager_transaction
creates Movement records for every operation.
"""

from django.test import TestCase
from decimal import Decimal
from core.models import Company
from inventory.models import (
    ProductModel,
    Location,
    Movement,
    PhysicalProduct,
    ProductBatch,
    WorkOrder,
)
from inventory.models.composition import ProductComponent
from inventory.services.widget import WidgetService


class BatchManagerLedgerTestBase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Ledger Co", license_code="LDGR01")
        self.warehouse = Location.objects.create(
            company=self.company, name="Main Warehouse", type="WAREHOUSE"
        )
        self.product = ProductModel.objects.create(
            company=self.company, sku="PART-A", name="Part A"
        )
        self.work_order = WorkOrder.objects.create(
            company=self.company, name="WO-001", status="OPEN"
        )


class TestPhysicalProductWOMovements(BatchManagerLedgerTestBase):
    def setUp(self):
        super().setUp()
        self.product.profile = "SERIALIZED"
        self.product.save()
        self.item = PhysicalProduct.objects.create(
            product_model=self.product,
            identifier="SN-001",
            location=self.warehouse,
        )

    def test_assign_physical_product_creates_movement(self):
        initial_count = Movement.objects.count()
        result = WidgetService._handle_batch_manager_transaction(
            self.work_order,
            {"physical_product_id": str(self.item.id), "delta": 1},
        )
        self.assertTrue(result.get("success"))
        self.item.refresh_from_db()
        self.assertEqual(self.item.work_order_id, self.work_order.id)

        movements = Movement.objects.filter(work_order=self.work_order)
        self.assertEqual(movements.count(), initial_count + 1)
        m = movements.first()
        self.assertIn("WO_ASSIGN", m.reason)
        self.assertEqual(m.physical_product_id, self.item.id)
        self.assertEqual(m.quantity, Decimal("1"))

    def test_unassign_physical_product_creates_movement(self):
        self.item.work_order = self.work_order
        self.item.save()
        result = WidgetService._handle_batch_manager_transaction(
            self.work_order,
            {"physical_product_id": str(self.item.id), "delta": -1},
        )
        self.assertTrue(result.get("success"))
        self.item.refresh_from_db()
        self.assertIsNone(self.item.work_order)

        movements = Movement.objects.filter(work_order=self.work_order)
        self.assertEqual(movements.count(), 1)
        m = movements.first()
        self.assertIn("WO_UNASSIGN", m.reason)
        self.assertEqual(m.physical_product_id, self.item.id)


class TestBatchWOMovements(BatchManagerLedgerTestBase):
    def setUp(self):
        super().setUp()
        self.batch = ProductBatch.objects.create(
            product_model=self.product,
            location=self.warehouse,
            batch_identifier="BATCH-001",
            work_order=self.work_order,
            quantity=Decimal("10"),
        )

    def test_batch_add_creates_movement(self):
        result = WidgetService._handle_batch_manager_transaction(
            self.work_order,
            {"batch_id": str(self.batch.id), "delta": 5},
        )
        self.assertTrue(result.get("success"))
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal("15"))

        m = Movement.objects.filter(work_order=self.work_order).first()
        self.assertIn("BATCH_ADD", m.reason)
        self.assertEqual(m.quantity, Decimal("5"))

    def test_batch_remove_creates_movement(self):
        result = WidgetService._handle_batch_manager_transaction(
            self.work_order,
            {"batch_id": str(self.batch.id), "delta": -3},
        )
        self.assertTrue(result.get("success"))
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal("7"))

        m = Movement.objects.filter(work_order=self.work_order).first()
        self.assertIn("BATCH_REMOVE", m.reason)
        self.assertEqual(m.quantity, Decimal("3"))

    def test_batch_full_remove_empties_row_even_when_protected(self):
        # COR-09: a full remove must succeed even though the batch is
        # PROTECT-referenced by its own audit Movements. Book an add first so a
        # Movement points at the batch (the exact case that used to raise
        # ProtectedError on delete()), then remove everything. The row is emptied
        # to 0, not deleted, so the ledger audit chain survives.
        WidgetService._handle_batch_manager_transaction(
            self.work_order,
            {"batch_id": str(self.batch.id), "delta": 5},
        )
        result = WidgetService._handle_batch_manager_transaction(
            self.work_order,
            {"batch_id": str(self.batch.id), "delta": -15},
        )
        self.assertTrue(result.get("success"))
        self.assertTrue(ProductBatch.objects.filter(id=self.batch.id).exists())
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal("0"))

        m = Movement.objects.filter(
            work_order=self.work_order, reason__contains="BATCH_REMOVE"
        ).first()
        self.assertIsNotNone(m)
        self.assertEqual(m.batch_id, self.batch.id)


class TestGenericBatchCreationMovements(BatchManagerLedgerTestBase):
    def test_generic_add_creates_batch_and_movement(self):
        result = WidgetService._handle_batch_manager_transaction(
            self.work_order,
            {"product_model_id": str(self.product.id), "delta": 5},
        )
        self.assertTrue(result.get("success"))

        batch = ProductBatch.objects.filter(work_order=self.work_order).first()
        self.assertIsNotNone(batch)
        self.assertEqual(batch.quantity, Decimal("5"))

        m = Movement.objects.filter(work_order=self.work_order).first()
        self.assertIn("BATCH_ADD", m.reason)
        self.assertEqual(m.quantity, Decimal("5"))
        self.assertEqual(m.batch_id, batch.id)


class TestCanonicalBatchIdentifier(BatchManagerLedgerTestBase):
    """Fix #2/#3: one canonical batch identifier shared by every creation path,
    so the widget add-to-batch lookup hits the existing batch and increments
    instead of minting a duplicate."""

    def test_make_identifier_matches_work_order_service(self):
        # WorkOrderService.create_with_items mints a batch via make_identifier;
        # assert that identifier equals what the helper produces for the same
        # (work order, product) pair — i.e. both routes agree.
        from inventory.services.work_order import WorkOrderService

        wo = WorkOrderService.create_with_items(
            {"company": self.company, "name": "WO-CANON"},
            [{"product_model_id": self.product.id, "quantity": Decimal("4")}],
        )
        batch = ProductBatch.objects.get(work_order=wo, product_model=self.product)
        self.assertEqual(
            batch.batch_identifier,
            ProductBatch.make_identifier(wo, self.product),
        )

    def test_make_identifier_accepts_id_or_instance(self):
        # The helper is fed a bare id (work_order.py) in one site and a model
        # instance (batch_manager.py) in another — both must yield the same key.
        self.assertEqual(
            ProductBatch.make_identifier(self.work_order, self.product),
            ProductBatch.make_identifier(self.work_order, self.product.id),
        )

    def test_repeated_generic_add_increments_single_batch(self):
        # Two add-to-batch calls for the same WO+product must converge on ONE
        # batch (the bug was divergent identifiers creating duplicates).
        data = {"product_model_id": str(self.product.id), "delta": 3}
        WidgetService._handle_batch_manager_transaction(self.work_order, dict(data))
        WidgetService._handle_batch_manager_transaction(self.work_order, dict(data))

        batches = ProductBatch.objects.filter(
            work_order=self.work_order, product_model=self.product
        )
        self.assertEqual(batches.count(), 1)
        self.assertEqual(batches.first().quantity, Decimal("6"))
        self.assertEqual(
            batches.first().batch_identifier,
            ProductBatch.make_identifier(self.work_order, self.product),
        )

    def test_cross_tenant_product_model_raises_not_found(self):
        # Fix #3: an out-of-company product_model id yields a clean 404, not a
        # bare DoesNotExist → 500.
        from inventory.exceptions import ItemNotFoundError

        other_co = Company.objects.create(name="Other Co", license_code="OTHER1")
        foreign = ProductModel.objects.create(company=other_co, sku="FOREIGN", name="Foreign")
        with self.assertRaises(ItemNotFoundError):
            WidgetService._handle_batch_manager_transaction(
                self.work_order,
                {"product_model_id": str(foreign.id), "delta": 5},
            )
        self.assertFalse(ProductBatch.objects.filter(product_model=foreign).exists())


class TestKitProductionMovements(BatchManagerLedgerTestBase):
    def setUp(self):
        super().setUp()
        self.kit = ProductModel.objects.create(company=self.company, sku="KIT-A", name="Kit A")
        self.child1 = ProductModel.objects.create(
            company=self.company, sku="CHILD-1", name="Child 1"
        )
        self.child2 = ProductModel.objects.create(
            company=self.company, sku="CHILD-2", name="Child 2"
        )
        ProductComponent.objects.create(parent=self.kit, child=self.child1, quantity=Decimal("2"))
        ProductComponent.objects.create(parent=self.kit, child=self.child2, quantity=Decimal("3"))
        self.work_order.product_model = self.kit
        self.work_order.save()

    def test_produce_kit_creates_movements_per_component(self):
        result = WidgetService._handle_batch_manager_transaction(
            self.work_order,
            {"operation": "produce_kit", "delta": 1},
        )
        self.assertTrue(result.get("success"))

        movements = Movement.objects.filter(work_order=self.work_order)
        self.assertEqual(movements.count(), 2)

        child1_mov = movements.filter(product_model=self.child1).first()
        self.assertIsNotNone(child1_mov)
        self.assertIn("KIT_PRODUCTION", child1_mov.reason)
        self.assertEqual(child1_mov.quantity, Decimal("2"))

        child2_mov = movements.filter(product_model=self.child2).first()
        self.assertIsNotNone(child2_mov)
        self.assertIn("KIT_PRODUCTION", child2_mov.reason)
        self.assertEqual(child2_mov.quantity, Decimal("3"))


class TestAtomicTransaction(BatchManagerLedgerTestBase):
    def test_zero_delta_no_movement(self):
        result = WidgetService._handle_batch_manager_transaction(self.work_order, {"delta": 0})
        self.assertTrue(result.get("success"))
        self.assertEqual(Movement.objects.filter(work_order=self.work_order).count(), 0)
