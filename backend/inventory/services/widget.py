"""
WidgetService — backward-compatible facade.

The original monolith has been split into:
  - WidgetProductService     (widget_product.py)  — product listing & details
  - WidgetTransactionService (widget_transaction.py) — check-in/check-out
  - BatchManagerService      (batch_manager.py)    — work order composition

This module re-exports WidgetService so existing callers continue to work.
"""

from .widget_product import WidgetProductService
from .widget_transaction import WidgetTransactionService
from .batch_manager import BatchManagerService


class WidgetService:
    """Facade that delegates to the focused service classes."""

    # Product listing / details
    get_widget_products = WidgetProductService.get_widget_products
    get_widget_product_details = WidgetProductService.get_widget_product_details

    # Transaction processing
    process_transaction = WidgetTransactionService.process_transaction

    # Batch manager (kept as underscore alias for existing callers)
    _handle_batch_manager_transaction = BatchManagerService.handle_batch_manager_transaction
