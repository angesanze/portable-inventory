from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import ProtectedError

from ..models import ProductModel, PhysicalProduct, ProductBatch, Supplier, Movement
from ..serializers import (
    ProductModelSerializer,
    ProductModelListSerializer,
    PhysicalProductSerializer,
)
from ..services import StockService, ProductService
from ..engines import EngineFactory
from ..api.base import CompanyScopedViewSet, bulk_delete_response, parse_bulk_delete_ids
from ..exceptions import BulkDeleteError
import logging

logger = logging.getLogger(__name__)


def _resolve_display_unit(product):
    """Return a short trailing unit string for a product, or None.

    Mirrors `BaseEngine.get_display_unit`. Counter engines surface their
    `input_label`; other engines return None.
    """
    try:
        return EngineFactory.get_engine_for_profile(product).get_display_unit()
    except Exception as exc:
        logger.warning("Could not resolve display unit for product %s: %s", product.pk, exc)
        return None


class ProductModelViewSet(CompanyScopedViewSet):
    """
    ViewSet for ProductModel management.
    Handles CRUD operations with automatic company scoping.
    """

    queryset = ProductModel.objects.all().select_related("default_calculator", "company")
    serializer_class = ProductModelSerializer
    filterset_fields = ["profile", "default_calculator"]
    search_fields = ["name", "sku", "barcode"]
    ordering_fields = ["name", "sku", "created_at"]

    def get_serializer_class(self):
        """Toggle between detail and list serializers."""
        if self.action == "list":
            return ProductModelListSerializer
        return ProductModelSerializer

    def get_queryset(self):
        """Override to add prefetches for detail views."""
        queryset = super().get_queryset()

        # Prefetch components for detail views
        if self.action != "list":
            queryset = queryset.prefetch_related("components__child")

        return queryset

    def destroy(self, request, *args, **kwargs):
        """Delete a product model, preserving its audit ledger.

        Mirrors ``bulk_delete``'s default (preserve_movements=True): Movement
        rows are kept with their product_model / physical_product / batch FKs
        nulled, rather than cascade-deleted. This keeps the immutable audit
        trail intact on single delete just as it is on bulk delete.
        """
        try:
            instance = self.get_object()

            with transaction.atomic():
                pp_ids = list(
                    PhysicalProduct.objects.filter(product_model=instance).values_list(
                        "id", flat=True
                    )
                )
                batch_ids = list(
                    ProductBatch.objects.filter(product_model=instance).values_list("id", flat=True)
                )
                if pp_ids:
                    Movement.objects.filter(physical_product_id__in=pp_ids).update(
                        physical_product=None
                    )
                if batch_ids:
                    Movement.objects.filter(batch_id__in=batch_ids).update(batch=None)
                Movement.objects.filter(product_model=instance).update(product_model=None)
                return super().destroy(request, *args, **kwargs)
        except ProtectedError as e:
            protected_objects = list(e.args[1])
            count = len(protected_objects)
            first_obj = protected_objects[0]
            model_name = first_obj._meta.verbose_name_plural.title()

            error_message = (
                f"Cannot delete this product because it is referenced by {count} {model_name}."
            )
            details = f"Example dependency: {str(first_obj)}"

            return Response(
                {"detail": error_message, "details": details}, status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Bulk-delete ProductModels. Body: {ids: [...], preserve_movements?: bool}.

        Tenant-scoped: any id not owned by the effective company is silently
        skipped. Atomic. Returns {deleted, preserved_movements}.

        preserve_movements=true (default): Movement rows are kept, their
        product_model FK set to NULL (Movement.product_model is SET_NULL).
        preserve_movements=false: Movements + dependent rows are deleted.
        """
        try:
            ids = parse_bulk_delete_ids(request.data.get("ids"))
        except BulkDeleteError as exc:
            return Response({"detail": str(exc.detail)}, status=exc.status_code)

        preserve_movements = request.data.get("preserve_movements", True)
        company = self.get_effective_company()
        qs = ProductModel.objects.filter(id__in=ids)
        if company is not None:
            qs = qs.filter(company=company)
        scoped_ids = list(qs.values_list("id", flat=True))
        if not scoped_ids:
            return bulk_delete_response(deleted=0, preserved_movements=0)

        pp_ids = list(
            PhysicalProduct.objects.filter(product_model_id__in=scoped_ids).values_list(
                "id", flat=True
            )
        )
        batch_ids = list(
            ProductBatch.objects.filter(product_model_id__in=scoped_ids).values_list(
                "id", flat=True
            )
        )

        preserved = 0
        with transaction.atomic():
            if preserve_movements:
                # Null Movement FKs that PROTECT against the children that
                # cascade-delete with the product. Then null the direct FK.
                if pp_ids:
                    Movement.objects.filter(physical_product_id__in=pp_ids).update(
                        physical_product=None
                    )
                if batch_ids:
                    Movement.objects.filter(batch_id__in=batch_ids).update(batch=None)
                preserved = Movement.objects.filter(product_model_id__in=scoped_ids).update(
                    product_model=None
                )
            else:
                Movement.objects.filter(product_model_id__in=scoped_ids).delete()

            deleted, _ = ProductModel.objects.filter(id__in=scoped_ids).delete()

        return bulk_delete_response(deleted=len(scoped_ids), preserved_movements=preserved)

    def create(self, request, *args, **kwargs):
        """
        Creates a new product model.
        """
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        """Handles initial stock balance onboarding during product creation.

        The three-branch booking logic (BATCH/PERISHABLE, SERIALIZED, BULK) is
        shared with the catalogue importer via
        `inventory.services.onboarding.onboard_initial_stock` — this view just
        captures the write-only onboarding payload and delegates.
        """
        from django.db import transaction
        from .. import constants as _constants  # noqa: F401 (kept for parity)
        from ..services.onboarding import onboard_initial_stock

        user = self.request.user
        company = self.get_effective_company()

        # License quota (GOVERNANCE-11): reject when the company is already at
        # its max_products cap. Checked only here, at create time. Superusers
        # and null caps bypass.
        from core.license_limits import check_product_limit

        check_product_limit(company, user=user)

        # Capture write-only onboarding fields BEFORE save — serializer.create()
        # pops them out of validated_data.
        loc_id = serializer.validated_data.get("initial_location_id")
        supplier_id = serializer.validated_data.get("initial_supplier_id")
        initial_batch = serializer.validated_data.get("initial_batch")
        initial_serials = serializer.validated_data.get("initial_serials")
        # DIMENSIONAL: per-dimension values accepted for forward-compat but not
        # persisted today (Movement has no metadata column).
        initial_dimensions = serializer.validated_data.get("initial_dimensions")
        if initial_dimensions:
            logger.info(
                "initial_dimensions received but not persisted (no Movement.metadata): %s",
                initial_dimensions,
            )

        with transaction.atomic():
            # Save with company (via super())
            super().perform_create(serializer)
            product = serializer.instance

            supplier = None
            if supplier_id:
                supplier = Supplier.objects.filter(id=supplier_id, company=company).first()

            initial_balance = serializer.validated_data.get("initial_balance")

            # onboard_initial_stock raises InventoryError on bad inputs. Re-key
            # it onto the relevant write-only onboarding field so the API keeps
            # returning field-scoped validation errors (e.g. {'initial_serials': ...}).
            from rest_framework.exceptions import ValidationError as DRFValidationError
            from ..exceptions import InventoryError

            if initial_batch:
                field = "initial_batch"
            elif initial_serials:
                field = "initial_serials"
            else:
                field = "initial_balance"
            try:
                onboard_initial_stock(
                    product=product,
                    user=user,
                    company=company,
                    location_id=loc_id,
                    supplier=supplier,
                    initial_balance=initial_balance,
                    initial_batch=initial_batch,
                    initial_serials=initial_serials,
                )
            except InventoryError as exc:
                raise DRFValidationError({field: str(exc.detail)})


class PhysicalProductViewSet(CompanyScopedViewSet):
    """
    ViewSet for individual serialized items.
    Filters by ACTIVE status and company via product_model relationship.
    """

    queryset = PhysicalProduct.objects.all()
    serializer_class = PhysicalProductSerializer
    company_field = "product_model__company"
    filterset_fields = ["product_model", "location", "status"]
    search_fields = ["identifier", "product_model__name", "product_model__sku"]
    ordering_fields = ["identifier", "created_at"]
    ordering = ["identifier"]

    def get_queryset(self):
        """Only show active items that are currently in stock (at a non-virtual location)."""
        return (
            super()
            .get_queryset()
            .filter(status="ACTIVE")
            .select_related("product_model", "location", "work_order")
            .exclude(location__type="VIRTUAL")
            .exclude(location__isnull=True)
        )

    def perform_create(self, serializer):
        """Save without injecting company — scoping comes from the product_model FK."""
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError

        try:
            serializer.save()
        except DjangoValidationError as e:
            raise DRFValidationError(e.message_dict if hasattr(e, "message_dict") else str(e))

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Bulk-delete PhysicalProducts. Body: {ids, preserve_movements?}."""
        try:
            ids = parse_bulk_delete_ids(request.data.get("ids"))
        except BulkDeleteError as exc:
            return Response({"detail": str(exc.detail)}, status=exc.status_code)

        preserve_movements = request.data.get("preserve_movements", True)
        company = self.get_effective_company()
        qs = PhysicalProduct.objects.filter(id__in=ids)
        if company is not None:
            qs = qs.filter(product_model__company=company)
        scoped_ids = list(qs.values_list("id", flat=True))
        if not scoped_ids:
            return bulk_delete_response(deleted=0, preserved_movements=0)

        preserved = 0
        with transaction.atomic():
            if preserve_movements:
                preserved = Movement.objects.filter(
                    physical_product_id__in=scoped_ids,
                ).update(physical_product=None)
            else:
                Movement.objects.filter(physical_product_id__in=scoped_ids).delete()
            PhysicalProduct.objects.filter(id__in=scoped_ids).delete()

        return bulk_delete_response(deleted=len(scoped_ids), preserved_movements=preserved)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        """Return up to 100 most-recent Movements attached to this item.

        Includes status-change audit rows (`quantity=0`, self-loop) and any
        regular transfers the item participated in. Caller filters or
        formats further. Bypasses the list queryset's ACTIVE filter so the
        timeline survives lifecycle transitions out of ACTIVE.
        """
        user = request.user
        company = self.get_effective_company()
        qs = PhysicalProduct.objects.filter(id=pk)
        if company is not None:
            qs = qs.filter(product_model__company=company)
        elif not (getattr(user, "is_authenticated", False) and user.is_superuser):
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        pp = qs.first()
        if pp is None:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        movements = (
            Movement.objects.filter(physical_product_id=pp.id)
            .select_related("performed_by", "from_location", "to_location")
            .order_by("-occurred_at")[:100]
        )
        results = [
            {
                "id": str(m.id),
                "occurred_at": m.occurred_at.isoformat(),
                "reason": m.reason,
                "user": (m.performed_by.username if m.performed_by else None),
                "from_location": (m.from_location.name if m.from_location else None),
                "to_location": (m.to_location.name if m.to_location else None),
                "quantity": float(m.quantity),
            }
            for m in movements
        ]
        return Response({"results": results})


class ProductsPolyViewSet(CompanyScopedViewSet):
    """
    ViewSet for 'products-poly' frontend resource.
    Returns ProductModels with enriched stock data for the polymorphic inventory view.
    Supports full CRUD operations.
    """

    queryset = ProductModel.objects.all().select_related("default_calculator", "company")
    serializer_class = ProductModelSerializer
    filterset_fields = ["profile"]
    search_fields = ["name", "sku", "barcode"]
    ordering_fields = ["name", "sku", "created_at"]

    def get_serializer_class(self):
        """Use list serializer for listing."""
        if self.action == "list":
            return ProductModelListSerializer
        return ProductModelSerializer

    def create(self, request, *args, **kwargs):
        """Custom creation logic for Polymorphic Instances."""
        from rest_framework.exceptions import PermissionDenied
        from core.license_limits import check_product_limit

        data = request.data
        name = data.get("name")
        base_model_id = data.get("product_model")

        if not name or not base_model_id:
            return Response(
                {"detail": "Name and Product Model are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Scope to the effective company (honors developer X-Acting-Company),
        # not user.company directly.
        company = self.get_effective_company()
        if company is None:
            raise PermissionDenied("Authenticated company context required.")

        check_product_limit(company, user=request.user)

        base_model = get_object_or_404(ProductModel, pk=base_model_id, company=company)

        new_instance = ProductService.clone_poly_instance(base_model, name=name, company=company)
        return Response(
            ProductModelSerializer(new_instance).data,
            status=status.HTTP_201_CREATED,
        )

    def list(self, request, *args, **kwargs):
        """List products with enriched stock data for frontend display."""
        queryset = self.filter_queryset(self.get_queryset())

        data = []
        for product in queryset:
            stock_info = StockService.get_stock_for_model(product)

            # Determine stock_value format based on engine_type
            engine_type = product.engine_type or "bulk"

            if engine_type == "bucket":
                # Return batches for bucket engine
                batches = ProductBatch.objects.filter(
                    product_model=product, quantity__gt=0
                ).select_related("location", "work_order")
                stock_value = [
                    {
                        "id": str(b.id),
                        "batch_identifier": b.batch_identifier,
                        "qty": float(b.quantity),
                        "location": b.location.name if b.location else None,
                        "work_order": b.work_order.name if b.work_order else None,
                        "work_order_id": str(b.work_order.id) if b.work_order else None,
                    }
                    for b in batches
                ]
            elif engine_type == "tracker":
                # Return physical items for tracker engine
                items = PhysicalProduct.objects.filter(
                    product_model=product, status="ACTIVE"
                ).select_related("location", "work_order")
                stock_value = [
                    {
                        "id": str(i.id),
                        "identifier": i.identifier,
                        "qty": 1,
                        "location": i.location.name if i.location else None,
                        "work_order": i.work_order.name if i.work_order else None,
                        "work_order_id": str(i.work_order.id) if i.work_order else None,
                    }
                    for i in items
                ]
            else:
                # Bulk/scalar stock
                stock_value = stock_info.get("total", 0)

            data.append(
                {
                    "id": str(product.id),
                    "name": product.name,
                    "sku": product.sku,
                    "profile": product.profile,
                    "engine_type": engine_type,
                    "tracking_mode": product.tracking_mode,
                    "stock_value": stock_value,
                    "stock_total": float(stock_info.get("total", 0)),
                    "stock_breakdown": {
                        k: float(v) for k, v in stock_info.get("breakdown", {}).items()
                    },
                    "unit": _resolve_display_unit(product),
                    "product_model": str(product.id),
                    "product_model_name": product.name,
                }
            )

        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve single product with enriched stock data."""
        instance = self.get_object()
        stock_info = StockService.get_stock_for_model(instance)
        engine_type = instance.engine_type or "bulk"

        # Build stock_value based on engine type
        if engine_type == "bucket":
            batches = ProductBatch.objects.filter(
                product_model=instance, quantity__gt=0
            ).select_related("location", "work_order")
            stock_value = [
                {
                    "id": str(b.id),
                    "batch_identifier": b.batch_identifier,
                    "qty": float(b.quantity),
                    "location": b.location.name if b.location else None,
                    "work_order": b.work_order.name if b.work_order else None,
                    "work_order_id": str(b.work_order.id) if b.work_order else None,
                }
                for b in batches
            ]
        elif engine_type == "tracker":
            items = PhysicalProduct.objects.filter(
                product_model=instance, status="ACTIVE"
            ).select_related("location", "work_order")
            stock_value = [
                {
                    "id": str(i.id),
                    "identifier": i.identifier,
                    "qty": 1,
                    "location": i.location.name if i.location else None,
                    "work_order": i.work_order.name if i.work_order else None,
                    "work_order_id": str(i.work_order.id) if i.work_order else None,
                }
                for i in items
            ]
        else:
            stock_value = stock_info.get("total", 0)

        data = {
            "id": str(instance.id),
            "name": instance.name,
            "sku": instance.sku,
            "engine_type": engine_type,
            "tracking_mode": instance.tracking_mode,
            "stock_value": stock_value,
            "unit": _resolve_display_unit(instance),
            "product_model": str(instance.id),
            "product_model_name": instance.name,
        }
        return Response(data)
