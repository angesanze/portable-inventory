import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.postgres.indexes import GinIndex
from core.models import Company
from ..constants import INVENTORY_PROFILES
from ..profiles import profile_to_legacy
from .strategy import CalculatorTemplate


class ProductModel(models.Model):
    """
    Represents a type of product in the inventory.
    Provides polymorphic behavior based on tracking_mode and engine_type.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="product_models")
    default_calculator = models.ForeignKey(
        CalculatorTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_models",
    )
    sku = models.CharField(max_length=100)
    name = models.CharField(max_length=255)
    barcode = models.CharField(
        max_length=14,
        blank=True,
        default="",
        help_text="GTIN / EAN-8 / EAN-13 / UPC-A barcode printed by the manufacturer. "
        "Unique per company when set.",
    )
    attributes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    engine_config = models.JSONField(default=dict, blank=True)
    profile = models.CharField(
        max_length=50,
        choices=INVENTORY_PROFILES,
        default="SIMPLE_COUNT",
        help_text="Inventory profile — determines tracking mode, engine, and behavior",
    )
    initial_balance = models.DecimalField(
        max_digits=19,
        decimal_places=4,
        default=0,
        help_text="Initial stock level for BULK tracking",
    )
    reorder_threshold = models.DecimalField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Min on-hand qty before product enters REORDER column",
    )
    critical_threshold = models.DecimalField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Drop below = CRITICAL column. Defaults to reorder_threshold/2 when null at scoring time.",
    )
    max_threshold = models.DecimalField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Above = OVERSTOCK swimlane",
    )
    reorder_qty = models.DecimalField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Suggested qty to reorder; default = max_threshold - current at scoring time",
    )

    @property
    def tracking_mode(self) -> str:
        """Derived from profile."""
        tm, _, _ = profile_to_legacy(self.profile)
        return tm

    @property
    def engine_type(self) -> str:
        """Derived from profile."""
        _, et, _ = profile_to_legacy(self.profile)
        return et

    @property
    def model(self):
        """Self-reference for adapter compatibility. Engines can access .model uniformly."""
        return self

    def clean(self):
        super().clean()
        # Profile is now the single source of truth.
        # Legacy cross-validation is unnecessary — profile_to_legacy guarantees consistency.
        # Validate the barcode (GTIN check digit) only when one is set; a blank
        # barcode is allowed and skips the conditional unique constraint below.
        if self.barcode:
            self.barcode = self.barcode.strip()
        if self.barcode:
            from ..validators import validate_gtin

            if not validate_gtin(self.barcode):
                raise ValidationError(
                    {
                        "barcode": "Invalid barcode: must be a valid GTIN (EAN-8/EAN-13/UPC-A/GTIN-14)."
                    }
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        unique_together = ("company", "sku")
        constraints = [
            models.UniqueConstraint(
                fields=["company", "barcode"],
                condition=~models.Q(barcode=""),
                name="uniq_company_barcode_when_set",
            ),
        ]
        indexes = [
            GinIndex(fields=["attributes"], name="product_model_attr_gin"),
        ]

    def __str__(self):
        return f"{self.sku} - {self.name}"


class Location(models.Model):
    LOCATION_TYPES = [
        ("PHYSICAL", "Physical"),
        ("WAREHOUSE", "Warehouse"),
        ("STORE", "Store"),
        ("LOSS", "Loss"),
        ("VIRTUAL", "Virtual"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="locations")
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=50, choices=LOCATION_TYPES)
    # Whether stock parked here counts toward the company's sellable/available
    # quantity. A quarantine area (RMA-08) is real, WAREHOUSE-type physical
    # stock that is explicitly NOT sellable until a return is resolved.
    is_sellable = models.BooleanField(default=True)

    class Meta:
        unique_together = ("company", "name")

    def clean(self):
        super().clean()
        # Walk the parent chain to reject self-loops and cycles — traversal
        # code (reporting, hierarchy display) would otherwise recurse forever.
        seen = {self.pk}
        ancestor = self.parent
        while ancestor is not None:
            if ancestor.pk in seen:
                raise ValidationError({"parent": "Location hierarchy cannot contain cycles."})
            seen.add(ancestor.pk)
            ancestor = ancestor.parent

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name
