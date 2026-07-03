"""ProductSeriesView + RestockService.product_series tests."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from inventory.models import Location, Movement, ProductModel
from inventory.services.restock import RestockService
from inventory.tests.helpers import make_company_full


def _move(product, src, dst, qty, occurred_at=None):
    mv = Movement(
        product_model=product,
        from_location=src,
        to_location=dst,
        quantity=Decimal(str(qty)),
        reason="seed",
    )
    if occurred_at is not None:
        mv.occurred_at = occurred_at
    mv.save()
    if occurred_at is not None:
        # Movement.save() overwrites occurred_at with auto_now-ish behavior in
        # some configurations; force the backdated stamp afterward.
        Movement.objects.filter(pk=mv.pk).update(occurred_at=occurred_at)
    return mv


class ProductSeriesServiceTests(TestCase):
    def setUp(self):
        self.company, self.user, _ = make_company_full("PS")
        self.warehouse = Location.objects.get(company=self.company, name="Main Warehouse")
        self.vendor = Location.objects.get(company=self.company, name="External Vendor")
        self.loss = Location.objects.get(company=self.company, name="Loss")

    def _make(self, sku, **fields):
        return ProductModel.objects.create(
            company=self.company,
            sku=sku,
            name=sku,
            profile="SIMPLE_COUNT",
            **fields,
        )

    def test_series_length_matches_days_param(self):
        prod = self._make("LEN", reorder_threshold=Decimal("5"))
        _move(prod, self.vendor, self.warehouse, 100)
        for days in (7, 14, 30, 90):
            payload = RestockService.product_series(prod, days=days)
            self.assertEqual(payload["days"], days)
            self.assertEqual(len(payload["series"]), days)
            for point in payload["series"]:
                self.assertIn("date", point)
                self.assertIn("on_hand", point)
                self.assertIn("inbound", point)
                self.assertIn("outbound", point)

    def test_velocity_7d_matches_sum_outbound_div_7(self):
        prod = self._make("VEL", reorder_threshold=Decimal("10"))
        _move(prod, self.vendor, self.warehouse, 50)
        now = timezone.now()
        # 7 outbound of 2 each in last 7 days -> velocity_7d = 14/7 = 2.0
        for i in range(7):
            _move(
                prod,
                self.warehouse,
                self.loss,
                2,
                occurred_at=now - timedelta(days=i, hours=1),
            )
        payload = RestockService.product_series(prod, days=30)
        self.assertAlmostEqual(payload["velocity"]["7d"], 2.0, places=2)

    def test_inbound_outbound_breakdown_bucketed_per_day(self):
        prod = self._make("IO", reorder_threshold=Decimal("5"))
        now = timezone.now()
        _move(prod, self.vendor, self.warehouse, 10, occurred_at=now - timedelta(days=2, hours=1))
        _move(prod, self.warehouse, self.loss, 3, occurred_at=now - timedelta(days=1, hours=1))

        payload = RestockService.product_series(prod, days=7)
        # last entry = today; index -2 ~= yesterday, -3 ~= day-before
        today_point = payload["series"][-1]
        yest_point = payload["series"][-2]
        twoago_point = payload["series"][-3]

        self.assertEqual(today_point["inbound"], 0.0)
        self.assertEqual(today_point["outbound"], 0.0)
        self.assertEqual(yest_point["inbound"], 0.0)
        self.assertEqual(yest_point["outbound"], 3.0)
        self.assertEqual(twoago_point["inbound"], 10.0)
        self.assertEqual(twoago_point["outbound"], 0.0)

    def test_projection_days_to_out_finite_with_positive_burn(self):
        prod = self._make("PROJ", reorder_threshold=Decimal("10"))
        _move(prod, self.vendor, self.warehouse, 60)
        now = timezone.now()
        # 30 outbound across the 30-day window -> daily_burn = 1.0
        for i in range(30):
            _move(
                prod,
                self.warehouse,
                self.loss,
                1,
                occurred_at=now - timedelta(days=i, hours=1),
            )
        payload = RestockService.product_series(prod, days=30)
        self.assertGreater(payload["projection"]["daily_burn"], 0)
        self.assertIsNotNone(payload["projection"]["days_to_out"])
        # 30 remaining / 1 per day = 30 days
        self.assertAlmostEqual(payload["projection"]["days_to_out"], 30.0, places=0)
        # Crosses reorder threshold of 10 when 20 units consumed -> 20 days
        self.assertIsNotNone(payload["projection"]["days_to_reorder"])
        self.assertAlmostEqual(payload["projection"]["days_to_reorder"], 20.0, places=0)

    def test_projection_none_when_no_burn(self):
        prod = self._make("STILL", reorder_threshold=Decimal("10"))
        _move(prod, self.vendor, self.warehouse, 50)
        payload = RestockService.product_series(prod, days=30)
        self.assertEqual(payload["projection"]["daily_burn"], 0.0)
        self.assertIsNone(payload["projection"]["days_to_out"])
        self.assertIsNone(payload["projection"]["days_to_reorder"])
        self.assertIsNone(payload["projection"]["days_to_critical"])

    def test_suggested_reorder_qty_uses_max_threshold_when_set(self):
        prod = self._make(
            "SUG",
            reorder_threshold=Decimal("10"),
            max_threshold=Decimal("100"),
        )
        _move(prod, self.vendor, self.warehouse, 30)
        payload = RestockService.product_series(prod, days=30)
        self.assertEqual(payload["projection"]["suggested_reorder_qty"], 70.0)

    def test_suggested_reorder_qty_uses_30day_burn_when_no_max(self):
        prod = self._make("SUGBURN", reorder_threshold=Decimal("10"))
        _move(prod, self.vendor, self.warehouse, 60)
        now = timezone.now()
        for i in range(30):
            _move(
                prod,
                self.warehouse,
                self.loss,
                1,
                occurred_at=now - timedelta(days=i, hours=1),
            )
        payload = RestockService.product_series(prod, days=30)
        # burn 1/day * 30 = 30
        self.assertAlmostEqual(payload["projection"]["suggested_reorder_qty"], 30.0, places=0)


class ProductSeriesEndpointTests(TestCase):
    def setUp(self):
        self.company_a, self.user_a, _ = make_company_full("PSA")
        self.company_b, self.user_b, _ = make_company_full("PSB")
        self.prod_a = ProductModel.objects.create(
            company=self.company_a,
            sku="MINE",
            name="Mine",
            profile="SIMPLE_COUNT",
            reorder_threshold=Decimal("5"),
        )
        self.prod_b = ProductModel.objects.create(
            company=self.company_b,
            sku="OTHER",
            name="Other",
            profile="SIMPLE_COUNT",
            reorder_threshold=Decimal("5"),
        )

    def test_endpoint_returns_series(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        resp = client.get(f"/api/v1/products/{self.prod_a.id}/stock-series/?days=30")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["product_id"], str(self.prod_a.id))
        self.assertEqual(body["days"], 30)
        self.assertEqual(len(body["series"]), 30)
        self.assertIn("velocity", body)
        self.assertIn("projection", body)
        self.assertIn("7d", body["velocity"])
        self.assertIn("30d", body["velocity"])
        self.assertIn("90d", body["velocity"])

    def test_days_param_clamped(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        # Below floor -> clamped to 7
        resp = client.get(f"/api/v1/products/{self.prod_a.id}/stock-series/?days=1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["days"], 7)
        # Above ceiling -> clamped to 365
        resp = client.get(f"/api/v1/products/{self.prod_a.id}/stock-series/?days=9999")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["days"], 365)

    def test_days_param_invalid_defaults_to_90(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        resp = client.get(f"/api/v1/products/{self.prod_a.id}/stock-series/?days=oops")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["days"], 90)

    def test_cross_company_access_returns_404(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        resp = client.get(f"/api/v1/products/{self.prod_b.id}/stock-series/")
        self.assertEqual(resp.status_code, 404)

    def test_endpoint_requires_authentication(self):
        client = APIClient()
        resp = client.get(f"/api/v1/products/{self.prod_a.id}/stock-series/")
        self.assertIn(resp.status_code, (401, 403))
