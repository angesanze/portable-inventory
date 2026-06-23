"""Inventory service layer.

MOD-04 — known layering smell: a few services form a dependency cycle
(``ledger`` ↔ ``reservations`` ↔ ``stock`` ↔ ``costing``). It is broken
pragmatically with **function-local imports** at the call site rather than
module-level imports, so importing this package never deadlocks. If you add a
service that participates in the cycle, follow the same pattern (import the
collaborator inside the method) — or, better, extract the shared contract into a
lower ``services/_base`` layer to remove the cycle entirely.
"""
from .ledger import LedgerService
from .costing import CostingService
from .counterparty import CounterpartyService
from .stock import StockService
from .strategy import StrategyService
from .product import ProductService
from .widget import WidgetService
from .widget_product import WidgetProductService
from .widget_transaction import WidgetTransactionService
from .batch_manager import BatchManagerService
from .work_order import WorkOrderService
from .work_order_fulfillment import WorkOrderFulfillmentService
from .restock import RestockService
from .notifications import NotificationService
from .purchasing import PurchasingService
from .sales import SalesService
from .transfers import TransferService
from .stocktake import StocktakeService
from .rma import RmaService

__all__ = [
    'LedgerService', 'CostingService', 'CounterpartyService', 'StockService', 'StrategyService',
    'ProductService',
    'WidgetService',  # backward-compatible facade
    'WidgetProductService', 'WidgetTransactionService', 'BatchManagerService',
    'WorkOrderService', 'WorkOrderFulfillmentService', 'RestockService', 'NotificationService',
    'PurchasingService', 'SalesService', 'TransferService', 'StocktakeService',
    'RmaService',
]
