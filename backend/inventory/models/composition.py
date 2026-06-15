import uuid
from django.db import models
from django.core.exceptions import ValidationError
from core.models import Company
from .core import ProductModel

class ProductComponent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(ProductModel, on_delete=models.CASCADE, related_name='components')
    child = models.ForeignKey(ProductModel, on_delete=models.CASCADE, related_name='used_in')
    quantity = models.DecimalField(max_digits=19, decimal_places=4, default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('parent', 'child')

    def clean(self):
        super().clean()
        if self.parent.company_id != self.child.company_id:
            raise ValidationError("Parent and child products must belong to the same company.")
        if self.parent_id == self.child_id:
            raise ValidationError("A product cannot be a component of itself.")
        # Reject cycles (A→B, B→A): BOM explosion would recurse forever.
        # BFS from `child` through existing components, looking for `parent`.
        frontier = [self.child_id]
        visited = set()
        while frontier:
            current = frontier.pop()
            if current == self.parent_id:
                raise ValidationError("Component relationship would create a cycle in the bill of materials.")
            if current in visited:
                continue
            visited.add(current)
            frontier.extend(
                ProductComponent.objects.filter(parent_id=current)
                .values_list('child_id', flat=True)
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.parent.sku} -> {self.child.sku} ({self.quantity})"

class WorkOrder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='work_orders')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=[('OPEN', 'Open'), ('CLOSED', 'Closed'), ('ARCHIVED', 'Archived')], default='OPEN')
    product_model = models.ForeignKey(ProductModel, on_delete=models.SET_NULL, null=True, blank=True, related_name='work_orders', help_text="Batch definition / Kit type")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.product_model and self.product_model.company_id != self.company_id:
            raise ValidationError({'product_model': "Product model must belong to the same company as the work order."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.status})"
