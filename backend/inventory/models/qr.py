import uuid
import random
import string
from django.db import models
from django.core.exceptions import ValidationError
from core.models import Company
from .core import ProductModel, Location
from .tracking import PhysicalProduct


def generate_qr_code():
    """Generate a short unique code for QR"""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


class DynamicQRCode(models.Model):
    STATUS_CHOICES = [
        ("VIRGIN", "Not Configured"),
        ("CONFIGURED", "Configured"),
        ("LOCKED", "Locked"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=12, unique=True, default=generate_qr_code)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="qr_codes")
    # SET_NULL, not CASCADE: printed QR codes outlive key rotation. An
    # orphaned QR redirects to an explicit error instead of silently
    # vanishing with the deleted key.
    api_key = models.ForeignKey(
        "core.ApiKey",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qr_codes",
        help_text="API Key used for widget access",
    )

    product_model = models.ForeignKey(
        ProductModel, null=True, blank=True, on_delete=models.SET_NULL, related_name="qr_codes"
    )
    physical_product = models.ForeignKey(
        PhysicalProduct, null=True, blank=True, on_delete=models.SET_NULL, related_name="qr_codes"
    )
    batch = models.ForeignKey(
        "inventory.ProductBatch",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="qr_codes",
        help_text="Specific batch context",
    )
    work_order = models.ForeignKey(
        "inventory.WorkOrder",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="qr_codes",
        help_text="Specific Work Order / Kit context",
    )
    location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="qr_codes",
        help_text="Location context for this QR",
    )
    custom_url = models.URLField(
        null=True, blank=True, help_text="External URL (overrides product links)"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="VIRGIN")
    label = models.CharField(max_length=100, blank=True, help_text="Optional friendly name")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Dynamic QR Code"
        verbose_name_plural = "Dynamic QR Codes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"QR:{self.code} ({self.get_status_display()})"

    def get_target_display(self):
        if self.custom_url:
            return f"URL: {self.custom_url}"
        if self.physical_product:
            return f"Item: {self.physical_product.identifier}"
        if self.work_order:
            return f"Kit/WO: {self.work_order.name}"
        if self.batch:
            return f"Batch: {self.batch.batch_identifier}"
        if self.product_model:
            return f"Product: {self.product_model.name}"
        return "Not configured"

    def clean(self):
        super().clean()
        # Every FK that carries tenant meaning must be company-checked here —
        # this is the single choke point (save() calls clean()). `api_key` is the
        # most dangerous omission: /go/<code>/ mints a widget token from it, so a
        # foreign api_key would hand an attacker a token for another tenant.
        fk_checks = [
            ("product_model", lambda obj: obj.company_id),
            ("location", lambda obj: obj.company_id),
            ("physical_product", lambda obj: obj.product_model.company_id),
            ("api_key", lambda obj: obj.company_id),
            ("batch", lambda obj: obj.product_model.company_id),
        ]
        for field_name, get_company_id in fk_checks:
            obj = getattr(self, field_name, None)
            if obj and get_company_id(obj) != self.company_id:
                raise ValidationError({field_name: f"{field_name} belongs to a different company."})

        if self.work_order and self.work_order.company_id != self.company_id:
            raise ValidationError({"work_order": "work_order belongs to a different company."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def is_configured(self):
        return bool(
            self.product_model
            or self.batch
            or self.work_order
            or self.physical_product
            or self.custom_url
        )
