import uuid
from django.db import models
from django.contrib.postgres.indexes import GinIndex
from django.core.exceptions import ValidationError
from .core import ProductModel, Location


class ProductBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product_model = models.ForeignKey(
        ProductModel, on_delete=models.CASCADE, related_name="batches"
    )
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="batches")
    batch_identifier = models.CharField(
        max_length=255, help_text="Unique ID for this batch (e.g. Lot Number)"
    )
    data = models.JSONField(
        default=dict, blank=True, help_text="Dynamic data based on Strategy Schema"
    )
    quantity = models.DecimalField(max_digits=19, decimal_places=4, default=0)
    work_order = models.ForeignKey(
        "inventory.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="batches",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product_model", "location", "batch_identifier", "work_order")
        indexes = [
            GinIndex(fields=["data"], name="batch_data_gin"),
        ]

    @staticmethod
    def make_identifier(work_order, product_model):
        """Canonical auto-batch identifier for a (work order, product) pair.

        Single source of truth so the widget "add to existing batch" lookup and
        the creation paths (WorkOrderService, BatchManagerService) always agree
        — divergent formats would mint duplicate batches instead of incrementing
        an existing one.
        """
        pm_id = getattr(product_model, "id", product_model)
        return f"BATCH-{work_order.id.hex[:6].upper()}-{str(pm_id)[:4]}"

    def clean(self):
        super().clean()
        company_id = self.product_model.company_id
        if self.location and self.location.company_id != company_id:
            raise ValidationError(
                {"location": "Location belongs to a different company than the product."}
            )
        if self.work_order and self.work_order.company_id != company_id:
            raise ValidationError(
                {"work_order": "Work order belongs to a different company than the product."}
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product_model.sku} [{self.batch_identifier}]"


class PhysicalProduct(models.Model):
    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("IN_USE", "In Use"),
        ("RETURNED", "Returned"),
        ("RECALL", "Recall"),
        ("EXPIRED", "Expired"),
        ("DISPOSED", "Disposed"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product_model = models.ForeignKey(
        ProductModel, on_delete=models.CASCADE, related_name="physical_products"
    )
    identifier = models.CharField(max_length=255)
    batch_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, default="ACTIVE", choices=STATUS_CHOICES)

    location = models.ForeignKey(
        Location, on_delete=models.SET_NULL, null=True, blank=True, related_name="physical_products"
    )
    work_order = models.ForeignKey(
        "inventory.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="physical_products",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product_model", "identifier")

    def clean(self):
        super().clean()
        if self.product_model.tracking_mode != "INDIVIDUAL":
            raise ValidationError(
                {
                    "product_model": f"Physical Products cannot be created for model '{self.product_model.sku}' because it is tracked as '{self.product_model.tracking_mode}'."
                }
            )
        company_id = self.product_model.company_id
        if self.location and self.location.company_id != company_id:
            raise ValidationError(
                {"location": "Location belongs to a different company than the product."}
            )
        if self.work_order and self.work_order.company_id != company_id:
            raise ValidationError(
                {"work_order": "Work order belongs to a different company than the product."}
            )

    def __str__(self):
        return f"{self.product_model.name} - {self.identifier or self.id}"

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
