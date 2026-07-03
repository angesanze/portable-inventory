"""Weighted-average cost state per product (COSTING-06).

`ProductCost` is a materialized cache of the *continuous weighted-average*
unit cost for a single `ProductModel`. It is mutated incrementally by
`CostingService` as inbound/outbound movements pass through
`LedgerService.transfer_stock`, and can be fully rebuilt deterministically by
replaying the immutable ledger in `occurred_at` order (`rebuild_costs`
management command).

Method: continuous weighted average (v1). FIFO/LIFO cost layers are deferred
(see COSTING-06 notes) — the ledger retains everything needed to add them
later without a data migration.

Decimals: costs are held at 4 internal decimal places; the display layer
rounds to 2.
"""

import uuid
from decimal import Decimal

from django.db import models

from .core import ProductModel


class ProductCost(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # OneToOne: exactly one running cost state per product.
    product_model = models.OneToOneField(
        ProductModel, on_delete=models.CASCADE, related_name="cost_state"
    )
    # Continuous weighted-average unit cost of the on-hand stock.
    avg_unit_cost = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0"))
    # Quantity the average was computed against. Clamped to >= 0: the
    # weighted average is undefined below zero (negative stock from BULK
    # `allow_negative` or historical adjustments), so we floor it and let
    # `rebuild_costs` log a warning.
    valued_qty = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0"))
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["product_model"]),
        ]

    @property
    def stock_value(self) -> Decimal:
        """Booked value of on-hand stock = avg_unit_cost * valued_qty."""
        return (self.avg_unit_cost or Decimal("0")) * (self.valued_qty or Decimal("0"))

    def __str__(self):
        return f"{self.product_model.sku}: {self.avg_unit_cost} x {self.valued_qty}"
