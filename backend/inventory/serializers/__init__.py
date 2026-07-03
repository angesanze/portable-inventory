from .products import (
    ProductModelSerializer,
    ProductModelListSerializer,
    PhysicalProductSerializer,
    ProductComponentSerializer,
)
from .locations import LocationSerializer
from .suppliers import SupplierSerializer
from .customers import CustomerSerializer
from .work_orders import WorkOrderSerializer, WorkOrderListSerializer, ProductBatchSerializer
from .movements import (
    MovementSerializer,
    MovementReadSerializer,
    EventLogSerializer,
    DynamicQRCodeSerializer,
)
from .strategies import CalculatorTemplateSerializer
from .purchasing import PurchaseOrderSerializer, PurchaseOrderLineSerializer
from .sales import SalesOrderSerializer, SalesOrderLineSerializer
from .transfers import TransferOrderSerializer, TransferOrderLineSerializer
from .rma import ReturnOrderSerializer, ReturnOrderLineSerializer
