"""End-to-end Restock Kanban flow.

Covers the round trip used by the frontend Kanban board:

* board fetch returns five buckets with correct counts, urgency ordering,
  14-entry sparklines;
* per-product series endpoint returns 30 daily points and a finite
  ``projection.days_to_out`` for a high-burn product;
* a PATCH against ``/api/v1/product-models/<id>/`` that lowers the
  reorder threshold both reshuffles the board (CRITICAL → HEALTHY) and
  syncs a ``MonitoringRule`` via the post_save signal;
* a different company's products never appear in the caller's board.
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from inventory.models import Location, MonitoringRule, Movement, ProductModel
from inventory.services.restock import RestockService
from inventory.tests.helpers import make_company_full


def _seed_move(product, src, dst, qty, occurred_at=None):
    """Create a Movement at a backdated timestamp (helpers in sibling tests
    do the same dance — Movement.save() doesn't honor occurred_at on insert
    so we force it via a second UPDATE)."""
    mv = Movement.objects.create(
        product_model=product,
        from_location=src,
        to_location=dst,
        quantity=Decimal(str(qty)),
        reason="e2e-seed",
    )
    if occurred_at is not None:
        Movement.objects.filter(pk=mv.pk).update(occurred_at=occurred_at)
    return mv


class RestockKanbanE2ETests(TestCase):
    def setUp(self):
        self.company, self.user, _ = make_company_full("E2E")
        self.warehouse = Location.objects.get(company=self.company, name="Main Warehouse")
        self.vendor = Location.objects.get(company=self.company, name="External Vendor")
        self.loss = Location.objects.get(company=self.company, name="Loss")

        # Foreign-company products must never leak into our board.
        self.other_company, self.other_user, _ = make_company_full("E2E-OTHER")
        ProductModel.objects.create(
            company=self.other_company,
            sku="FOREIGN-1",
            name="Foreign Product",
            profile="SIMPLE_COUNT",
            reorder_threshold=Decimal("5"),
        )

        now = timezone.now()

        # HEALTHY: 50 on hand, reorder=10, no burn.
        self.healthy = ProductModel.objects.create(
            company=self.company,
            sku="HEALTHY-1",
            name="Healthy",
            profile="SIMPLE_COUNT",
            reorder_threshold=Decimal("10"),
        )
        _seed_move(
            self.healthy, self.vendor, self.warehouse, 50, occurred_at=now - timedelta(days=20)
        )

        # REORDER: 5 on hand, reorder=10, critical=1.
        self.reorder = ProductModel.objects.create(
            company=self.company,
            sku="REORDER-1",
            name="Reorder",
            profile="SIMPLE_COUNT",
            reorder_threshold=Decimal("10"),
            critical_threshold=Decimal("1"),
        )
        _seed_move(
            self.reorder, self.vendor, self.warehouse, 5, occurred_at=now - timedelta(days=15)
        )

        # CRITICAL: 1 on hand, reorder=10, critical=2, high outbound burn so
        # projection.days_to_out ≤ 14. Receive 30, then 29 outbound spread
        # across 30 days → daily_burn ≈ 0.97 → days_to_out ≈ 1.0.
        self.critical = ProductModel.objects.create(
            company=self.company,
            sku="CRIT-1",
            name="Critical",
            profile="SIMPLE_COUNT",
            reorder_threshold=Decimal("10"),
            critical_threshold=Decimal("2"),
        )
        _seed_move(
            self.critical,
            self.vendor,
            self.warehouse,
            30,
            occurred_at=now - timedelta(days=29, hours=12),
        )
        for i in range(29):
            _seed_move(
                self.critical,
                self.warehouse,
                self.loss,
                1,
                occurred_at=now - timedelta(days=i, hours=1),
            )

        # OUT: zero stock.
        self.out = ProductModel.objects.create(
            company=self.company,
            sku="OUT-1",
            name="Out",
            profile="SIMPLE_COUNT",
            reorder_threshold=Decimal("10"),
        )

        # OVERSTOCK: 200 on hand, max=100.
        self.overstock = ProductModel.objects.create(
            company=self.company,
            sku="OVR-1",
            name="Overstock",
            profile="SIMPLE_COUNT",
            reorder_threshold=Decimal("10"),
            max_threshold=Decimal("100"),
        )
        _seed_move(
            self.overstock, self.vendor, self.warehouse, 200, occurred_at=now - timedelta(days=25)
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    # ── /restock/board/ shape ────────────────────────────────────────

    def test_board_columns_have_correct_counts_and_sparklines(self):
        resp = self.client.get("/api/v1/restock/board/")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        cols = body["columns"]

        self.assertEqual(cols["HEALTHY"]["count"], 1)
        self.assertEqual(cols["REORDER"]["count"], 1)
        self.assertEqual(cols["CRITICAL"]["count"], 1)
        self.assertEqual(cols["OUT"]["count"], 1)
        self.assertEqual(cols["OVERSTOCK"]["count"], 1)

        self.assertEqual(body["totals"]["products"], 5)
        self.assertEqual(body["totals"]["needs_attention"], 3)

        # Every card has a 14-day sparkline and urgency in [0, 1].
        for col in cols.values():
            for card in col["products"]:
                self.assertEqual(len(card["sparkline"]), RestockService.SPARKLINE_DAYS)
                self.assertGreaterEqual(card["urgency"], 0.0)
                self.assertLessEqual(card["urgency"], 1.0)

        # Urgency sorted descending inside every column.
        for col in cols.values():
            urgencies = [c["urgency"] for c in col["products"]]
            self.assertEqual(urgencies, sorted(urgencies, reverse=True))

    # ── /products/<id>/stock-series/ ────────────────────────────────

    def test_stock_series_returns_30_points_and_finite_runway(self):
        resp = self.client.get(f"/api/v1/products/{self.critical.id}/stock-series/?days=30")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()

        self.assertEqual(body["days"], 30)
        self.assertEqual(len(body["series"]), 30)

        proj = body["projection"]
        self.assertIsNotNone(proj["days_to_out"])
        self.assertLessEqual(proj["days_to_out"], 14)
        self.assertGreater(proj["daily_burn"], 0)

    # ── PATCH threshold → board reshuffles + MonitoringRule synced ──

    def test_threshold_patch_moves_card_to_healthy_and_syncs_rule(self):
        # Sanity: critical product currently in CRITICAL column.
        before = self.client.get("/api/v1/restock/board/").json()
        crit_skus = [c["sku"] for c in before["columns"]["CRITICAL"]["products"]]
        self.assertIn("CRIT-1", crit_skus)

        # Drop reorder + critical thresholds so qty=1 lands in HEALTHY.
        patch_resp = self.client.patch(
            f"/api/v1/product-models/{self.critical.id}/",
            {"reorder_threshold": "1", "critical_threshold": None},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, 200)

        self.critical.refresh_from_db()
        self.assertEqual(self.critical.reorder_threshold, Decimal("1"))
        self.assertIsNone(self.critical.critical_threshold)

        # Signal mirrored the change into a MonitoringRule.
        rule = MonitoringRule.objects.filter(
            product_model=self.critical,
            name=RestockService.SYNCED_RULE_NAME,
        ).first()
        self.assertIsNotNone(rule)
        self.assertEqual(rule.trigger_type, "THRESHOLD")
        self.assertEqual(rule.condition_config.get("min"), 1.0)

        after = self.client.get("/api/v1/restock/board/").json()
        healthy_skus = [c["sku"] for c in after["columns"]["HEALTHY"]["products"]]
        crit_skus_after = [c["sku"] for c in after["columns"]["CRITICAL"]["products"]]
        self.assertIn("CRIT-1", healthy_skus)
        self.assertNotIn("CRIT-1", crit_skus_after)

    # ── Cross-tenant isolation ──────────────────────────────────────

    def test_other_company_products_absent_from_board(self):
        body = self.client.get("/api/v1/restock/board/").json()
        skus = [card["sku"] for col in body["columns"].values() for card in col["products"]]
        self.assertNotIn("FOREIGN-1", skus)
        self.assertEqual(len(skus), 5)
