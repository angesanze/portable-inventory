from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone

from ..models import Reservation, ProductModel
from ..exceptions import InsufficientStockError, InventoryError


class ReservationService:
    @staticmethod
    def _expire_stale(product_model):
        """Lazily flip expired ACTIVE reservations — no scheduler needed."""
        Reservation.objects.filter(
            product_model=product_model,
            status='ACTIVE',
            expires_at__isnull=False,
            expires_at__lte=timezone.now(),
        ).update(status='EXPIRED')

    @staticmethod
    def active_reserved_qty(product_model, location=None) -> Decimal:
        """Sum of ACTIVE (non-expired) reservations.

        With a location: reservations bound to that location PLUS
        company-wide ones (no location) — an unallocated promise must hold
        stock back everywhere, or two locations could both spend it.
        """
        ReservationService._expire_stale(product_model)
        qs = Reservation.objects.filter(product_model=product_model, status='ACTIVE')
        if location is not None:
            qs = qs.filter(Q(location=location) | Q(location__isnull=True))
        total = qs.aggregate(t=Sum('quantity'))['t']
        return total or Decimal('0')

    @staticmethod
    @transaction.atomic
    def reserve(product_model, quantity, user, location=None, batch=None,
                physical_product=None, reference='', expires_at=None,
                sales_order_line=None) -> Reservation:
        """Create a reservation, guaranteeing it never exceeds availability.

        Locks the ProductModel row — the same lock BulkBehavior takes — so
        reservations and transfers serialize against each other.
        """
        from .stock import StockService

        quantity = Decimal(str(quantity))
        if quantity <= 0:
            raise InventoryError(detail="Reservation quantity must be positive.")

        ProductModel.objects.select_for_update().get(pk=product_model.pk)

        if physical_product is not None:
            if physical_product.reservations.filter(status='ACTIVE').exists():
                raise InventoryError(detail=f"Item '{physical_product.identifier}' is already reserved.")
            if physical_product.status != 'ACTIVE':
                raise InventoryError(detail=f"Item '{physical_product.identifier}' is not ACTIVE.")

        if location is not None:
            physical = StockService.get_stock_for_location(product_model, location)
        else:
            physical = StockService.get_stock_for_model(product_model)['total']
        available = physical - ReservationService.active_reserved_qty(product_model, location)

        if quantity > available:
            raise InsufficientStockError(
                detail="Cannot reserve more than available stock.",
                current_stock=available,
                requested=quantity,
            )

        return Reservation.objects.create(
            company=product_model.company,
            product_model=product_model,
            location=location,
            batch=batch,
            physical_product=physical_product,
            quantity=quantity,
            reference=reference,
            expires_at=expires_at,
            created_by=user,
            sales_order_line=sales_order_line,
        )

    @staticmethod
    def release(reservation) -> None:
        if reservation.status != 'ACTIVE':
            raise InventoryError(detail=f"Only ACTIVE reservations can be released (is {reservation.status}).")
        reservation.status = 'RELEASED'
        reservation.save()

    @staticmethod
    def consume(reservation) -> None:
        """Mark a reservation fulfilled. Call from the flow that creates the
        consuming Movement (inside its transaction)."""
        if reservation.status != 'ACTIVE':
            raise InventoryError(detail=f"Only ACTIVE reservations can be consumed (is {reservation.status}).")
        reservation.status = 'CONSUMED'
        reservation.save()
