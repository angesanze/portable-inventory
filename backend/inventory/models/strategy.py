import uuid
from django.db import models
from core.models import Company
from ..constants import ENGINE_TYPES

class CalculatorTemplate(models.Model):
    """
    Reusable engine configuration preset.

    Stores a named engine_config JSON that users can apply when creating
    products. The product's `profile` determines which engine to use;
    the template just provides default configuration values.

    Example: A "Pharma Batch" template might store bucket fields
    (lot_number, expiry_date, manufacturer) that get copied into
    ProductModel.engine_config on product creation.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='calculator_templates')
    name = models.CharField(max_length=255)
    engine_type = models.CharField(max_length=50, choices=ENGINE_TYPES)
    engine_config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.engine_type})"

