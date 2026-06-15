import uuid
from decimal import Decimal
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from core.models import Company, User
from .core import ProductModel, Location
from .tracking import ProductBatch, PhysicalProduct


class Reservation(models.Model):
    """Stock committed to a purpose (order, customer, job) but still on hand.

    Available stock = physical stock − ACTIVE reservations. Reservations
    never move stock themselves: consuming one happens through the Movement
    that fulfils it (LedgerService), which flips the status to CONSUMED.
    """

    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('CONSUMED', 'Consumed'),
        ('RELEASED', 'Released'),
        ('EXPIRED', 'Expired'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='reservations')
    product_model = models.ForeignKey(ProductModel, on_delete=models.CASCADE, related_name='reservations')
    # Null location = company-wide reservation (counts against every location's availability? No —
    # against the model total; per-location checks only subtract location-bound reservations plus
    # the unallocated company-wide ones. See ReservationService.active_reserved_qty.)
    location = models.ForeignKey(Location, null=True, blank=True, on_delete=models.CASCADE, related_name='reservations')
    batch = models.ForeignKey(ProductBatch, null=True, blank=True, on_delete=models.CASCADE, related_name='reservations')
    physical_product = models.ForeignKey(PhysicalProduct, null=True, blank=True, on_delete=models.CASCADE, related_name='reservations')

    # Sales-order line this reservation backs (SALES-ORDERS-04). SET_NULL: the
    # reservation outlives a deleted order line. String ref to avoid a circular
    # import (sales.py imports nothing from reservations.py).
    sales_order_line = models.ForeignKey(
        'inventory.SalesOrderLine', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='reservations',
    )

    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    reference = models.CharField(max_length=255, blank=True, help_text="Free-text purpose (order number, customer, job).")
    expires_at = models.DateTimeField(null=True, blank=True, help_text="Auto-release after this moment.")

    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='reservations')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['product_model', 'status']),
            models.Index(fields=['location', 'status']),
            models.Index(fields=['company', 'status']),
        ]
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.quantity is None or self.quantity <= 0:
            raise ValidationError({'quantity': "Reservation quantity must be positive."})

        company_id = self.company_id
        if self.product_model and self.product_model.company_id != company_id:
            raise ValidationError({'product_model': "product_model belongs to a different company."})
        if self.location and self.location.company_id != company_id:
            raise ValidationError({'location': "location belongs to a different company."})
        if self.batch and self.batch.product_model.company_id != company_id:
            raise ValidationError({'batch': "batch belongs to a different company."})
        if self.physical_product:
            if self.physical_product.product_model.company_id != company_id:
                raise ValidationError({'physical_product': "physical_product belongs to a different company."})
            if self.quantity != Decimal('1'):
                raise ValidationError({'quantity': "Serialized reservations are one item at a time."})
        if self.product_model and self.product_model.tracking_mode == 'INDIVIDUAL' and not self.physical_product:
            raise ValidationError({'physical_product': "Serialized products are reserved per physical item."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return self.expires_at is not None and self.expires_at <= timezone.now()

    def __str__(self):
        return f"Reservation {self.quantity}× {self.product_model.sku} [{self.status}]"
