import uuid
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from core.models import User
from .core import ProductModel, Location
from .suppliers import Supplier
from .tracking import ProductBatch, PhysicalProduct
from .composition import WorkOrder


class Movement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Nullable + SET_NULL so a ProductModel can be deleted while its audit
    # history remains. Bulk delete's `preserve_movements=true` flag relies on
    # this. Routine deletes set product_model to NULL rather than wiping rows.
    product_model = models.ForeignKey(
        ProductModel, null=True, blank=True, on_delete=models.SET_NULL, related_name="movements"
    )
    physical_product = models.ForeignKey(
        PhysicalProduct, null=True, blank=True, on_delete=models.PROTECT, related_name="movements"
    )
    batch = models.ForeignKey(
        ProductBatch, null=True, blank=True, on_delete=models.PROTECT, related_name="movements"
    )
    work_order = models.ForeignKey(
        WorkOrder, null=True, blank=True, on_delete=models.SET_NULL, related_name="movements"
    )

    from_location = models.ForeignKey(
        Location, on_delete=models.PROTECT, related_name="outgoing_movements"
    )
    to_location = models.ForeignKey(
        Location, on_delete=models.PROTECT, related_name="incoming_movements"
    )

    # Supplier (fornitore) the goods were received from. Set on inbound receipts;
    # null for adjustments, transfers, and outbound. Attribution layer over the
    # virtual "External Vendor" from_location.
    supplier = models.ForeignKey(
        Supplier, null=True, blank=True, on_delete=models.PROTECT, related_name="movements"
    )

    # Customer (cliente) the goods were shipped to. Set on outbound shipments
    # (SALES-ORDERS-04); null for adjustments, transfers, and inbound.
    # Attribution layer over the virtual "External" to_location. String ref to
    # avoid a circular import (customers.py has no dependency on ledger.py).
    customer = models.ForeignKey(
        "inventory.Customer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="movements",
    )

    # Purchase-order line this receipt fulfils (PURCHASE-ORDERS-03). SET_NULL:
    # the immutable audit row outlives the commercial document. String ref to
    # avoid a circular import (purchasing.py has no dependency on ledger.py).
    purchase_order_line = models.ForeignKey(
        "inventory.PurchaseOrderLine",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="movements",
    )

    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    purchased_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Weighted-average unit cost frozen at the moment of an OUTBOUND movement
    # (COSTING-06). Snapshotting it here keeps historical COGS reports stable
    # even as the running average moves on later receipts. Stamped AFTER the
    # immutable row is created, via a targeted queryset UPDATE that bypasses
    # save() — the same exception to immutability that `product_label`
    # enjoys (see save() below). Null on inbound/internal transfers.
    cogs_unit_cost = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)

    performed_by = models.ForeignKey(
        User, null=True, on_delete=models.SET_NULL, related_name="movements"
    )
    occurred_at = models.DateTimeField(default=timezone.now)
    reason = models.CharField(max_length=255, blank=True)

    # Idempotency
    idempotency_key = models.UUIDField(
        null=True, blank=True, unique=True, help_text="Unique key to prevent duplicate movements."
    )

    # Snapshot of the product identity at creation time. Survives
    # `preserve_movements=true` bulk-deletes (which SET_NULL the FK), so the
    # audit trail stays queryable after the product is gone.
    product_label = models.CharField(max_length=255, blank=True, default="", editable=False)

    class Meta:
        indexes = [
            models.Index(fields=["product_model", "to_location"]),
            models.Index(fields=["product_model", "from_location"]),
            models.Index(fields=["occurred_at"]),
            models.Index(fields=["work_order"]),
            models.Index(fields=["idempotency_key"]),
            # Single-field location indexes for location-scoped queries
            models.Index(fields=["from_location"]),
            models.Index(fields=["to_location"]),
            # Compound index for recent movements by product
            models.Index(fields=["product_model", "-occurred_at"]),
        ]

    def clean(self):
        if self.quantity < 0:
            raise ValidationError({"quantity": "Quantity must be non-negative."})
        # quantity == 0 is only legal for self-loop audit rows (e.g. tracker
        # status changes) where from_location == to_location and stock balance
        # is unaffected. Reject zero on real transfers.
        if self.quantity == 0 and self.from_location_id != self.to_location_id:
            raise ValidationError(
                {
                    "quantity": "Quantity must be positive. Swap 'from' and 'to' for reverse movements."
                }
            )
        self._validate_company_consistency()

    def _validate_company_consistency(self):
        """Verify all FK references belong to the same company as the product_model."""
        if self.product_model is None:
            # product_model is nullable post-delete (SET_NULL); the record was
            # validated when first written. Skip when reached on an orphan.
            return
        company = self.product_model.company

        if self.from_location and self.from_location.company_id != company.pk:
            raise ValidationError(
                {"from_location": "from_location belongs to a different company."}
            )

        if self.to_location and self.to_location.company_id != company.pk:
            raise ValidationError({"to_location": "to_location belongs to a different company."})

        if self.work_order and self.work_order.company_id != company.pk:
            raise ValidationError({"work_order": "work_order belongs to a different company."})

        if self.supplier and self.supplier.company_id != company.pk:
            raise ValidationError({"supplier": "supplier belongs to a different company."})

        if self.customer and self.customer.company_id != company.pk:
            raise ValidationError({"customer": "customer belongs to a different company."})

        if (
            self.purchase_order_line
            and self.purchase_order_line.purchase_order.company_id != company.pk
        ):
            raise ValidationError(
                {"purchase_order_line": "purchase_order_line belongs to a different company."}
            )

        # The physical item / batch must belong to THIS movement's product, not
        # merely the same company. Otherwise a client passing product P1 with a
        # physical_product_id of P2 (same tenant) moves P2's unit while the
        # immutable ledger row attributes it to P1 — P1's ledger lies and P2's
        # counts change with no P2 entry (COR-12). Compare as strings: clean()
        # runs on unsaved instances where an id set via `_id=<str>` hasn't been
        # coerced to UUID yet, so a raw `!=` would false-positive str vs UUID.
        if self.physical_product and str(self.physical_product.product_model_id) != str(
            self.product_model_id
        ):
            raise ValidationError(
                {"physical_product": "physical_product belongs to a different product."}
            )

        if self.batch and str(self.batch.product_model_id) != str(self.product_model_id):
            raise ValidationError({"batch": "batch belongs to a different product."})

    def save(self, *args, **kwargs):
        # Movement rows are immutable via the ORM save() path. Two fields are
        # exempt and may only be written *after* creation through a targeted
        # `Movement.objects.filter(pk=...).update(...)` that bypasses save():
        #   - product_label (snapshot of product identity)
        #   - cogs_unit_cost (frozen weighted-average at outbound, COSTING-06)
        if not self._state.adding:
            raise ValidationError("Movement records are immutable and cannot be modified.")
        if self.product_model and not self.product_label:
            self.product_label = f"{self.product_model.sku} - {self.product_model.name}"[:255]
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        label = self.product_model.sku if self.product_model else (self.product_label or "orphaned")
        return f"{label}: {self.from_location} -> {self.to_location} ({self.quantity})"
