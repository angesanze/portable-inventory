"""
Platform-wide metrics aggregation API (superuser-only).

These endpoints feed the superadmin console's dashboards. Every figure is
computed with database aggregation (``aggregate``/``Count``/``Q``/``Trunc*``) —
never a per-row Python loop over the whole platform — so the cost stays flat as
tenants and movements grow. All read-only and gated on
:class:`core.permissions.IsSuperuser`; no manager or developer tenant reaches
them. See :mod:`core.platform_views` for the per-company read API.
"""

from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.insights import HealthSignals, compute_health_score
from core.models import ApiKey, Company, User
from core.permissions import IsSuperuser
from inventory.models.ledger import Movement
from inventory.models.monitoring import EventLog


class PlatformStatsView(APIView):
    """Single-shot platform totals for the console's headline KPIs.

    Returns one JSON object: company counts (total, by tier, active vs
    suspended), and platform-wide user / API-key / movement / open-event
    totals. Each metric is one aggregate query; the company breakdown collapses
    into a single ``aggregate`` of conditional counts.
    """

    permission_classes = [IsAuthenticated, IsSuperuser]

    def get(self, request):
        manager = Company.AccountType.MANAGER
        developer = Company.AccountType.DEVELOPER

        company_stats = Company.objects.aggregate(
            total=Count("id"),
            manager=Count("id", filter=Q(account_type=manager)),
            developer=Count("id", filter=Q(account_type=developer)),
            active=Count("id", filter=Q(is_active=True)),
            suspended=Count("id", filter=Q(is_active=False)),
        )

        return Response(
            {
                "companies": {
                    "total": company_stats["total"],
                    "by_tier": {
                        "manager": company_stats["manager"],
                        "developer": company_stats["developer"],
                    },
                    "active": company_stats["active"],
                    "suspended": company_stats["suspended"],
                },
                "users_total": User.objects.count(),
                "api_keys_total": ApiKey.objects.count(),
                "movements_total": Movement.objects.count(),
                "open_events_total": EventLog.objects.filter(status="OPEN").count(),
            }
        )


# Largest window the growth chart will compute, in days. Keeps an abusive
# ``?days=999999`` from forcing a full-history scan + giant payload.
MAX_GROWTH_DAYS = 365
DEFAULT_GROWTH_DAYS = 90


class PlatformGrowthView(APIView):
    """Daily growth time-series for the console's trend charts.

    Buckets company sign-ups (``Company.created_at``) and movement volume
    (``Movement.occurred_at``) by calendar day over the last ``?days=`` window
    (default 90, capped at :data:`MAX_GROWTH_DAYS`). Each series is one
    ``TruncDate`` group-by aggregate; the two are zipped into the dense,
    gap-filled ``[{date, companies, movements}]`` shape recharts expects.
    """

    permission_classes = [IsAuthenticated, IsSuperuser]

    def get(self, request):
        try:
            days = int(request.query_params.get("days", DEFAULT_GROWTH_DAYS))
        except (TypeError, ValueError):
            days = DEFAULT_GROWTH_DAYS
        days = max(1, min(days, MAX_GROWTH_DAYS))

        # Inclusive window: today and the (days - 1) days before it.
        end = timezone.localdate()
        start = end - timedelta(days=days - 1)

        companies_by_day = dict(
            Company.objects.filter(created_at__date__gte=start)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(n=Count("id"))
            .values_list("day", "n")
        )
        movements_by_day = dict(
            Movement.objects.filter(occurred_at__date__gte=start)
            .annotate(day=TruncDate("occurred_at"))
            .values("day")
            .annotate(n=Count("id"))
            .values_list("day", "n")
        )

        series = []
        for offset in range(days):
            day = start + timedelta(days=offset)
            series.append(
                {
                    "date": day.isoformat(),
                    "companies": companies_by_day.get(day, 0),
                    "movements": movements_by_day.get(day, 0),
                }
            )

        return Response(series)


# How many top consumers the api-usage endpoint returns.
DEFAULT_TOP_CONSUMERS = 10
MAX_TOP_CONSUMERS = 50
# A key is "dormant" if it has not been used within this many days (or never).
DORMANT_DAYS = 30


