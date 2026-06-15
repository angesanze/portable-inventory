"""Tests for __str__ methods and updated_at timestamp fields."""

from django.test import TestCase
from core.models import Company
from inventory.models import ProductModel, Location
from inventory.models.tracking import PhysicalProduct, ProductBatch


class PhysicalProductStrTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="StrTestCo", license_code="STRTS1")
        self.location = Location.objects.create(
            company=self.company, name="WH1", type="WAREHOUSE"
        )
        self.product = ProductModel.objects.create(
            company=self.company,
            sku="SER-001",
            name="Widget A",
            profile="SERIALIZED",
        )

    def test_str_with_identifier(self):
        pp = PhysicalProduct.objects.create(
            product_model=self.product,
            identifier="UNIT-42",
            location=self.location,
        )
        self.assertEqual(str(pp), "Widget A - UNIT-42")

    def test_str_without_identifier_uses_id(self):
        """When identifier is falsy, __str__ falls back to the UUID."""
        pp = PhysicalProduct(
            product_model=self.product,
            identifier="",
            location=self.location,
        )
        # Don't save (validation requires non-blank identifier),
        # but __str__ should still work on an unsaved instance.
        self.assertEqual(str(pp), f"Widget A - {pp.id}")


class UpdatedAtFieldTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TimestampCo", license_code="TMST01")

    def test_product_model_has_updated_at(self):
        pm = ProductModel.objects.create(
            company=self.company, sku="PM-001", name="Test"
        )
        self.assertIsNotNone(pm.updated_at)

    def test_product_batch_has_updated_at(self):
        pm = ProductModel.objects.create(
            company=self.company, sku="PM-002", name="Batch Test",
            profile="BATCH_TRACKED",
        )
        loc = Location.objects.create(
            company=self.company, name="WH-BATCH", type="WAREHOUSE"
        )
        batch = ProductBatch.objects.create(
            product_model=pm, location=loc,
            batch_identifier="LOT-1", quantity=10,
        )
        self.assertIsNotNone(batch.updated_at)

    def test_physical_product_has_timestamps(self):
        pm = ProductModel.objects.create(
            company=self.company, sku="PM-003", name="Serial Test",
            profile="SERIALIZED",
        )
        loc = Location.objects.create(
            company=self.company, name="WH-SER", type="WAREHOUSE"
        )
        pp = PhysicalProduct.objects.create(
            product_model=pm, identifier="S-001", location=loc,
        )
        self.assertIsNotNone(pp.created_at)
        self.assertIsNotNone(pp.updated_at)
