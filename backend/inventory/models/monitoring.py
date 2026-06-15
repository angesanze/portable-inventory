import uuid
from django.db import models
from .core import ProductModel
from .tracking import ProductBatch

class MonitoringRule(models.Model):
    TRIGGER_TYPES = [
        ('THRESHOLD', 'Threshold (Min/Max Quantity)'),
        ('DATE_OFFSET', 'Date Offset (Expiry/Maintenance)'),
        ('CUSTOM', 'Custom Expression'),
    ]
    SEVERITY_LEVELS = [
        ('INFO', 'Info'),
        ('WARNING', 'Warning'),
        ('CRITICAL', 'Critical'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product_model = models.ForeignKey(
        ProductModel,
        on_delete=models.CASCADE,
        related_name='monitoring_rules',
        null=True,
    )
    name = models.CharField(max_length=255)
    trigger_type = models.CharField(max_length=50, choices=TRIGGER_TYPES)
    condition_config = models.JSONField(default=dict, blank=True, help_text="Config for the rule (e.g. {'threshold': 10})")
    severity = models.CharField(max_length=20, choices=SEVERITY_LEVELS, default='WARNING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        label = self.product_model.name if self.product_model else "unlinked"
        return f"{self.name} ({label})"

class EventLog(models.Model):
    STATUS_CHOICES = [
        ('OPEN', 'Open'),
        ('RESOLVED', 'Resolved'),
        ('IGNORED', 'Ignored'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule = models.ForeignKey(MonitoringRule, on_delete=models.SET_NULL, null=True, related_name='events')
    product = models.ForeignKey(ProductModel, on_delete=models.CASCADE, related_name='events')
    batch = models.ForeignKey(ProductBatch, on_delete=models.SET_NULL, null=True, blank=True, related_name='events')
    
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"[{self.get_status_display()}] {self.message}"
