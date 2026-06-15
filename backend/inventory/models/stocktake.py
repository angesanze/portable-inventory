"""Physical stocktake: count session → variance report → ADJUSTMENT apply.

A ``CountSession`` freezes the *expected* contents of a location at
``snapshot_at`` (one ``CountLine`` per item, ``expected_qty`` immutable). The
operator records ``counted_qty`` per line; the variance report surfaces the
deltas; applying the session books each non-zero variance as an ADJUSTMENT
``Movement`` through ``LedgerService.transfer_stock`` (StocktakeService).

Lifecycle: OPEN → COUNTING → REVIEW → APPLIED (terminal) | CANCELLED. Only one
non-terminal session may exist per location at a time (``clean``). An APPLIED
session is immutable — its variance report stays consultable as the audit of
the count.
"""
import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.models import Company, User
from .core import Location, ProductModel
from .tracking import PhysicalProduct, ProductBatch

CS_STATUS_OPEN = 'OPEN'
CS_STATUS_COUNTING = 'COUNTING'
CS_STATUS_REVIEW = 'REVIEW'
CS_STATUS_APPLIED = 'APPLIED'
CS_STATUS_CANCELLED = 'CANCELLED'

CS_STATUS_CHOICES = [
    (CS_STATUS_OPEN, 'Open'),
    (CS_STATUS_COUNTING, 'Counting'),
    (CS_STATUS_REVIEW, 'Review'),
    (CS_STATUS_APPLIED, 'Applied'),
    (CS_STATUS_CANCELLED, 'Cancelled'),
]

# Statuses that hold a location "busy" — only one may exist per location.
CS_ACTIVE_STATUSES = (CS_STATUS_OPEN, CS_STATUS_COUNTING, CS_STATUS_REVIEW)


class CountSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='count_sessions')
    # PROTECT: a count is an audit document — the location it counted must
    # survive as long as the session does.
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name='count_sessions')
    status = models.CharField(max_length=20, choices=CS_STATUS_CHOICES, default=CS_STATUS_OPEN)
    # The instant the expected snapshot was taken. Movements on the location
    # after this point make the snapshot stale (warned about in the report).
    snapshot_at = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='count_sessions')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    applied_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='applied_count_sessions',
    )
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['company', 'status']),
            models.Index(fields=['location', 'status']),
        ]

    def clean(self):
        super().clean()
        if self.location_id and self.company_id and self.location.company_id != self.company_id:
            raise ValidationError({'location': "location belongs to a different company."})
        # Only one non-terminal session per location.
        if self.status in CS_ACTIVE_STATUSES and self.location_id:
            clash = CountSession.objects.filter(
                location_id=self.location_id, status__in=CS_ACTIVE_STATUSES,
            ).exclude(pk=self.pk)
            if clash.exists():
                raise ValidationError(
                    {'location': "An open count session already exists for this location."}
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def is_terminal(self) -> bool:
        return self.status in (CS_STATUS_APPLIED, CS_STATUS_CANCELLED)

    def __str__(self):
        return f"Count {self.location.name} [{self.status}]"


class CountLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(CountSession, on_delete=models.CASCADE, related_name='lines')
    product_model = models.ForeignKey(ProductModel, on_delete=models.PROTECT, related_name='count_lines')
    # BATCH lines carry the batch; SERIALIZED lines carry the physical_product.
    batch = models.ForeignKey(
        ProductBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name='count_lines',
    )
    physical_product = models.ForeignKey(
        PhysicalProduct, null=True, blank=True, on_delete=models.SET_NULL, related_name='count_lines',
    )
    # Snapshot of the expected on-hand at session open — immutable.
    expected_qty = models.DecimalField(max_digits=19, decimal_places=4, default=Decimal('0'))
    # null = not yet counted (distinct from a counted zero).
    counted_qty = models.DecimalField(max_digits=19, decimal_places=4, null=True, blank=True)

    counted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='counted_lines')
    counted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('session', 'product_model', 'batch', 'physical_product')
        ordering = ['id']

    @property
    def variance(self) -> Decimal:
        """counted − expected, or 0 when not yet counted."""
        if self.counted_qty is None:
            return Decimal('0')
        return self.counted_qty - self.expected_qty

    def __str__(self):
        return f"{self.product_model.sku}: exp {self.expected_qty} / cnt {self.counted_qty}"
