import uuid
from django.db import models
from core.models import Company
from core.validators import validate_partita_iva


class Customer(models.Model):
    """
    A business counterparty goods are shipped to (cliente).

    Mirror of Supplier: a Customer carries registry data (VAT, contacts) and is
    referenced by outbound Movements via the ``customer`` FK. The ledger's
    physical from/to Location semantics are unchanged — the customer is an
    attribution layer on top of the existing "External" virtual location.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="customers")
    name = models.CharField(max_length=255)
    vat_number = models.CharField(
        max_length=64,
        blank=True,
        help_text="Partita IVA / VAT number",
        validators=[validate_partita_iva],
    )
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=64, blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("company", "name")
        ordering = ["name"]

    def __str__(self):
        return self.name
