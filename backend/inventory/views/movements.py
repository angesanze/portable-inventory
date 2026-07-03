from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import ProductModel, Location, Movement, EventLog, PhysicalProduct, ProductBatch
from ..serializers import MovementSerializer, EventLogSerializer
from ..services import StockService
from ..services.costing import CostingService
from ..api.base import (
    CompanyScopedMixin,
    ReadOnlyCompanyScopedViewSet,
    RoleGatedWriteMixin,
    bulk_delete_response,
    parse_bulk_delete_ids,
)
from ..exceptions import BulkDeleteError


class StockViewSet(viewsets.ViewSet):
    """Read-only ViewSet for stock calculations and levels."""

    permission_classes = [permissions.IsAuthenticated]

    def _get_company(self, request):
        """Effective company for scoping (honors developer X-Acting-Company)."""
        from core.scope import resolve_effective_company

        return resolve_effective_company(request)

    @action(detail=True, methods=["get"])
    def level(self, request, pk=None):
        """Returns total stock, breakdown, and profile-aware detail for a product model.

        Response always includes: total, breakdown, tracking_mode, profile.
        Additional fields by tracking mode:
        - BATCH: batches[] with id, batch_identifier, quantity, location, data
        - INDIVIDUAL: items[] with id, identifier, status, location
        """
        company = self._get_company(request)
        if not company:
            return Response(
                {"detail": "Authentication required."}, status=status.HTTP_403_FORBIDDEN
            )
        product = get_object_or_404(ProductModel, pk=pk, company=company)
        data = StockService.get_stock_for_model(product)
        data["tracking_mode"] = product.tracking_mode
        data["profile"] = product.profile

        from ..services.reservations import ReservationService

        reserved = ReservationService.active_reserved_qty(product)
        data["reserved"] = reserved
        data["available"] = data["total"] - reserved

        # COSTING-06: weighted-average unit cost + booked stock value.
        from ..models import ProductCost
        from decimal import Decimal as _D

        cost_state = ProductCost.objects.filter(product_model=product).first()
        avg = cost_state.avg_unit_cost if cost_state else _D("0")
        data["avg_unit_cost"] = float(avg)
        data["stock_value"] = float(_D(str(data["total"])) * avg)

        # RMA-08: stock physically held in non-sellable quarantine locations,
        # surfaced separately from the sellable total above.
        quarantine = StockService.get_quarantine_for_model(product)
        data["quarantine_total"] = quarantine["total"]
        data["quarantine_breakdown"] = quarantine["breakdown"]

        if product.tracking_mode == "BATCH":
            batches = ProductBatch.objects.filter(
                product_model=product, quantity__gt=0
            ).select_related("location")
            data["batches"] = [
                {
                    "id": str(b.id),
                    "batch_identifier": b.batch_identifier,
                    "quantity": float(b.quantity),
                    "location": b.location.name if b.location else None,
                    "data": b.data or {},
                }
                for b in batches
            ]

        elif product.tracking_mode == "INDIVIDUAL":
            items = (
                PhysicalProduct.objects.filter(
                    product_model=product,
                )
                .select_related("location")
                .order_by("-created_at")[:50]
            )
            data["items"] = [
                {
                    "id": str(i.id),
                    "identifier": i.identifier,
                    "status": i.status,
                    "location": i.location.name if i.location else None,
                }
                for i in items
            ]
            data["status_counts"] = StockService.get_tracker_status_counts(product)

        return Response(data)

    @action(detail=True, methods=["get"], url_path="location/(?P<location_id>[^/.]+)")
    def location_level(self, request, pk=None, location_id=None):
        """Returns stock level for a specific product model at a specific location."""
        company = self._get_company(request)
        if not company:
            return Response(
                {"detail": "Authentication required."}, status=status.HTTP_403_FORBIDDEN
            )
        product = get_object_or_404(ProductModel, pk=pk, company=company)
        location = get_object_or_404(Location, pk=location_id, company=company)
        qty = StockService.get_stock_for_location(product, location)
        return Response({"product": product.sku, "location": location.name, "quantity": qty})


class MovementViewSet(RoleGatedWriteMixin, CompanyScopedMixin, viewsets.ModelViewSet):
    """Handles Ledger operations and stock transfers.

    Entity resolution and validation are handled by MovementSerializer.
    Creation delegates to LedgerService via the serializer's create().

    Scoping comes from CompanyScopedMixin so the behavior matches every
    other viewset: X-Acting-Company honored for developers, all rows for a
    company-less superuser (this viewset used to hardcode user.company —
    the lone inconsistency in the scoping matrix).
    """

    serializer_class = MovementSerializer
    queryset = Movement.objects.select_related(
        "from_location", "to_location", "product_model", "supplier"
    ).order_by("-occurred_at")
    company_field = "product_model__company"
    filterset_fields = [
        "product_model",
        "physical_product",
        "batch",
        "from_location",
        "to_location",
        "work_order",
    ]
    search_fields = [
        "description",
        "product_model__sku",
        "product_model__name",
        "physical_product__identifier",
        "batch__batch_identifier",
        "from_location__name",
        "to_location__name",
    ]
    ordering_fields = ["occurred_at", "quantity"]

    def get_serializer_class(self):
        """Uses a read-enriched serializer for listing."""
        if self.action in ["list", "retrieve"]:
            from ..serializers import MovementReadSerializer

            return MovementReadSerializer
        return MovementSerializer

    def perform_create(self, serializer):
        """Delegates to serializer.create() which calls LedgerService."""
        serializer.save()

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Bulk-delete Movements. Terminal — no preserve_movements flag.

        These rows ARE the audit history. Body: {ids}.
        """
        try:
            ids = parse_bulk_delete_ids(request.data.get("ids"))
        except BulkDeleteError as exc:
            return Response({"detail": str(exc.detail)}, status=exc.status_code)

        company = self.get_effective_company()
        if company is None:
            return Response(
                {"detail": "Authentication required."}, status=status.HTTP_403_FORBIDDEN
            )

        scoped_ids = list(
            Movement.objects.filter(id__in=ids, product_model__company=company).values_list(
                "id", flat=True
            )
        )
        if not scoped_ids:
            return bulk_delete_response(deleted=0, preserved_movements=0)

        # BULK stock and weighted-average costing are DERIVED from these rows, so
        # deleting them silently rewrites both. Capture the affected products,
        # then replay each one's remaining ledger to keep ProductCost consistent
        # and re-stamp frozen COGS (COR-14). The delete itself is an intentional,
        # OWNER/ADMIN-gated correction tool; the recompute stops costing drift.
        affected_product_ids = set(
            Movement.objects.filter(id__in=scoped_ids)
            .exclude(product_model__isnull=True)
            .values_list("product_model_id", flat=True)
        )

        with transaction.atomic():
            Movement.objects.filter(id__in=scoped_ids).delete()
            for product in ProductModel.objects.filter(id__in=affected_product_ids):
                CostingService.rebuild_for_product(product)

        return bulk_delete_response(deleted=len(scoped_ids), preserved_movements=0)


class EventLogViewSet(ReadOnlyCompanyScopedViewSet):
    """ViewSet for product-level event logs (e.g., check-ins, monitoring alerts).

    Read-only: event logs are immutable audit records created by the system,
    not via the API.
    """

    serializer_class = EventLogSerializer
    queryset = EventLog.objects.select_related("product").order_by("-created_at")
    company_field = "product__company"
