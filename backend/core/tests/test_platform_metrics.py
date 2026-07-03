"""Platform metrics aggregation API — SUPERADMIN-03 task 4.

Covers the three superuser-only aggregation endpoints that feed the console's
dashboards:

* ``GET /api/v1/platform/stats/`` — headline totals.
* ``GET /api/v1/platform/stats/growth/`` — daily sign-up / movement time-series.
* ``GET /api/v1/platform/stats/api-usage/`` — API-key usage analytics.

The security gate (case 2: a non-superuser tenant gets 403) is the headline
assertion — no manager or developer ever reaches platform-wide aggregates.
Mirrors the APIClient style of ``core/tests/test_platform_companies.py``.
"""

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import ApiKey, Company, User
from core.provisioning import provision_manager_company
from inventory.models.core import Location, ProductModel
from inventory.models.ledger import Movement
from inventory.models.monitoring import EventLog

STATS_URL = "/api/v1/platform/stats/"
GROWTH_URL = "/api/v1/platform/stats/growth/"
API_USAGE_URL = "/api/v1/platform/stats/api-usage/"


def _superuser_client():
    superuser = User.objects.create_superuser(
        username="platform-admin",
        password="password123",
    )
    client = APIClient()
    client.force_authenticate(user=superuser)
    return client, superuser


def _manager(company_name="Mgr Co", **kwargs):
    """Provision a manager company (seeded with exactly one Default Key)."""
    company, _api_key, _value = provision_manager_company(name=company_name, **kwargs)
    user = User.objects.create_user(
        username=f"mgr-{company.id}",
        password="password123",
        company=company,
        role="Admin",
    )
    return company, user


def _developer(name="Dev Co"):
    """Create a developer company directly (no seeded key)."""
    company = Company.objects.create(
        name=name,
        account_type=Company.AccountType.DEVELOPER,
    )
    user = User.objects.create_user(
        username=f"dev-{company.id}",
        password="password123",
        company=company,
        role="Admin",
    )
    return company, user


def _record_movement(company, *, occurred_at):
    """Post a movement for ``company`` so totals / growth pick it up.

    A movement is tied to a company through its ``product_model``; both
    locations must belong to the same company to pass model validation.
    """
    suffix = Movement.objects.count()
    product = ProductModel.objects.create(
        company=company,
        sku=f"SKU-{company.id}-{suffix}",
        name="Widget",
    )
    src = Location.objects.create(company=company, name=f"Src-{suffix}", type="VIRTUAL")
    dst = Location.objects.create(company=company, name=f"Dst-{suffix}", type="WAREHOUSE")
    return Movement.objects.create(
        product_model=product,
        from_location=src,
        to_location=dst,
        quantity=5,
        occurred_at=occurred_at,
    )


def _event(company, *, status_value="OPEN"):
    """Create an EventLog hung off a product owned by ``company``."""
    suffix = EventLog.objects.count()
    product = ProductModel.objects.create(
        company=company,
        sku=f"EVT-{company.id}-{suffix}",
        name="Monitored",
    )
    return EventLog.objects.create(
        product=product,
        message="boom",
        status=status_value,
    )


