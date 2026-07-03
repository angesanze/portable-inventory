"""Branded superadmin AdminSite with an ecosystem-intelligence index.

The Django ``/admin/`` is the superuser's only management surface today.
:class:`VarastoAdminSite` rebrands it and turns the otherwise-empty index page
into a platform cockpit: ecosystem-wide totals plus *anomaly panels* that
surface criticalities (suspended tenants, keyless companies, expired/expiring
API keys, multi-key managers, stale products, open events) and deep-link into
the relevant changelist with a prefilter.

Every figure is computed with database aggregation (``aggregate`` / ``Count`` /
``Q`` / set membership) — never a per-row Python loop over a whole table — so the
index stays fast as tenants and movements grow. This mirrors the flat-cost
patterns already used by :mod:`core.platform_metrics` for the React console.

This is intentionally UNSCOPED: the superuser cockpit shows every tenant's data.
``CompanyScopeMiddleware`` does not gate the admin.
"""

from datetime import timedelta

from django.contrib import admin
from django.db.models import Count, Q
from django.utils import timezone

# A product is "stale" if it has had no movement within this many days.
STALE_PRODUCT_DAYS = 90
# An API key is "expiring soon" if it expires within this many days.
EXPIRING_KEY_DAYS = 7


class VarastoAdminSite(admin.AdminSite):
    site_header = "Varasto Platform Console"
    site_title = "Varasto Admin"
    index_title = "Ecosystem Overview"
    # Distinct name (not "admin/index.html") so the override is picked up
    # regardless of INSTALLED_APPS order — django.contrib.admin precedes core,
    # so an app-dir "admin/index.html" would never win. This template extends
    # the stock "admin/index.html", keeping the default app/model list.
    index_template = "admin/varasto_index.html"

    def index(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context.setdefault("varasto_stats", self._ecosystem_stats())
        extra_context.setdefault(
            "varasto_anomalies",
            self._resolve_panel_urls(self._anomaly_panels()),
        )
        return super().index(request, extra_context=extra_context)

    def _resolve_panel_urls(self, panels):
        """Attach a ready-to-use ``url`` to each panel, or ``None`` if the
        target changelist is not registered on this site yet.

        Reversing inside the template would raise ``NoReverseMatch`` (a hard
        500) for models CLEANUP-08/09 have not registered yet. Resolving here
        keeps the index page green and lets later phases register those models
        without touching the template.
        """
        from django.urls import NoReverseMatch, reverse

        for panel in panels:
            try:
                base = reverse(f"{self.name}:{panel['changelist']}_changelist")
            except NoReverseMatch:
                panel["url"] = None
                continue
            query = panel.get("query")
            panel["url"] = f"{base}?{query}" if query else base
        return panels

    # -- aggregation helpers -------------------------------------------------

    def _ecosystem_stats(self):
        """Platform-wide totals. Each metric is one aggregate / count query."""
        # Imported lazily so importing this module never triggers app loading
        # before Django's app registry is ready.
        from core.models import ApiKey, Company, User
        from inventory.models.composition import WorkOrder
        from inventory.models.core import Location, ProductModel
        from inventory.models.ledger import Movement
        from inventory.models.qr import DynamicQRCode
        from inventory.models.suppliers import Supplier

        now = timezone.now()
        manager = Company.AccountType.MANAGER
        developer = Company.AccountType.DEVELOPER

        company_stats = Company.objects.aggregate(
            total=Count("id"),
            manager=Count("id", filter=Q(account_type=manager)),
            developer=Count("id", filter=Q(account_type=developer)),
            active=Count("id", filter=Q(is_active=True)),
            suspended=Count("id", filter=Q(is_active=False)),
        )

        key_stats = ApiKey.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            expired=Count("id", filter=Q(expires_at__lt=now)),
        )

        qr_by_status = {
            row["status"]: row["n"]
            for row in DynamicQRCode.objects.values("status").annotate(n=Count("id"))
        }

        movement_cutoff = now - timedelta(days=30)

        return {
            "companies": company_stats,
            "users": User.objects.count(),
            "api_keys": key_stats,
            "products": ProductModel.objects.count(),
            "movements_30d": Movement.objects.filter(occurred_at__gte=movement_cutoff).count(),
            "locations": Location.objects.count(),
            "suppliers": Supplier.objects.count(),
            "work_orders": WorkOrder.objects.count(),
            "qr_by_status": qr_by_status,
        }

    def _anomaly_panels(self):
        """Criticality panels: each is a count + a changelist deep-link.

        ``changelist`` is the ``<app>_<model>`` slug the template reverses as
        ``varasto_admin:<changelist>_changelist``; ``query`` is an optional
        prefilter querystring (only set where a native list_filter exists).
        """
        from core.models import ApiKey, Company
        from inventory.models.core import ProductModel
        from inventory.models.ledger import Movement
        from inventory.models.monitoring import EventLog

        now = timezone.now()
        manager = Company.AccountType.MANAGER
        expiring_cutoff = now + timedelta(days=EXPIRING_KEY_DAYS)
        stale_cutoff = now - timedelta(days=STALE_PRODUCT_DAYS)

        with_key_counts = Company.objects.annotate(key_count=Count("api_keys", distinct=True))
        keyless = with_key_counts.filter(key_count=0).count()
        multi_key_managers = with_key_counts.filter(account_type=manager, key_count__gt=1).count()

        # Products with no movement in the window: subtract the recently-active
        # set from the whole table. One distinct id query + one exclude count.
        recent_product_ids = set(
            Movement.objects.filter(occurred_at__gte=stale_cutoff)
            .values_list("product_model_id", flat=True)
            .distinct()
        )
        stale_products = ProductModel.objects.exclude(id__in=recent_product_ids).count()

        return [
            {
                "key": "suspended_companies",
                "label": "Suspended companies",
                "count": Company.objects.filter(is_active=False).count(),
                "severity": "warning",
                "changelist": "core_company",
                "query": "is_active__exact=0",
            },
            {
                "key": "keyless_companies",
                "label": "Companies with no API key",
                "count": keyless,
                "severity": "warning",
                "changelist": "core_company",
                "query": "",
            },
            {
                "key": "expired_keys",
                "label": "Expired API keys",
                "count": ApiKey.objects.filter(expires_at__lt=now).count(),
                "severity": "critical",
                "changelist": "core_apikey",
                "query": "",
            },
            {
                "key": "expiring_keys",
                "label": "API keys expiring within 7 days",
                "count": ApiKey.objects.filter(
                    expires_at__gte=now, expires_at__lte=expiring_cutoff
                ).count(),
                "severity": "warning",
                "changelist": "core_apikey",
                "query": "",
            },
            {
                "key": "multi_key_managers",
                "label": "Managers holding more than one API key",
                "count": multi_key_managers,
                "severity": "warning",
                "changelist": "core_company",
                "query": "account_type__exact=manager",
            },
            {
                "key": "stale_products",
                "label": "Products with no movement in 90 days",
                "count": stale_products,
                "severity": "info",
                "changelist": "inventory_productmodel",
                "query": "",
            },
            {
                "key": "open_events",
                "label": "Open event-log entries",
                "count": EventLog.objects.filter(status="OPEN").count(),
                "severity": "critical",
                "changelist": "inventory_eventlog",
                "query": "status__exact=OPEN",
            },
        ]


varasto_admin_site = VarastoAdminSite(name="varasto_admin")
