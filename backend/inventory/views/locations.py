from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Location, Movement, ProductBatch
from ..serializers import LocationSerializer
from ..api.base import CompanyScopedViewSet, bulk_delete_response, parse_bulk_delete_ids
from ..exceptions import BulkDeleteError


class LocationViewSet(CompanyScopedViewSet):
    """
    ViewSet for Location management.
    Handles hierarchy and company-scoped lookups.
    """

    queryset = Location.objects.all().select_related("parent", "company")
    serializer_class = LocationSerializer
    filterset_fields = ["type", "parent"]
    search_fields = ["name"]
    ordering_fields = ["name", "type"]

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Bulk-delete Locations. Body: {ids, preserve_movements?}.

        Movement.from_location / to_location are non-null PROTECT, so the
        default `preserve_movements=true` path REJECTS the delete if any
        active Movement still references one of the locations. The caller
        must pass `preserve_movements=false` to cascade-delete Movements
        and clean up. No silent data loss.
        """
        try:
            ids = parse_bulk_delete_ids(request.data.get("ids"))
        except BulkDeleteError as exc:
            return Response({"detail": str(exc.detail)}, status=exc.status_code)

        preserve_movements = request.data.get("preserve_movements", True)
        company = self.get_effective_company()
        qs = Location.objects.filter(id__in=ids)
        if company is not None:
            qs = qs.filter(company=company)
        scoped_ids = list(qs.values_list("id", flat=True))
        if not scoped_ids:
            return bulk_delete_response(deleted=0, preserved_movements=0)

        location_filter = Q(from_location_id__in=scoped_ids) | Q(to_location_id__in=scoped_ids)
        movement_count = Movement.objects.filter(location_filter).count()

        if preserve_movements and movement_count:
            return Response(
                {
                    "detail": (
                        f"Cannot preserve movements while deleting these "
                        f"locations: {movement_count} active movement(s) "
                        f"reference them. Re-submit with preserve_movements=false "
                        f"to also delete the movement history."
                    ),
                    "movement_count": movement_count,
                },
                status=status.HTTP_409_CONFLICT,
            )

        preserved = 0
        with transaction.atomic():
            if not preserve_movements and movement_count:
                # Null Movement.batch on movements pointing at batches that
                # will cascade-delete when their location is dropped, so the
                # PROTECT FK on Movement.batch doesn't block.
                affected_batch_ids = list(
                    ProductBatch.objects.filter(location_id__in=scoped_ids).values_list(
                        "id", flat=True
                    )
                )
                if affected_batch_ids:
                    Movement.objects.filter(batch_id__in=affected_batch_ids).update(batch=None)
                Movement.objects.filter(location_filter).delete()

            Location.objects.filter(id__in=scoped_ids).delete()

        return bulk_delete_response(deleted=len(scoped_ids), preserved_movements=preserved)
