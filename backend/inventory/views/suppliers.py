from django.db import transaction
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Supplier, Movement
from ..serializers.suppliers import SupplierSerializer
from ..api.base import CompanyScopedViewSet, bulk_delete_response, parse_bulk_delete_ids
from ..exceptions import BulkDeleteError


class SupplierViewSet(CompanyScopedViewSet):
    """
    ViewSet for Supplier (fornitore) registry. Company-scoped CRUD.
    """

    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    filterset_fields = ["is_active"]
    search_fields = ["name", "vat_number", "email"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Bulk-delete Suppliers. Body: {ids, preserve_movements?}."""
        try:
            ids = parse_bulk_delete_ids(request.data.get("ids"))
        except BulkDeleteError as exc:
            return Response({"detail": str(exc.detail)}, status=exc.status_code)

        preserve_movements = request.data.get("preserve_movements", True)
        company = self.get_effective_company()
        qs = Supplier.objects.filter(id__in=ids)
        if company is not None:
            qs = qs.filter(company=company)
        scoped_ids = list(qs.values_list("id", flat=True))
        if not scoped_ids:
            return bulk_delete_response(deleted=0, preserved_movements=0)

        preserved = 0
        with transaction.atomic():
            if preserve_movements:
                preserved = Movement.objects.filter(
                    supplier_id__in=scoped_ids,
                ).update(supplier=None)
            else:
                Movement.objects.filter(supplier_id__in=scoped_ids).delete()
            Supplier.objects.filter(id__in=scoped_ids).delete()

        return bulk_delete_response(deleted=len(scoped_ids), preserved_movements=preserved)
