from django.urls import path
from .viewsets.products import ProductWidgetViewSet
from .viewsets.locations import LocationWidgetViewSet
from .viewsets.inventory import InventoryQueryViewSet
from .viewsets.movements import MovementWidgetViewSet
from .viewsets.qr import QRCodeWidgetViewSet
from .viewsets.work_orders import WorkOrderWidgetViewSet
from .viewsets.token_exchange import WidgetTokenExchangeView

# Manual mapping to maintain backward compatibility with old widget URLs
urlpatterns = [
    path("", ProductWidgetViewSet.as_view({"get": "list"}), name="widget-list"),
    path(
        "resolve_barcode/",
        ProductWidgetViewSet.as_view({"get": "resolve_barcode"}),
        name="widget-resolve-barcode",
    ),
    path("<uuid:pk>/", ProductWidgetViewSet.as_view({"get": "retrieve"}), name="widget-detail"),
    path(
        "<uuid:pk>/transaction/",
        ProductWidgetViewSet.as_view({"post": "transaction"}),
        name="widget-transaction",
    ),
    path("move/", MovementWidgetViewSet.as_view({"post": "move"}), name="widget-move"),
    path("transfer/", MovementWidgetViewSet.as_view({"post": "transfer"}), name="widget-transfer"),
    path("items/", InventoryQueryViewSet.as_view({"get": "items"}), name="widget-items"),
    path("batches/", InventoryQueryViewSet.as_view({"get": "batches"}), name="widget-batches"),
    path("locations/", LocationWidgetViewSet.as_view({"get": "list"}), name="widget-locations"),
    path(
        "create_location/",
        LocationWidgetViewSet.as_view({"post": "create_location"}),
        name="widget-create-location",
    ),
    path(
        "location_inventory/",
        LocationWidgetViewSet.as_view({"get": "location_inventory"}),
        name="widget-location-inventory",
    ),
    path(
        "work_orders/", WorkOrderWidgetViewSet.as_view({"get": "list"}), name="widget-work-orders"
    ),
    path("qr_info/", QRCodeWidgetViewSet.as_view({"get": "qr_info"}), name="widget-qr-info"),
    path(
        "configure_qr/",
        QRCodeWidgetViewSet.as_view({"post": "configure_qr"}),
        name="widget-configure-qr",
    ),
    path("lock_qr/", QRCodeWidgetViewSet.as_view({"post": "lock_qr"}), name="widget-lock-qr"),
    path("exchange_token/", WidgetTokenExchangeView.as_view(), name="widget-exchange-token"),
]
