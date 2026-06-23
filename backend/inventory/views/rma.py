from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from .. import constants
from ..api.base import CompanyScopedViewSet
from ..exceptions import InventoryError
from ..models import Location, ReturnOrder, ReturnOrderLine, Supplier
from ..serializers.rma import ReturnOrderSerializer
from ..services.rma import RmaService


class ReturnOrderViewSet(CompanyScopedViewSet):
    """CRUD + lifecycle for returns / RMA (RMA-08).

    Writes (update/delete) are limited to OPEN; status only moves through the
    ``receive``, ``resolve``, ``ship`` and ``cancel`` actions.
    """
    queryset = ReturnOrder.objects.select_related(
        'customer', 'supplier', 'sales_order', 'purchase_order', 'created_by',
    ).prefetch_related('lines__product_model', 'lines__physical_product')
    serializer_class = ReturnOrderSerializer
    filterset_fields = ['status', 'kind', 'customer', 'supplier']
    search_fields = ['number', 'customer__name', 'supplier__name']
    ordering_fields = ['number', 'created_at']
    ordering = ['-created_at']

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != constants.RMA_STATUS_OPEN:
            return Response(
                {"detail": "Only OPEN returns can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != constants.RMA_STATUS_OPEN:
            return Response(
                {"detail": "Only OPEN returns can be deleted. Cancel the return instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Receive a customer return into quarantine. OPEN → RECEIVED."""
        rma = self.get_object()
        try:
            rma = RmaService.receive(
                rma, user=request.user if request.user.is_authenticated else None,
            )
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(rma).data)

    @action(detail=True, methods=['post'])
    def ship(self, request, pk=None):
        """Ship a supplier return out to the vendor. Body: {location_id?}."""
        rma = self.get_object()
        location = None
        location_id = request.data.get('location_id')
        if location_id:
            try:
                location = Location.objects.get(id=location_id, company=rma.company)
            except (Location.DoesNotExist, ValueError):
                return Response({"detail": "Location not found."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rma = RmaService.ship_supplier_return(
                rma, user=request.user if request.user.is_authenticated else None,
                location=location,
            )
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(rma).data)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Resolve one or more received lines.

        Body: {resolutions: [{line_id, resolution, location_id?, supplier_id?}]}.
        ``supplier_id`` attributes a RETURN_TO_SUPPLIER outbound.
        """
        rma = self.get_object()
        resolutions = request.data.get('resolutions')
        if not isinstance(resolutions, list) or not resolutions:
            return Response(
                {"detail": "resolutions must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user if request.user.is_authenticated else None

        # Phase 1 — resolve & validate every referenced object up front, before
        # mutating anything. A bad line/location/supplier returns 4xx here while
        # the ledger is still untouched, so there is nothing to roll back.
        prepared = []
        for entry in resolutions:
            line_id = entry.get('line_id')
            resolution = entry.get('resolution')
            location = None
            loc_id = entry.get('location_id')
            if loc_id:
                try:
                    location = Location.objects.get(id=loc_id, company=rma.company)
                except (Location.DoesNotExist, ValueError):
                    return Response({"detail": "Location not found."}, status=status.HTTP_400_BAD_REQUEST)
            supplier = None
            sup_id = entry.get('supplier_id')
            if sup_id:
                try:
                    supplier = Supplier.objects.get(id=sup_id, company=rma.company)
                except (Supplier.DoesNotExist, ValueError):
                    return Response({"detail": "Supplier not found."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                line = ReturnOrderLine.objects.get(id=line_id, return_order=rma)
            except (ReturnOrderLine.DoesNotExist, ValueError, TypeError):
                return Response(
                    {"detail": f"Line {line_id} not found on {rma.number}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            prepared.append((line, resolution, location, supplier))

        # Phase 2 — apply every line in one transaction. A mid-loop failure
        # rolls back the lines already processed in this request, so a 4xx never
        # leaves a partially-resolved RMA (mirrors SalesService.ship /
        # PurchasingService.receive).
        try:
            with transaction.atomic():
                for line, resolution, location, supplier in prepared:
                    RmaService.resolve_line(line, resolution, user, location=location, supplier=supplier)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        rma.refresh_from_db()
        return Response(self.get_serializer(rma).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        rma = self.get_object()
        try:
            rma = RmaService.cancel(rma)
        except InventoryError as e:
            return Response({"detail": str(e.detail)}, status=e.status_code)
        return Response(self.get_serializer(rma).data)
