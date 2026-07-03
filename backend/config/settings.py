from pathlib import Path
import os
import sys
import dj_database_url
from datetime import timedelta
from django.core.exceptions import ImproperlyConfigured

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = int(os.environ.get("DEBUG", 0))

# True under pytest / `manage.py test`. Used to skip prod-only hardening (e.g.
# the HTTPS redirect) that would otherwise 301 the test client and break tests.
_TESTING = "pytest" in sys.modules or "test" in sys.argv

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY and not DEBUG:
    raise ImproperlyConfigured("SECRET_KEY must be set in production")
SECRET_KEY = SECRET_KEY or "django-insecure-dev-key-do-not-use-in-production"

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost 127.0.0.1 [::1]").split(" ")
if DEBUG:
    ALLOWED_HOSTS += ["frontend", "frontend:5173", "backend"]

_cors_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = (
    [origin.strip() for origin in _cors_env.split(",") if origin.strip()]
    if _cors_env
    else [
        "http://localhost:5173",
        "http://localhost",
        "http://frontend:5173",
    ]
)
CORS_ALLOW_CREDENTIALS = True

# Behind the Cloud Run / Firebase Hosting HTTPS proxy: trust the forwarded proto
# so Django treats requests as secure (otherwise SECURE_SSL_REDIRECT loops), and
# trust the deployed origins for CSRF (admin form posts / session auth).
# CSRF_TRUSTED_ORIGINS is space-separated and must include the scheme, e.g.
# "https://varasto-prod.web.app https://varasto-api-xxxx.run.app".
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(" ") if o.strip()
]

# Public, externally-reachable origin used to build absolute links embedded in
# artifacts that leave the server (e.g. QR codes scanned by phones). Empty in
# dev → callers fall back to the request origin. Set to e.g.
# https://app.varasto.example in production.
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

# Public origin where the FRONTEND (React SPA) is served. Used to build QR
# codes and /go/<code>/ redirects so scanned codes land on the frontend's
# /widget route (Vite proxies /go/* back to backend, so the round-trip works).
# Default = local Vite dev server. Set to e.g. https://app.varasto.example
# in production.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")

# ── Email (active notifications, NOTIFICATIONS-02) ─────────────────────────
# In DEBUG the console backend prints emails to stdout; production should set
# EMAIL_BACKEND/EMAIL_HOST/... via env. See docs/operations/monitoring.md and
# the commented env block in docker-compose.yml.
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 587))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True") == "True"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "notifications@portable-inventory.local")


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    "django_filters",
    # Local apps
    "core",
    "inventory",
    # Admin tooling (bulk import/export + date-range filters)
    "import_export",
    "rangefilter",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "inventory.middleware.company_scope.CompanyScopeMiddleware",
    "core.license_middleware.LicenseEnforcementMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database
DATABASES = {"default": dj_database_url.config(default="sqlite:///db.sqlite3")}

