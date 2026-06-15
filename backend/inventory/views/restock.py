"""Restock Kanban board endpoint."""
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import LicenseNotExpired, require_capability
from core.scope import resolve_effective_company

from ..models import ProductModel
from ..services.restock import RestockService

BULK_THRESHOLD_FIELDS = (
    "reorder_threshold",
    "critical_threshold",
    "max_threshold",
    "reorder_qty",
)


class RestockBoardView(APIView):
    """GET /api/v1/restock/board/ — one-shot Kanban payload for the caller's company.

    Honors ``X-Acting-Company`` so a developer can pull the board for a child
    tenant (same precedence as the other company-scoped resources).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        company = resolve_effective_company(request)
        if company is None:
            raise PermissionDenied("Authenticated company context required.")
        return Response(RestockService.build_board(company))


class ProductSeriesView(APIView):
    """GET /api/v1/products/<uuid>/stock-series/?days=N — per-product analytics.

    Returns a daily time series (on-hand/inbound/outbound), velocity for
    7/30/90-day windows, and a projection block (current qty, daily burn,
    days-to-thresholds, suggested reorder qty). ``days`` is clamped to
    [7, 365]; the response is scoped to the caller's effective company.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        company = resolve_effective_company(request)
        if company is None:
            raise PermissionDenied("Authenticated company context required.")
        product = get_object_or_404(ProductModel, pk=pk, company=company)
        try:
            days = int(request.query_params.get("days", 90))
        except (TypeError, ValueError):
            days = 90
        days = max(7, min(days, 365))
        return Response(RestockService.product_series(product, days=days))


def _coerce_threshold(value):
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(value)


class BulkThresholdView(APIView):
    """POST /api/v1/restock/thresholds/bulk/ — update many products at once.

    Body: ``[{"id": uuid, "reorder_threshold": ..., "critical_threshold": ...,
    "max_threshold": ..., "reorder_qty": ...}, ...]``. Each item is filtered
    to the caller's effective company, so cross-tenant IDs are silently
    dropped. Gated by ``manage_thresholds`` (GOVERNANCE-11): OWNER/ADMIN may
    edit reorder thresholds; an OPERATOR/VIEWER is denied.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        require_capability("manage_thresholds"),
        LicenseNotExpired,
    ]

    def post(self, request):
        company = resolve_effective_company(request)
        if company is None:
            raise PermissionDenied("Authenticated company context required.")

        items = request.data
        if not isinstance(items, list):
            return Response(
                {"detail": "Body must be a list of threshold updates."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated = []
        for item in items:
            if not isinstance(item, dict):
                continue
            pk = item.get("id")
            if not pk:
                continue
            product = ProductModel.objects.filter(id=pk, company=company).first()
            if not product:
                continue

            try:
                for field in BULK_THRESHOLD_FIELDS:
                    if field in item:
                        setattr(product, field, _coerce_threshold(item[field]))
            except ValueError:
                return Response(
                    {"detail": f"Invalid number for product {pk}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            product.save()
            updated.append(str(product.id))

        return Response({"updated": updated})