class PlatformApiUsageView(APIView):
    """API-key usage analytics for the console's API dashboard.

    Returns: ``top_consumers`` — the companies with the highest summed
    ``ApiKey.usage_count`` (with name + tier); ``rate_tier_distribution`` —
    key count per ``rate_limit_tier``; and ``dormant_keys`` — keys never used
    or idle for more than :data:`DORMANT_DAYS`. Each section is a single
    group-by/aggregate query, so cost stays flat as keys grow.
    """

    permission_classes = [IsAuthenticated, IsSuperuser]

    def get(self, request):
        try:
            top_n = int(request.query_params.get("top", DEFAULT_TOP_CONSUMERS))
        except (TypeError, ValueError):
            top_n = DEFAULT_TOP_CONSUMERS
        top_n = max(1, min(top_n, MAX_TOP_CONSUMERS))

        top_consumers = [
            {
                "company_id": str(row["company_id"]),
                "company_name": row["company__name"],
                "tier": row["company__account_type"],
                "usage_count": row["total_usage"] or 0,
            }
            for row in (
                ApiKey.objects.values("company_id", "company__name", "company__account_type")
                .annotate(total_usage=Sum("usage_count"))
                .order_by("-total_usage")[:top_n]
            )
        ]

        # Dense per-tier counts: start from every defined tier at 0 so the
        # console always renders the full distribution, then overlay actuals.
        rate_tier_distribution = {tier.value: 0 for tier in ApiKey.RateLimitTier}
        for row in ApiKey.objects.values("rate_limit_tier").annotate(n=Count("id")):
            rate_tier_distribution[row["rate_limit_tier"]] = row["n"]

        cutoff = timezone.now() - timedelta(days=DORMANT_DAYS)
        dormant_keys = ApiKey.objects.filter(
            Q(last_used_at__isnull=True) | Q(last_used_at__lt=cutoff)
        ).count()

        return Response(
            {
                "top_consumers": top_consumers,
                "rate_tier_distribution": rate_tier_distribution,
                "dormant_keys": dormant_keys,
            }
        )


# A company is "dormant" if no movement has been recorded for it within this
# many days. Matches the key-dormancy window used above for consistency.
DORMANT_COMPANY_DAYS = 30
# An ApiKey is "expiring soon" if it expires within this many days.
EXPIRING_KEY_DAYS = 7


class PlatformInsightsView(APIView):
    """Anomaly detection for the console's intelligence panel.

    Surfaces actionable problems before they're reported as a flat list of
    ``{kind, severity, company_id, company_name, detail, suggested_action}``.
    Severity is one of ``info`` / ``warning`` / ``critical``. Every detector is
    a single DB query (counts annotated onto ``Company``, set membership for
    movement recency, key scans with ``select_related``) — never a per-row
    Python loop over a whole table — so cost stays flat as the platform grows.

    Detected kinds: ``dormant`` (active company, no movement in
    :data:`DORMANT_COMPANY_DAYS` days), ``keyless`` (no API key), ``userless``
    (no users), ``multi_key_manager`` (a manager with >1 key — violates the
    one-key invariant), ``expiring_key`` (key expires within
    :data:`EXPIRING_KEY_DAYS` days), ``expired_key`` (expired but still active),
    and ``suspended`` (deactivated company).
    """

    permission_classes = [IsAuthenticated, IsSuperuser]

    def get(self, request):
        now = timezone.now()
        movement_cutoff = now - timedelta(days=DORMANT_COMPANY_DAYS)
        manager = Company.AccountType.MANAGER

        # Company ids that have at least one recent movement. One query; the
        # membership test below stays in Python over the (small) company list.
        active_company_ids = set(
            Movement.objects.filter(occurred_at__gte=movement_cutoff)
            .values_list("product_model__company_id", flat=True)
            .distinct()
        )

        anomalies = []

        # Per-company anomalies: annotate counts so one query covers
        # keyless / userless / multi_key_manager / dormant / suspended.
        companies = Company.objects.annotate(
            user_count=Count("users", distinct=True),
            key_count=Count("api_keys", distinct=True),
        )
        for company in companies:
            cid, cname = str(company.id), company.name

            if not company.is_active:
                anomalies.append(
                    {
                        "kind": "suspended",
                        "severity": "info",
                        "company_id": cid,
                        "company_name": cname,
                        "detail": "Company is currently suspended.",
                        "suggested_action": "Reactivate if the suspension is no longer warranted.",
                    }
                )
                # A suspended company's other "anomalies" are expected; skip them.
                continue

            if company.key_count == 0:
                anomalies.append(
                    {
                        "kind": "keyless",
                        "severity": "warning",
                        "company_id": cid,
                        "company_name": cname,
                        "detail": "Company has no API key.",
                        "suggested_action": "Provision an API key so the tenant can integrate.",
                    }
                )

            if company.user_count == 0:
                anomalies.append(
                    {
                        "kind": "userless",
                        "severity": "warning",
                        "company_id": cid,
                        "company_name": cname,
                        "detail": "Company has no users.",
                        "suggested_action": "Invite at least one administrator.",
                    }
                )

            if company.account_type == manager and company.key_count > 1:
                anomalies.append(
                    {
                        "kind": "multi_key_manager",
                        "severity": "warning",
                        "company_id": cid,
                        "company_name": cname,
                        "detail": f"Manager company has {company.key_count} API keys "
                        "(violates the one-key invariant).",
                        "suggested_action": "Revoke extra keys; a manager should hold exactly one.",
                    }
                )

            if company.id not in active_company_ids:
                anomalies.append(
                    {
                        "kind": "dormant",
                        "severity": "warning",
                        "company_id": cid,
                        "company_name": cname,
                        "detail": f"No movement recorded in the last {DORMANT_COMPANY_DAYS} days.",
                        "suggested_action": "Check in with the tenant; the account may be abandoned.",
                    }
                )

        # Per-key anomalies (expiring / expired). Each is one query with the
        # company joined in, so we never re-query per row.
        expiring_cutoff = now + timedelta(days=EXPIRING_KEY_DAYS)
        for key in ApiKey.objects.filter(
            is_active=True,
            expires_at__gte=now,
            expires_at__lte=expiring_cutoff,
        ).select_related("company"):
            anomalies.append(
                {
                    "kind": "expiring_key",
                    "severity": "warning",
                    "company_id": str(key.company_id),
                    "company_name": key.company.name,
                    "detail": f'API key "{key.label}" expires on {key.expires_at.date().isoformat()}.',
                    "suggested_action": "Rotate or renew the key before it expires.",
                }
            )

        for key in ApiKey.objects.filter(is_active=True, expires_at__lt=now).select_related(
            "company"
        ):
            anomalies.append(
                {
                    "kind": "expired_key",
                    "severity": "critical",
                    "company_id": str(key.company_id),
                    "company_name": key.company.name,
                    "detail": f'API key "{key.label}" expired on {key.expires_at.date().isoformat()} '
                    "but is still active.",
                    "suggested_action": "Deactivate or rotate the expired key immediately.",
                }
            )

        return Response(anomalies)