# Cloud Run + Cloud SQL: connect over the unix socket mounted by
# `--add-cloudsql-instances`. Setting HOST explicitly avoids depending on
# DATABASE_URL socket-parsing quirks — DATABASE_URL then carries only
# user/password/dbname (e.g. postgres://user:pass@/dbname).
_cloudsql_conn = os.environ.get("CLOUD_SQL_CONNECTION_NAME")
if _cloudsql_conn:
    DATABASES["default"]["HOST"] = f"/cloudsql/{_cloudsql_conn}"
    DATABASES["default"]["PORT"] = ""

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# DRF Configuration
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "inventory.middleware.error_handler.inventory_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "inventory.pagination.StandardPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "1000/day",
        "user": "100000/day",
        "login": "10/minute",
        "qr_redirect": "100/minute",
        "qr_api": "500/minute",
        "widget_api": "1000/hour",
        "widget_api_burst": "100/minute",
        "import_products": "30/hour",
        "company_export": "1/hour",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Varasto API",
    "DESCRIPTION": (
        "REST API for the Varasto management system.\n\n"
        "## Authentication\n\n"
        "Two authentication methods are supported:\n\n"
        "- **JWT Bearer Token** — Obtain tokens via `POST /api/token/` with username/password. "
        "Include in requests as `Authorization: Bearer <access_token>`. Used by the Authority Dashboard.\n\n"
        "- **API Key** — Pass via `?api_key=<key>` query parameter, `X-API-Key` header, or request body. "
        "Used by the embeddable Widget and external integrations. The legacy `?api_key=` in QR URLs is "
        "deprecated: QR redirects now emit a short-lived token exchanged once at "
        "`POST /api/v1/widget/exchange_token/`.\n\n"
        "## Scoping (developer tier)\n\n"
        "A developer-tier company may act on a child tenant it owns by sending the optional "
        "`X-Acting-Company: <child-company-uuid>` header on `/api/v1/` requests. Managers acting on "
        "their own company can omit it.\n\n"
        "## Versioning\n\n"
        "The API is URL-versioned under `/api/v1/`. Breaking changes ship a new version; "
        "deprecated endpoints carry an `X-API-Deprecated` header. See docs/api/versioning.md.\n\n"
        "## Rate Limiting\n\n"
        "Widget endpoints: 1000 requests/hour sustained, 100 requests/minute burst. "
        "Auth endpoints: 100 requests/minute. Data export: 1/hour. "
        "Exceeding limits returns `429 Too Many Requests`."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "config.spectacular_hooks.add_acting_company_header",
        "config.spectacular_hooks.tag_platform_endpoints",
    ],
    "TAGS": [
        {
            "name": "Widget",
            "description": "Embeddable widget endpoints (api_key auth): product listing, stock transactions, movements, QR token exchange, barcode resolution.",
        },
        {
            "name": "Inventory",
            "description": "Location management, batch queries, and physical item tracking.",
        },
        {
            "name": "QR Codes",
            "description": "Dynamic QR code lifecycle: info, configure, and lock.",
        },
        {"name": "Onboarding", "description": "Self-service company registration and setup."},
        {"name": "Products", "description": "Product model CRUD and configuration."},
        {
            "name": "Settings",
            "description": "API key management, user management, and system configuration.",
        },
        {
            "name": "Admin",
            "description": "Authenticated Authority Dashboard endpoints (JWT bearer).",
        },
        {"name": "Auth", "description": "JWT token obtain/refresh."},
        {
            "name": "Platform",
            "description": "Superuser-only platform administration and per-tenant GDPR data export.",
        },
    ],
    "SECURITY": [
        {"BearerAuth": []},
        {"ApiKeyAuth": []},
    ],
    "APPEND_COMPONENTS": {
        "securitySchemes": {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "JWT access token obtained from /api/token/",
            },
            "ApiKeyAuth": {
                "type": "apiKey",
                "in": "query",
                "name": "api_key",
                "description": "Company API key (also accepted via X-API-Key header)",
            },
        },
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

AUTH_USER_MODEL = "core.User"

# Security headers (production hardening). Skipped under tests so the HTTPS
# redirect doesn't 301 the test client (CI runs with DEBUG=0).
if not DEBUG and not _TESTING:
    SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "True") == "True"
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Logging — structured, no plaintext secrets
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "WARNING",
        },
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "inventory": {
            "handlers": ["console"],
            "level": "INFO",
        },
    },
}

# Django Debug Toolbar (development only, disabled during tests)
if DEBUG and not _TESTING:
    try:
        import debug_toolbar  # noqa: F401

        INSTALLED_APPS += ["debug_toolbar"]
        MIDDLEWARE.insert(0, "debug_toolbar.middleware.DebugToolbarMiddleware")
        INTERNAL_IPS = ["127.0.0.1", "localhost"]
        DEBUG_TOOLBAR_CONFIG = {
            "SHOW_TOOLBAR_CALLBACK": lambda request: DEBUG,
        }
    except ImportError:
        pass
