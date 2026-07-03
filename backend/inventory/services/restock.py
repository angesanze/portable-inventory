"""Restock Kanban board scoring service.

Buckets every ``ProductModel`` by on-hand vs. threshold into HEALTHY /
REORDER / CRITICAL / OUT / OVERSTOCK columns and attaches per-card
analytics (urgency score, 7-day velocity, days-to-runout, 14-day sparkline).
Single Movement query for the whole company avoids N+1.
"""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from ..constants import LOCATION_TYPE_LOSS, LOCATION_TYPE_VIRTUAL
from ..models import Movement, ProductModel
from .stock import StockService

# Location types whose stock is NOT counted toward on-hand total
# (matches StockService.get_stock_for_model's exclusion list).
COUNTERPARTY_TYPES = {LOCATION_TYPE_VIRTUAL, LOCATION_TYPE_LOSS}

BUCKETS = ("HEALTHY", "REORDER", "CRITICAL", "OUT", "OVERSTOCK")
NEEDS_ATTENTION_BUCKETS = {"REORDER", "CRITICAL", "OUT"}


def _resolve_threshold(product, field):
    """Prefer first-class column, fall back to legacy ``attributes['min_threshold']``."""
    raw = getattr(product, field, None)
    if raw is not None:
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None
    if (
        field == "reorder_threshold"
        and product.attributes
        and "min_threshold" in product.attributes
    ):
        try:
            return float(product.attributes["min_threshold"])
        except (TypeError, ValueError):
            return None
    return None


def _effective_critical(reorder_t, critical_t):
    if critical_t is not None:
        return critical_t
    if reorder_t is not None:
        return reorder_t / 2
    return None


def _bucket_for(qty, reorder_t, critical_t, max_t):
    critical_eff = _effective_critical(reorder_t, critical_t)
    if qty <= 0:
        return "OUT"
    if critical_eff is not None and qty < critical_eff:
        return "CRITICAL"
    if reorder_t is not None and qty < reorder_t:
        return "REORDER"
    if max_t is not None and qty > max_t:
        return "OVERSTOCK"
    return "HEALTHY"


def _urgency(bucket, qty, reorder_t, critical_t):
    critical_eff = _effective_critical(reorder_t, critical_t)
    if bucket == "OUT":
        return 1.0
    if bucket == "CRITICAL" and critical_eff:
        return max(0.0, 0.9 - (qty / critical_eff) * 0.2)
    if bucket == "REORDER" and reorder_t:
        return max(0.0, 0.5 - (qty / reorder_t) * 0.3)
    return 0.1