class PlatformHealthView(APIView):
    """Per-company health scores for the console's intelligence panel.

    Returns ``[{company_id, company_name, score, factors}]`` sorted ascending
    (worst first) so the superadmin's eye lands on the companies that need
    attention. The 0-100 score is computed by the pure
    :func:`core.insights.compute_health_score`; this view's only job is to gather
    the signals with the same flat-cost DB aggregation the anomaly detector uses
    (annotated counts + one movement-recency set) and hand them off.
    """

    permission_classes = [IsAuthenticated, IsSuperuser]

    def get(self, request):
        now = timezone.now()
        movement_cutoff = now - timedelta(days=DORMANT_COMPANY_DAYS)
        manager = Company.AccountType.MANAGER

        active_company_ids = set(
            Movement.objects.filter(occurred_at__gte=movement_cutoff)
            .values_list("product_model__company_id", flat=True)
            .distinct()
        )

        companies = Company.objects.annotate(
            user_count=Count("users", distinct=True),
            key_count=Count("api_keys", distinct=True),
        )

        rows = []
        for company in companies:
            has_recent = company.id in active_company_ids

            # Count the same anomaly kinds PlatformInsightsView surfaces, so the
            # ``no_anomalies`` bonus stays consistent with the anomaly feed. A
            # suspended company short-circuits (its other flags are expected).
            anomaly_count = 0
            if not company.is_active:
                anomaly_count = 1
            else:
                if company.key_count == 0:
                    anomaly_count += 1
                if company.user_count == 0:
                    anomaly_count += 1
                if company.account_type == manager and company.key_count > 1:
                    anomaly_count += 1
                if not has_recent:
                    anomaly_count += 1

            signals = HealthSignals(
                is_active=company.is_active,
                has_users=company.user_count > 0,
                has_key=company.key_count > 0,
                has_recent_activity=has_recent,
                anomaly_count=anomaly_count,
            )
            score, factors = compute_health_score(signals)
            rows.append(
                {
                    "company_id": str(company.id),
                    "company_name": company.name,
                    "score": score,
                    "factors": factors,
                }
            )

        rows.sort(key=lambda r: r["score"])  # worst first
        return Response(rows)
