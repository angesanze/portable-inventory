"""Threshold field + stock_status bucket scoring tests."""

from decimal import Decimal

from django.test import TestCase

from core.models import Company
from inventory.models import Location, Movement, ProductModel
from inventory.serializers.products import ProductModelSerializer


def _seed_stock(product, warehouse, qty):
    """Push `qty` units into warehouse via a vendor → warehouse movement."""
    vendor, _ = Location.objects.get_or_create(
        company=product.company,
        name="External Vendor",
        defaults={"type": "VIRTUAL"},
    )
    Movement.objects.create(
        product_model=product,
        from_location=vendor,
        to_location=warehouse,
        quantity=Decimal(str(qty)),
        reason="seed",
    )


class ThresholdBucketTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="ThreshCo", license_code="THRSH1")
        self.warehouse = Location.objects.create(
            company=self.company,
            name="Warehouse",
            type="WAREHOUSE",
        )

    def _make_product(self, sku, **fields):
        return ProductModel.objects.create(
            company=self.company,
            sku=sku,
            name=sku,
            profile="SIMPLE_COUNT",
            **fields,
        )

    def _bucket(self, product):
        return ProductModelSerializer(product).data["stock_status"]["bucket"]

    def test_reorder_bucket(self):
        prod = self._make_product("R-1", reorder_threshold=Decimal("10"))
        _seed_stock(prod, self.warehouse, 5)
        self.assertEqual(self._bucket(prod), "REORDER")

    def test_critical_bucket_with_explicit_critical_threshold(self):
        prod = self._make_product(
            "C-1",
            reorder_threshold=Decimal("10"),
            critical_threshold=Decimal("2"),
        )
        _seed_stock(prod, self.warehouse, 1)
        self.assertEqual(self._bucket(prod), "CRITICAL")

    def test_out_bucket_when_zero(self):
        prod = self._make_product("O-1", reorder_threshold=Decimal("10"))
        # no stock seeded → qty 0
        self.assertEqual(self._bucket(prod), "OUT")

    def test_overstock_bucket(self):
        prod = self._make_product(
            "OS-1",
            reorder_threshold=Decimal("10"),
            max_threshold=Decimal("100"),
        )
        _seed_stock(prod, self.warehouse, 150)
        self.assertEqual(self._bucket(prod), "OVERSTOCK")

    def test_healthy_bucket_above_reorder(self):
        prod = self._make_product("H-1", reorder_threshold=Decimal("10"))
        _seed_stock(prod, self.warehouse, 50)
        self.assertEqual(self._bucket(prod), "HEALTHY")

    def test_critical_fallback_to_reorder_half(self):
        """No critical_threshold → falls back to reorder_threshold / 2."""
        prod = self._make_product("CF-1", reorder_threshold=Decimal("10"))
        # qty=4 < reorder/2=5 → CRITICAL
        _seed_stock(prod, self.warehouse, 4)
        self.assertEqual(self._bucket(prod), "CRITICAL")

    def test_legacy_min_threshold_attribute_resolves_to_reorder(self):
        """Back-compat: products with only attributes['min_threshold'] still bucket as REORDER."""
        prod = self._make_product("LEG-1", attributes={"min_threshold": 10})
        _seed_stock(prod, self.warehouse, 5)
        data = ProductModelSerializer(prod).data["stock_status"]
        # qty=5, reorder=10, no explicit critical → fallback critical=5; 5 < 5 is False
        # so we land in REORDER (5 < 10 and 5 not < 5)
        self.assertEqual(data["bucket"], "REORDER")
        self.assertEqual(data["status"], "LOW")

    def test_status_low_for_reorder_critical_out(self):
        for sku, qty, expected_bucket in [
            ("S-R", 5, "REORDER"),
            ("S-C", 1, "CRITICAL"),
            ("S-O", 0, "OUT"),
        ]:
            prod = self._make_product(
                sku,
                reorder_threshold=Decimal("10"),
                critical_threshold=Decimal("2"),
            )
            if qty > 0:
                _seed_stock(prod, self.warehouse, qty)
            data = ProductModelSerializer(prod).data["stock_status"]
            self.assertEqual(data["bucket"], expected_bucket, sku)
            self.assertEqual(data["status"], "LOW", sku)

    def test_status_ok_for_healthy_and_overstock(self):
        healthy = self._make_product("OK-H", reorder_threshold=Decimal("10"))
        _seed_stock(healthy, self.warehouse, 50)
        self.assertEqual(
            ProductModelSerializer(healthy).data["stock_status"]["status"],
            "OK",
        )

        over = self._make_product(
            "OK-O",
            reorder_threshold=Decimal("10"),
            max_threshold=Decimal("100"),
        )
        _seed_stock(over, self.warehouse, 150)
        self.assertEqual(
            ProductModelSerializer(over).data["stock_status"]["status"],
            "OK",
        )

    def test_serializer_exposes_threshold_fields(self):
        prod = self._make_product(
            "F-1",
            reorder_threshold=Decimal("10"),
            critical_threshold=Decimal("2"),
            max_threshold=Decimal("100"),
            reorder_qty=Decimal("50"),
        )
        data = ProductModelSerializer(prod).data
        self.assertEqual(Decimal(data["reorder_threshold"]), Decimal("10"))
        self.assertEqual(Decimal(data["critical_threshold"]), Decimal("2"))
        self.assertEqual(Decimal(data["max_threshold"]), Decimal("100"))
        self.assertEqual(Decimal(data["reorder_qty"]), Decimal("50"))