class RestockService:
    """Aggregates products into Kanban columns with urgency + analytics."""

    SPARKLINE_DAYS = 14
    VELOCITY_DAYS = 7

    @classmethod
    def build_board(cls, company) -> dict:
        now = timezone.now()
        cutoff = now - timedelta(days=cls.SPARKLINE_DAYS)

        products = list(
            ProductModel.objects.filter(company=company).only(
                "id",
                "sku",
                "name",
                "attributes",
                "reorder_threshold",
                "critical_threshold",
                "max_threshold",
                "profile",
            )
        )

        # ONE query for ALL movements in the 14-day window for this company.
        movements = list(
            Movement.objects.filter(
                product_model__company=company,
                occurred_at__gte=cutoff,
            )
            .select_related("from_location", "to_location")
            .only(
                "product_model_id",
                "quantity",
                "occurred_at",
                "from_location__type",
                "to_location__type",
            )
        )

        movements_by_product = defaultdict(list)
        for mv in movements:
            movements_by_product[mv.product_model_id].append(mv)

        columns = {b: {"count": 0, "products": []} for b in BUCKETS}
        needs_attention = 0

        for product in products:
            stock = StockService.get_stock_for_model(product)
            try:
                qty = float(stock.get("total", 0) or 0)
            except (TypeError, ValueError):
                qty = 0.0

            reorder_t = _resolve_threshold(product, "reorder_threshold")
            critical_t = _resolve_threshold(product, "critical_threshold")
            max_t = _resolve_threshold(product, "max_threshold")

            bucket = _bucket_for(qty, reorder_t, critical_t, max_t)
            urgency = _urgency(bucket, qty, reorder_t, critical_t)

            prod_movements = movements_by_product.get(product.id, [])
            sparkline = cls._stock_series_for(
                product,
                days=cls.SPARKLINE_DAYS,
                current_total=Decimal(str(qty)),
                movements=prod_movements,
                now=now,
            )
            velocity = cls._velocity(
                product,
                days=cls.VELOCITY_DAYS,
                movements=prod_movements,
                now=now,
            )
            days_to_runout = (qty / velocity) if velocity and velocity > 0 else None

            card = {
                "id": str(product.id),
                "sku": product.sku,
                "name": product.name,
                "qty": qty,
                "reorder_threshold": reorder_t,
                "max_threshold": max_t,
                "bucket": bucket,
                "urgency": urgency,
                "velocity_7d": velocity,
                "days_to_runout": days_to_runout,
                "sparkline": sparkline,
            }
            columns[bucket]["products"].append(card)
            columns[bucket]["count"] += 1
            if bucket in NEEDS_ATTENTION_BUCKETS:
                needs_attention += 1

        for col in columns.values():
            col["products"].sort(key=lambda c: c["urgency"], reverse=True)

        return {
            "columns": columns,
            "totals": {
                "products": len(products),
                "needs_attention": needs_attention,
            },
            "generated_at": now.isoformat(),
        }

    @classmethod
    def _stock_series_for(cls, product, days=14, current_total=None, movements=None, now=None):
        """14 daily on-hand snapshots, oldest→today.

        Walks Movement ledger backward from current total. Signed delta to
        on-hand per movement:
          + qty  when from_location is virtual/loss (inbound from counterparty),
          - qty  when to_location is virtual/loss (outbound to counterparty),
            0    when both sides are real warehouses (transfer; nets out).
        """
        full = cls._stock_series_full(
            product,
            days=days,
            current_total=current_total,
            movements=movements,
            now=now,
        )
        return [point["on_hand"] for point in full]

    @classmethod
    def _stock_series_full(cls, product, days=14, current_total=None, movements=None, now=None):
        """Like ``_stock_series_for`` but each entry carries on_hand + inbound + outbound.

        Returns list of ``{"date": "YYYY-MM-DD", "on_hand": float,
        "inbound": float, "outbound": float}``, oldest→today.
        """
        now = now or timezone.now()
        today = timezone.localtime(now).date()

        if current_total is None:
            current_total = StockService.get_stock_for_model(product).get("total", Decimal("0"))
        current = Decimal(str(current_total))

        if movements is None:
            cutoff = now - timedelta(days=days)
            movements = list(
                Movement.objects.filter(
                    product_model=product,
                    occurred_at__gte=cutoff,
                ).select_related("from_location", "to_location")
            )

        deltas = defaultdict(lambda: Decimal("0"))
        inbound_by_day = defaultdict(lambda: Decimal("0"))
        outbound_by_day = defaultdict(lambda: Decimal("0"))
        for mv in movements:
            occ_date = timezone.localtime(mv.occurred_at).date()
            delta = Decimal("0")
            if mv.from_location and mv.from_location.type in COUNTERPARTY_TYPES:
                delta += mv.quantity
                inbound_by_day[occ_date] += mv.quantity
            if mv.to_location and mv.to_location.type in COUNTERPARTY_TYPES:
                delta -= mv.quantity
                outbound_by_day[occ_date] += mv.quantity
            deltas[occ_date] += delta

        # snapshots[days-1] = today's end-of-day total; rewind one day at a time.
        series = [None] * days
        for offset in range(days):
            day = today - timedelta(days=offset)
            idx = days - 1 - offset
            series[idx] = {
                "date": day.isoformat(),
                "on_hand": float(current),
                "inbound": float(inbound_by_day.get(day, Decimal("0"))),
                "outbound": float(outbound_by_day.get(day, Decimal("0"))),
            }
            current -= deltas.get(day, Decimal("0"))

        return series

    @classmethod
    def _velocity(cls, product, days=7, movements=None, now=None) -> float:
        """Average daily outbound qty over the trailing ``days`` window."""
        now = now or timezone.now()
        cutoff = now - timedelta(days=days)

        if movements is None:
            movements = list(
                Movement.objects.filter(
                    product_model=product,
                    occurred_at__gte=cutoff,
                ).select_related("to_location")
            )

        total = Decimal("0")
        for mv in movements:
            if mv.occurred_at < cutoff:
                continue
            if mv.to_location and mv.to_location.type in COUNTERPARTY_TYPES:
                total += mv.quantity

        return float(total / Decimal(days)) if days else 0.0

    @classmethod
    def product_series(cls, product, days=90) -> dict:
        """Full per-product analytics: daily series + multi-window velocity + projection.

        Used by the Kanban drawer to show a longer trend (default 90 days) with
        inbound/outbound breakdown, multi-window burn rate, and projected
        days until the product crosses each threshold.
        """
        now = timezone.now()
        max_window = max(int(days), 90)
        cutoff = now - timedelta(days=max_window)

        movements = list(
            Movement.objects.filter(
                product_model=product,
                occurred_at__gte=cutoff,
            )
            .select_related("from_location", "to_location")
            .only(
                "quantity",
                "occurred_at",
                "from_location__type",
                "to_location__type",
            )
        )

        current_total = StockService.get_stock_for_model(product).get("total", Decimal("0"))
        try:
            current_qty = float(current_total)
        except (TypeError, ValueError):
            current_qty = 0.0

        series = cls._stock_series_full(
            product,
            days=days,
            current_total=current_total,
            movements=movements,
            now=now,
        )

        velocity = {
            "7d": cls._velocity(product, days=7, movements=movements, now=now),
            "30d": cls._velocity(product, days=30, movements=movements, now=now),
            "90d": cls._velocity(product, days=90, movements=movements, now=now),
        }

        reorder_t = _resolve_threshold(product, "reorder_threshold")
        critical_t = _resolve_threshold(product, "critical_threshold")
        max_t = _resolve_threshold(product, "max_threshold")
        critical_eff = _effective_critical(reorder_t, critical_t)
        daily_burn = velocity["30d"]

        def _days_until(threshold):
            if threshold is None or daily_burn <= 0:
                return None
            gap = current_qty - threshold
            if gap <= 0:
                return 0.0
            return gap / daily_burn

        days_to_out = (current_qty / daily_burn) if daily_burn > 0 and current_qty > 0 else None

        if max_t is not None:
            suggested = max(max_t - current_qty, 0.0)
        elif daily_burn > 0:
            suggested = daily_burn * 30.0
        else:
            suggested = None

        projection = {
            "current_qty": current_qty,
            "daily_burn": daily_burn,
            "days_to_reorder": _days_until(reorder_t),
            "days_to_critical": _days_until(critical_eff),
            "days_to_out": days_to_out,
            "suggested_reorder_qty": suggested,
        }

        return {
            "product_id": str(product.id),
            "days": int(days),
            "series": series,
            "velocity": velocity,
            "projection": projection,
        }

    SYNCED_RULE_NAME = "Restock board threshold"

    @classmethod
    def sync_threshold_rule(cls, product) -> None:
        """Mirror product threshold fields into a MonitoringRule.

        Keeps a single rule named ``SYNCED_RULE_NAME`` per product so the
        rule evaluator keeps emitting EventLogs whenever Kanban thresholds
        change. Deletes the rule when all thresholds are cleared.
        """
        from ..models import MonitoringRule

        reorder = product.reorder_threshold
        max_t = product.max_threshold
        critical = product.critical_threshold

        if reorder is None and max_t is None and critical is None:
            MonitoringRule.objects.filter(
                product_model=product,
                name=cls.SYNCED_RULE_NAME,
            ).delete()
            return

        condition = {
            "min": float(reorder) if reorder is not None else None,
            "max": float(max_t) if max_t is not None else None,
        }
        MonitoringRule.objects.update_or_create(
            product_model=product,
            name=cls.SYNCED_RULE_NAME,
            defaults={
                "trigger_type": "THRESHOLD",
                "condition_config": condition,
                "severity": "WARNING",
            },
        )
