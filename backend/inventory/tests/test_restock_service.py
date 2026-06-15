"""RestockService scoring + RestockBoardView endpoint tests."""
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
    return mv


class RestockServiceTests(TestCase):
    def setUp(self):
        self.company, self.user, _ = make_company_full("R")
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

    def test_build_board_buckets_five_products(self):
        out_p = self._make("OUT-1", reorder_threshold=Decimal("10"))
        crit_p = self._make(
            "CRIT-1",
            reorder_threshold=Decimal("10"),
            critical_threshold=Decimal("2"),
        )
        _move(crit_p, self.vendor, self.warehouse, 1)
        ro_p = self._make("RO-1", reorder_threshold=Decimal("10"))
        _move(ro_p, self.vendor, self.warehouse, 5)
        ok_p = self._make("OK-1", reorder_threshold=Decimal("10"))
        _move(ok_p, self.vendor, self.warehouse, 50)
        over_p = self._make(
            "OVR-1",
            reorder_threshold=Decimal("10"),
            max_threshold=Decimal("100"),
        )
        _move(over_p, self.vendor, self.warehouse, 200)

        board = RestockService.build_board(self.company)
        cols = board["columns"]

        self.assertEqual(cols["OUT"]["count"], 1)
        self.assertEqual(cols["CRITICAL"]["count"], 1)
        self.assertEqual(cols["REORDER"]["count"], 1)
        self.assertEqual(cols["HEALTHY"]["count"], 1)
        self.assertEqual(cols["OVERSTOCK"]["count"], 1)

        self.assertEqual(board["totals"]["products"], 5)
        self.assertEqual(board["totals"]["needs_attention"], 3)
        self.assertIn("generated_at", board)

        # OUT urgency pinned at 1.0
        self.assertEqual(cols["OUT"]["products"][0]["urgency"], 1.0)
        self.assertEqual(cols["OUT"]["products"][0]["sku"], "OUT-1")

        # Every card has 14-entry sparkline
        for col in cols.values():
            for card in col["products"]:
                self.assertEqual(len(card["sparkline"]), 14)

    def test_urgency_sorted_descending_within_column(self):
        # Two REORDER products: lower qty -> higher urgency -> sorted first.
        # Pin critical low so qty=3 still sits in REORDER (not CRITICAL).
        low = self._make("LOW", reorder_threshold=Decimal("10"), critical_threshold=Decimal("1"))
        _move(low, self.vendor, self.warehouse, 3)
        high = self._make("HIGH", reorder_threshold=Decimal("10"), critical_threshold=Decimal("1"))
        _move(high, self.vendor, self.warehouse, 8)

        board = RestockService.build_board(self.company)
        ros = board["columns"]["REORDER"]["products"]
        self.assertEqual(ros[0]["sku"], "LOW")
        self.assertEqual(ros[1]["sku"], "HIGH")
        self.assertGreater(ros[0]["urgency"], ros[1]["urgency"])

    def test_days_to_runout_finite_for_reorder_with_positive_velocity(self):
        prod = self._make("VEL", reorder_threshold=Decimal("10"))
        _move(prod, self.vendor, self.warehouse, 20)

        # Backdate 7 outbound movements (2 units each) within the velocity window.
        now = timezone.now()
        for i in range(7):
            mv = _move(prod, self.warehouse, self.loss, 2)
            Movement.objects.filter(pk=mv.pk).update(
                occurred_at=now - timedelta(days=i, hours=1),
            )

        board = RestockService.build_board(self.company)
        card = next(c for c in board["columns"]["REORDER"]["products"] if c["sku"] == "VEL")
        # 20 in, 14 out (2 × 7) = 6 on hand
        self.assertEqual(card["qty"], 6.0)
        self.assertGreater(card["velocity_7d"], 0)
        self.assertIsNotNone(card["days_to_runout"])
        # 6 qty / 2 per day = 3 days
        self.assertAlmostEqual(card["days_to_runout"], 3.0, places=1)

    def test_critical_fallback_when_only_reorder_set(self):
        # critical_threshold None -> falls back to reorder/2 = 5
        prod = self._make("CFB", reorder_threshold=Decimal("10"))
        _move(prod, self.vendor, self.warehouse, 4)  # qty 4 < 5 → CRITICAL
        board = RestockService.build_board(self.company)
        self.assertEqual(board["columns"]["CRITICAL"]["count"], 1)
        card = board["columns"]["CRITICAL"]["products"][0]
        self.assertEqual(card["sku"], "CFB")
        # 0.9 - (4/5)*0.2 = 0.74
        self.assertAlmostEqual(card["urgency"], 0.74, places=2)


class RestockBoardEndpointTests(TestCase):
    def setUp(self):
        self.company_a, self.user_a, _ = make_company_full("EA")
        self.company_b, self.user_b, _ = make_company_full("EB")

        ProductModel.objects.create(
            company=self.company_a, sku="MINE", name="Mine",
            profile="SIMPLE_COUNT", reorder_threshold=Decimal("5"),
        )
        ProductModel.objects.create(
            company=self.company_b, sku="OTHER", name="Other",
            profile="SIMPLE_COUNT", reorder_threshold=Decimal("5"),
        )

    def test_endpoint_returns_board_with_five_columns(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        resp = client.get("/api/v1/restock/board/")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(
            set(body["columns"].keys()),
            {"HEALTHY", "REORDER", "CRITICAL", "OUT", "OVERSTOCK"},
        )

    def test_endpoint_scoped_to_authenticated_company(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        resp = client.get("/api/v1/restock/board/")
        body = resp.json()
        skus = [
            card["sku"]
            for col in body["columns"].values()
            for card in col["products"]
        ]
        self.assertIn("MINE", skus)
        self.assertNotIn("OTHER", skus)

    def test_endpoint_requires_authentication(self):
        client = APIClient()
        resp = client.get("/api/v1/restock/board/")
        self.assertIn(resp.status_code, (401, 403))
