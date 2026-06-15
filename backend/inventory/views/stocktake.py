from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..api.base import CompanyScopedViewSet
from ..exceptions import InventoryError
from ..models import CountSession, Location
from ..models.stocktake import CS_STATUS_APPLIED
from ..serializers.stocktake import (
    CountSessionDetailSerializer, CountSessionSerializer,
)
from ..services.stocktake import StocktakeService


class CountSessionViewSet(CompanyScopedViewSet):
    """Stocktake sessions (STOCKTAKE-05): open → count → variance → apply.

    ``create`` opens a session (snapshots the location). Counting goes through
    ``count`` (bulk); ``variance`` is the read-only report; ``apply`` books the
    ADJUSTMENT movements; ``cancel`` voids the session. An APPLIED session is
    immutable (no update/delete).
    """
    queryset = CountSession.objects.select_related('location', 'created_by', 'applied_by')
    serializer_class = CountSessionSerializer
    filterset_fields = ['status', 'location']
    search_fields = ['location__name', 'notes']
    ordering_fields = ['created_at', 'applied_at', 'status']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action in ('retrieve', 'variance'):
            return CountSessionDetailSerializer
        return CountSessionSerializer

    def create(self, request, *args, **kwargs):
        """Open a session = snapshot a location. Body: {location_id, notes?}."""
        company = self.get_effective_company()
        if company is None:
            return Response({"detail": "A company context is required."}, status=status.HTTP_400_BAD_REQUEST)
        location_id = request.data.get('location_id')
        if not location_id:
            return Response({"detail": "location_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            location = Location.objects.get(id=location_id, company=company)
        except (Location.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Location not found."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            session = StocktakeService.open_session(
                location,
                request.user if request.user.is_authenticated else None,
                notes=request.data.get('notes', ''),
            )
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(
            CountSessionDetailSerializer(session, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == CS_STATUS_APPLIED:
            return Response({"detail": "An applied session is read-only."}, status=status.HTTP_400_BAD_REQUEST)
        # Only notes are editable on a live session.
        notes = request.data.get('notes')
        if notes is not None:
            instance.notes = notes
            instance.save(update_fields=['notes', 'updated_at'])
        return Response(self.get_serializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == CS_STATUS_APPLIED:
            return Response(
                {"detail": "An applied session is immutable. It cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def count(self, request, pk=None):
        """Bulk count. Body: {counts: [{line_id, qty}]}."""
        session = self.get_object()
        counts = request.data.get('counts')
        if not isinstance(counts, list) or not counts:
            return Response({"detail": "counts must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            StocktakeService.record_counts(
                session, counts,
                request.user if request.user.is_authenticated else None,
            )
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        session.refresh_from_db()
        return Response(CountSessionDetailSerializer(session, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['get'])
    def variance(self, request, pk=None):
        session = self.get_object()
        return Response(StocktakeService.variance_report(session))

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        session = self.get_object()
        try:
            session = StocktakeService.to_review(session)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        """Apply variances as ADJUSTMENT movements. Body: {uncounted?: 'skip'|'zero'}."""
        session = self.get_object()
        uncounted = request.data.get('uncounted', 'skip')
        try:
            result = StocktakeService.apply(
                session,
                request.user if request.user.is_authenticated else None,
                uncounted=uncounted,
            )
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(result)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        session = self.get_object()
        try:
            session = StocktakeService.cancel(session)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(session).data)
