from django.db import transaction
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import WorkOrder, ProductBatch, PhysicalProduct, Movement
from ..serializers import WorkOrderSerializer, WorkOrderListSerializer, ProductBatchSerializer
from ..api.base import CompanyScopedViewSet, bulk_delete_response, parse_bulk_delete_ids
from ..api.public.auth import ApiKeyAuthMixin
from ..api.public.throttling import WidgetAPIThrottle, WidgetAPIBurstThrottle
from ..exceptions import BulkDeleteError, InventoryError
from ..services import WorkOrderFulfillmentService


class WorkOrderViewSet(CompanyScopedViewSet):
    """
    ViewSet for WorkOrder (Batches/Kits) management.
    """

    queryset = WorkOrder.objects.all().select_related("product_model", "company")
    serializer_class = WorkOrderSerializer
    filterset_fields = ["status", "product_model"]
    search_fields = ["name", "description", "id"]
    ordering_fields = ["name", "status", "created_at"]

    def get_serializer_class(self):
        """Toggle between detail and list serializers."""
        if self.action == "list":
            return WorkOrderListSerializer
        return WorkOrderSerializer

    def get_queryset(self):
        """Optimize WorkOrder queryset with prefetches for detail views."""
        queryset = super().get_queryset()
        if self.action != "list":
            queryset = queryset.prefetch_related(
                "batches__product_model",
                "physical_products__product_model",
            )
        return queryset

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Bulk-delete WorkOrders.

        Opt-in cascade. By default (``cascade=False``) only the WorkOrder
        rows are deleted: ``ProductBatch.work_order`` / ``PhysicalProduct.work_order``
        / ``Movement.work_order`` are all ``SET_NULL``, so the assigned
        children survive with their WO link cleared.

        Pass ``cascade=true`` to also nuke the assigned ProductBatches and
        PhysicalProducts. Their PROTECT-ed Movement back-references are
        nulled when ``preserve_movements=true`` (default) or deleted when
        ``preserve_movements=false``.
        """
        try:
            ids = parse_bulk_delete_ids(request.data.get("ids"))
        except BulkDeleteError as exc:
            return Response({"detail": str(exc.detail)}, status=exc.status_code)

        cascade = bool(request.data.get("cascade", False))
        preserve_movements = request.data.get("preserve_movements", True)
        company = self.get_effective_company()
        qs = WorkOrder.objects.filter(id__in=ids)
        if company is not None:
            qs = qs.filter(company=company)
        scoped_ids = list(qs.values_list("id", flat=True))
        if not scoped_ids:
            return bulk_delete_response(deleted=0, preserved_movements=0)

        preserved = 0
        with transaction.atomic():
            if cascade:
                batch_ids = list(
                    ProductBatch.objects.filter(work_order_id__in=scoped_ids).values_list(
                        "id", flat=True
                    )
                )
                pp_ids = list(
                    PhysicalProduct.objects.filter(work_order_id__in=scoped_ids).values_list(
                        "id", flat=True
                    )
                )
                if preserve_movements:
                    if pp_ids:
                        preserved += Movement.objects.filter(
                            physical_product_id__in=pp_ids,
                        ).update(physical_product=None)
                    if batch_ids:
                        preserved += Movement.objects.filter(
                            batch_id__in=batch_ids,
                        ).update(batch=None)
                else:
                    if pp_ids:
                        Movement.objects.filter(physical_product_id__in=pp_ids).delete()
                    if batch_ids:
                        Movement.objects.filter(batch_id__in=batch_ids).delete()

                if pp_ids:
                    PhysicalProduct.objects.filter(id__in=pp_ids).delete()
                if batch_ids:
                    ProductBatch.objects.filter(id__in=batch_ids).delete()

            WorkOrder.objects.filter(id__in=scoped_ids).delete()

        return bulk_delete_response(deleted=len(scoped_ids), preserved_movements=preserved)

    @action(detail=True, methods=["get"])
    def contents(self, request, pk=None):
        """
        Returns all inventory currently assigned to this Batch/Kit.
        Aggregation across both Batches and Physical Items.
        """
        work_order = self.get_object()

        result = []

        # 1. Aggregate Batches
        batches = ProductBatch.objects.filter(work_order=work_order, quantity__gt=0).select_related(
            "product_model"
        )
        for b in batches:
            # Determine type based on engine
            item_type = "BATCH"
            if b.product_model.engine_type == "counter":
                item_type = "BULK"
            elif b.product_model.engine_type == "bucket":
                item_type = "BATCH"

            result.append(
                {
                    "type": item_type,
                    "product_id": str(b.product_model.id),
                    "product_name": b.product_model.name,
                    "sku": b.product_model.sku,
                    "quantity": float(b.quantity),
                    "batch_id": str(b.id),
                    "batch_identifier": b.batch_identifier,
                    "meta": b.data,
                }
            )

        # 2. Aggregate Physical Products
        items = PhysicalProduct.objects.filter(
            work_order=work_order, status="ACTIVE"
        ).select_related("product_model")
        for i in items:
            result.append(
                {
                    "type": "SERIAL",
                    "product_id": str(i.product_model.id),
                    "product_name": i.product_model.name,
                    "sku": i.product_model.sku,
                    "quantity": 1,
                    "identifier": i.identifier,
                    "item_id": str(i.id),
                }
            )

        return Response(result)

    @action(detail=True, methods=["post"])
    def fulfill(self, request, pk=None):
        """
        Discharge the entire contents of this WorkOrder to the External
        location in one atomic operation, then close it ("Evadi ordine").
        """
        work_order = self.get_object()
        try:
            result = WorkOrderFulfillmentService.fulfill(work_order, user=request.user)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(result)


class ProductBatchViewSet(ApiKeyAuthMixin, viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for batch-level inventory (ProductBatch).
    Supports both JWT and API-Key based authentication for external/widget access.
    Auth delegated to ApiKeyAuthMixin which enforces expiry, domain, and permission checks.

    SEC-02: this is intentionally read-only. ``_validate_api_key`` only runs in
    ``get_queryset`` (the read path), so a writable ModelViewSet would expose an
    unauthenticated ``create`` that also bypasses the ``LedgerService`` choke
    point. All batch writes must go through the ledger (widget transaction,
    purchasing receive, onboarding, etc.), never a direct REST write here.
    """

    serializer_class = ProductBatchSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [WidgetAPIThrottle, WidgetAPIBurstThrottle]

    def get_queryset(self):
        auth = self._validate_api_key(self.request)
        company = auth.company

        if not company:
            return ProductBatch.objects.none()

        queryset = ProductBatch.objects.filter(product_model__company=company).select_related(
            "product_model", "location", "work_order"
        )

        # Additional Filters
        product_model_id = self.request.query_params.get("product_model")
        location_id = self.request.query_params.get("location")

        if product_model_id:
            queryset = queryset.filter(product_model_id=product_model_id)
        if location_id:
            queryset = queryset.filter(location_id=location_id)

        return queryset