@pytest.mark.django_db
class TestPlatformStats:
    def test_superuser_stats_returns_correct_counts(self):
        """Superuser GET → 200 with correct counts for a seeded fixture.

        Fixture: 2 managers + 1 developer; one manager suspended; one extra key
        added on top of the two seeded default keys; 3 movements; 2 OPEN + 1
        RESOLVED event.
        """
        mgr_a, _ = _manager(company_name="Manager A")
        mgr_b, _ = _manager(company_name="Manager B")
        dev, _ = _developer(name="Developer A")

        # Suspend one manager to exercise the active/suspended split.
        mgr_b.is_active = False
        mgr_b.save()

        # One extra key on top of the two seeded "Default Key"s → 3 total.
        ApiKey.objects.create(company=mgr_a, key="extra-key", label="Extra")

        now = timezone.now()
        for _ in range(3):
            _record_movement(mgr_a, occurred_at=now)

        _event(mgr_a, status_value="OPEN")
        _event(mgr_a, status_value="OPEN")
        _event(mgr_a, status_value="RESOLVED")

        client, _superuser = _superuser_client()
        response = client.get(STATS_URL)

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["companies"]["total"] == 3
        assert data["companies"]["by_tier"] == {"manager": 2, "developer": 1}
        assert data["companies"]["active"] == 2
        assert data["companies"]["suspended"] == 1
        # superuser + 2 manager admins + 1 developer admin.
        assert data["users_total"] == 4
        assert data["api_keys_total"] == 3
        assert data["movements_total"] == 3
        assert data["open_events_total"] == 2

    def test_manager_is_forbidden(self):
        """SECURITY GATE: a manager tenant never reaches platform stats."""
        _company, manager = _manager()
        client = APIClient()
        client.force_authenticate(user=manager)

        response = client.get(STATS_URL)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_developer_is_forbidden(self):
        """SECURITY GATE: a developer never reaches platform stats either."""
        _company, developer = _developer()
        client = APIClient()
        client.force_authenticate(user=developer)

        response = client.get(STATS_URL)

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestPlatformGrowth:
    def test_growth_returns_daily_buckets_respecting_days(self):
        """?days=N returns exactly N contiguous daily buckets with the right counts."""
        company, _ = _manager(company_name="Growth Co")

        today = timezone.localdate()
        # Two movements today, one yesterday.
        now = timezone.now()
        _record_movement(company, occurred_at=now)
        _record_movement(company, occurred_at=now)
        _record_movement(company, occurred_at=now - timezone.timedelta(days=1))

        client, _superuser = _superuser_client()
        response = client.get(GROWTH_URL, {"days": 7})

        assert response.status_code == status.HTTP_200_OK
        series = response.data
        assert isinstance(series, list)
        assert len(series) == 7

        by_date = {row["date"]: row for row in series}
        today_key = today.isoformat()
        yday_key = (today - timezone.timedelta(days=1)).isoformat()
        assert by_date[today_key]["movements"] == 2
        assert by_date[yday_key]["movements"] == 1
        # The company itself was created today → one sign-up bucket today.
        assert by_date[today_key]["companies"] == 1

    def test_growth_days_param_is_clamped(self):
        """An over-large ?days= is capped at the configured max (365)."""
        _manager(company_name="Clamp Co")
        client, _superuser = _superuser_client()

        response = client.get(GROWTH_URL, {"days": 999999})

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 365


@pytest.mark.django_db
class TestPlatformApiUsage:
    def test_api_usage_ranks_top_consumers_and_distributes_tiers(self):
        """Top consumers are ranked by summed usage; rate tiers are dense."""
        heavy, _ = _manager(company_name="Heavy User")
        light, _ = _manager(company_name="Light User")

        # provision seeds each manager a default key (free tier, usage 0).
        # Heavy gets the most usage across two keys; light gets a little.
        ApiKey.objects.create(
            company=heavy,
            key="heavy-1",
            label="H1",
            usage_count=600,
            rate_limit_tier=ApiKey.RateLimitTier.PREMIUM,
        )
        ApiKey.objects.create(
            company=heavy,
            key="heavy-2",
            label="H2",
            usage_count=400,
            rate_limit_tier=ApiKey.RateLimitTier.STANDARD,
        )
        ApiKey.objects.create(
            company=light,
            key="light-1",
            label="L1",
            usage_count=50,
            rate_limit_tier=ApiKey.RateLimitTier.STANDARD,
        )

        client, _superuser = _superuser_client()
        response = client.get(API_USAGE_URL)

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        top = data["top_consumers"]
        # Heavy (1000) outranks Light (50); both appear.
        assert top[0]["company_name"] == "Heavy User"
        assert top[0]["usage_count"] == 1000
        assert top[0]["tier"] == "manager"
        light_row = next(r for r in top if r["company_name"] == "Light User")
        assert light_row["usage_count"] == 50

        # Dense distribution over every defined tier. Seeded default keys are
        # free (2), plus premium (1) and standard (2) added above.
        dist = data["rate_tier_distribution"]
        assert set(dist.keys()) == {"free", "standard", "premium"}
        assert dist["free"] == 2
        assert dist["standard"] == 2
        assert dist["premium"] == 1

    def test_api_usage_counts_dormant_keys(self):
        """Keys never used or idle > 30 days count as dormant."""
        company, _ = _manager(company_name="Dormancy Co")

        old = timezone.now() - timezone.timedelta(days=45)
        ApiKey.objects.create(
            company=company,
            key="stale",
            label="Stale",
            last_used_at=old,
        )
        ApiKey.objects.create(
            company=company,
            key="fresh",
            label="Fresh",
            last_used_at=timezone.now(),
        )

        client, _superuser = _superuser_client()
        response = client.get(API_USAGE_URL)

        assert response.status_code == status.HTTP_200_OK
        # The seeded default key (last_used_at=None) + the stale key = 2 dormant.
        assert response.data["dormant_keys"] == 2

    def test_non_superuser_is_forbidden(self):
        """SECURITY GATE: a manager tenant never reaches API-usage analytics."""
        _company, manager = _manager()
        client = APIClient()
        client.force_authenticate(user=manager)

        response = client.get(API_USAGE_URL)

        assert response.status_code == status.HTTP_403_FORBIDDEN
