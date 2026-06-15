from django.conf import settings
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProductModelViewSet, MovementViewSet, StockViewSet, LocationViewSet, SupplierViewSet, CustomerViewSet, PhysicalProductViewSet, CalculatorTemplateViewSet, ProductBatchViewSet, EventLogViewSet, WorkOrderViewSet, ProductsPolyViewSet, NotificationChannelViewSet, NotificationDeliveryViewSet, PurchaseOrderViewSet, SalesOrderViewSet, TransferOrderViewSet, ReturnOrderViewSet, CountSessionViewSet, ReportsViewSet
from .views.strategies import validate_calculator_config
from core.api_views import ApiKeyViewSet, UserViewSet, CompanySettingsView
from core.tenant_views import TenantManagementViewSet
from core.user_management import CompanyUserViewSet
from core.platform_views import PlatformCompanyViewSet, AuditLogViewSet
from core.platform_metrics import PlatformStatsView, PlatformGrowthView, PlatformApiUsageView, PlatformInsightsView, PlatformHealthView
from core.platform_export import CompanyDataExportView
from .qr_views import DynamicQRCodeViewSet
from .views.restock import RestockBoardView, ProductSeriesView, BulkThresholdView
from .views.reservations import ReservationViewSet
from .views.imports import ProductImportView
from .api.public.viewsets.onboarding import OnboardingViewSet

router = DefaultRouter()
router.register(r'product-models', ProductModelViewSet)
router.register(r'locations', LocationViewSet)
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'physical-products', PhysicalProductViewSet)
router.register(r'movements', MovementViewSet, basename='movement')
router.register(r'stock', StockViewSet, basename='stock')
router.register(r'api-keys', ApiKeyViewSet, basename='api-key')
router.register(r'users', UserViewSet, basename='user')
router.register(r'company-users', CompanyUserViewSet, basename='company-user')
router.register(r'calculator-templates', CalculatorTemplateViewSet, basename='calculator-templates')
router.register(r'batches', ProductBatchViewSet, basename='product-batches')
router.register(r'event-logs', EventLogViewSet, basename='event-logs')
router.register(r'work-orders', WorkOrderViewSet, basename='work-order')
router.register(r'qr-codes', DynamicQRCodeViewSet, basename='qr-codes')
router.register(r'products-poly', ProductsPolyViewSet, basename='products-poly')
router.register(r'reservations', ReservationViewSet, basename='reservation')
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchase-order')
router.register(r'sales-orders', SalesOrderViewSet, basename='sales-order')
router.register(r'transfer-orders', TransferOrderViewSet, basename='transfer-order')
router.register(r'return-orders', ReturnOrderViewSet, basename='return-order')
router.register(r'count-sessions', CountSessionViewSet, basename='count-session')
router.register(r'reports', ReportsViewSet, basename='reports')
router.register(r'notification-channels', NotificationChannelViewSet, basename='notification-channel')
router.register(r'notification-deliveries', NotificationDeliveryViewSet, basename='notification-delivery')
router.register(r'tenants', TenantManagementViewSet, basename='tenant')
router.register(r'platform/companies', PlatformCompanyViewSet, basename='platform-company')
router.register(r'platform/audit', AuditLogViewSet, basename='platform-audit')

urlpatterns = [
    path('widget/', include('inventory.api.public.urls')),
    path('calculators/validate/', validate_calculator_config, name='calculator-validate'),
    path('onboarding/', OnboardingViewSet.as_view({'post': 'register'}), name='onboarding-register'),
    path('company/settings/', CompanySettingsView.as_view(), name='company-settings'),
    path('platform/stats/', PlatformStatsView.as_view(), name='platform-stats'),
    path('platform/stats/growth/', PlatformGrowthView.as_view(), name='platform-stats-growth'),
    path('platform/stats/api-usage/', PlatformApiUsageView.as_view(), name='platform-stats-api-usage'),
    path('platform/insights/', PlatformInsightsView.as_view(), name='platform-insights'),
    path('platform/insights/health/', PlatformHealthView.as_view(), name='platform-insights-health'),
    path('platform/export/', CompanyDataExportView.as_view(), name='platform-export'),
    path('import/products/', ProductImportView.as_view(), name='import-products'),
    path('restock/board/', RestockBoardView.as_view(), name='restock-board'),
    path('restock/thresholds/bulk/', BulkThresholdView.as_view(), name='restock-thresholds-bulk'),
    path('products/<uuid:pk>/stock-series/', ProductSeriesView.as_view(), name='product-stock-series'),
    path('', include(router.urls)),
]

if settings.DEBUG:
    from .e2e_views import SeedE2EView
    urlpatterns.append(path('seed-e2e/', SeedE2EView.as_view(), name='seed-e2e'))
# Note: /go/{code}/ redirect is added in main project urls.py

