import uuid
from django.db import models
from core.models import Company


class Supplier(models.Model):
    """
    A business counterparty goods are received from (fornitore).

    Distinct from a Location: a Supplier carries registry data (VAT, contacts)
    and is referenced by inbound Movements via the ``supplier`` FK. The ledger's
    physical from/to Location semantics are unchanged — the supplier is an
    attribution layer on top of the existing "External Vendor" virtual location.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="suppliers")
    name = models.CharField(max_length=255)
    vat_number = models.CharField(max_length=64, blank=True, help_text="Partita IVA / VAT number")
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=64, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("company", "name")
        ordering = ["name"]

    def __str__(self):
        return self.name
