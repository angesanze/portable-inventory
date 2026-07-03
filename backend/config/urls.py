from django.conf import settings
from django.urls import path, include
from core.admin_site import varasto_admin_site
from core.views import CustomTokenObtainPairView
from rest_framework_simplejwt.views import TokenRefreshView
from inventory.qr_views import QRRedirectView

from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", varasto_admin_site.urls),
    path("api/v1/", include("inventory.urls")),
    path("api/token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("go/<str:code>/", QRRedirectView.as_view(), name="qr_redirect"),
    # API Docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

if settings.DEBUG:
    try:
        import debug_toolbar

        urlpatterns = [path("__debug__/", include(debug_toolbar.urls))] + urlpatterns
    except ImportError:
        pass
