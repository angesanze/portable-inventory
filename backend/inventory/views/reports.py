"""Valuation & COGS reporting endpoints (COSTING-06).

Both endpoints are read-only and company-scoped. They read the materialized
weighted-average cost (`ProductCost`) and the immutable ledger:

  * ``valuation/`` — total booked stock value and per-product / per-location
    breakdown (qty at a location × that product's running average cost).
  * ``cogs/`` — sum of ``cogs_unit_cost × quantity`` over OUTBOUND movements in
    a date range, grouped by product. Uses the *frozen* per-movement cost so
    historical totals do not move when the average does.

No point-in-time valuation in v1 (would need cost snapshots — see notes).
"""
from decimal import Decimal

from django.db.models import Sum
from django.utils.dateparse import parse_date
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..api.base import CompanyScopedMixin
from ..models import Location, Movement, ProductCost, ProductModel
from ..services import StockService

ZERO = Decimal('0')


class ReportsViewSet(CompanyScopedMixin, viewsets.ViewSet):
    """Read-only valuation & COGS reports, scoped to the effective company."""
    permission_classes = [permissions.IsAuthenticated]
    # CompanyScopedMixin.get_effective_company is used directly; no queryset.

    def _company_or_403(self):
        company = self.get_effective_company()
        return company

    @action(detail=False, methods=['get'])
    def valuation(self, request):
        """Total booked stock value + breakdown by product and by location.

        Per product: total on-hand × running average cost.
        Per location: Σ over products of (qty at location × product avg cost).
        """
        company = self._company_or_403()
        if company is None:
            return Response({"detail": "Authentication required."}, status=403)

        cost_map = {
            pc.product_model_id: pc.avg_unit_cost
            for pc in ProductCost.objects.filter(product_model__company=company)
        }

        products = ProductModel.objects.filter(company=company)
        per_product = []
        per_location = {}
        total_value = ZERO

        locations = list(
            Location.objects.filter(company=company).exclude(type__in=['VIRTUAL', 'LOSS'])
        )
        loc_by_name = {loc.name: str(loc.id) for loc in locations}

        for product in products:
            avg = cost_map.get(product.id, ZERO)
            stock = StockService.get_stock_for_model(product)
            total_qty = Decimal(str(stock['total']))
            value = total_qty * avg
            if total_qty != 0 or value != 0:
                per_product.append({
                    "product_id": str(product.id),
                    "sku": product.sku,
                    "name": product.name,
                    "quantity": float(total_qty),
                    "avg_unit_cost": float(avg),
                    "stock_value": float(value),
                })
            total_value += value

            # Per-location: distribute the product's average over its breakdown.
            for loc_name, qty in stock.get('breakdown', {}).items():
                qd = Decimal(str(qty))
                entry = per_location.setdefault(loc_name, {
                    "location_id": loc_by_name.get(loc_name),
                    "location": loc_name,
                    "stock_value": ZERO,
                })
                entry["stock_value"] += qd * avg

        location_rows = [
            {
                "location_id": v["location_id"],
                "location": v["location"],
                "stock_value": float(v["stock_value"]),
            }
            for v in per_location.values()
        ]
        location_rows.sort(key=lambda r: r["location"])
        per_product.sort(key=lambda r: r["sku"])

        return Response({
            "total_value": float(total_value),
            "by_product": per_product,
            "by_location": location_rows,
        })

    @action(detail=False, methods=['get'])
    def cogs(self, request):
        """Cost of goods sold over a date range, grouped by product.

        COGS = Σ (cogs_unit_cost × quantity) over OUTBOUND movements
        (to a VIRTUAL/LOSS sink) whose ``occurred_at`` falls in [from, to].
        Query params ``from`` and ``to`` are ISO dates (inclusive).
        """
        company = self._company_or_403()
        if company is None:
            return Response({"detail": "Authentication required."}, status=403)

        qs = Movement.objects.filter(
            product_model__company=company,
            cogs_unit_cost__isnull=False,
            to_location__type__in=['VIRTUAL', 'LOSS'],
        ).select_related('product_model')

        date_from = request.query_params.get('from')
        date_to = request.query_params.get('to')
        if date_from:
            d = parse_date(date_from)
            if d:
                qs = qs.filter(occurred_at__date__gte=d)
        if date_to:
            d = parse_date(date_to)
            if d:
                qs = qs.filter(occurred_at__date__lte=d)

        per_product = {}
        total_cogs = ZERO
        total_qty = ZERO
        for mv in qs:
            line_cogs = (mv.cogs_unit_cost or ZERO) * Decimal(mv.quantity)
            total_cogs += line_cogs
            total_qty += Decimal(mv.quantity)
            pid = mv.product_model_id
            label = mv.product_label or (
                f"{mv.product_model.sku} - {mv.product_model.name}"
                if mv.product_model else "orphaned"
            )
            sku = mv.product_model.sku if mv.product_model else (mv.product_label or "")
            entry = per_product.setdefault(str(pid), {
                "product_id": str(pid) if pid else None,
                "sku": sku,
                "name": label,
                "quantity": ZERO,
                "cogs": ZERO,
            })
            entry["quantity"] += Decimal(mv.quantity)
            entry["cogs"] += line_cogs

        rows = [
            {
                "product_id": v["product_id"],
                "sku": v["sku"],
                "name": v["name"],
                "quantity": float(v["quantity"]),
                "cogs": float(v["cogs"]),
            }
            for v in per_product.values()
        ]
        rows.sort(key=lambda r: r["sku"])

        return Response({
            "from": date_from,
            "to": date_to,
            "total_cogs": float(total_cogs),
            "total_quantity": float(total_qty),
            "by_product": rows,
        })
