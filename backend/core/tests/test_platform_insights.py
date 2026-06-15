"""Platform intelligence: anomalies & health score — SUPERADMIN-05 task 5.

Covers the two superuser-only intelligence endpoints plus the pure scorer:

* ``GET /api/v1/platform/insights/`` — detected anomalies feed.
* ``GET /api/v1/platform/insights/health/`` — per-company health scores.
* :func:`core.insights.compute_health_score` — direct unit tests.

The security gate (case 6: a non-superuser tenant gets 403) is the headline
assertion — no manager or developer ever reaches platform-wide intelligence.
Mirrors the APIClient style of ``core/tests/test_platform_metrics.py``.
"""

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.insights import WEIGHTS, HealthSignals, compute_health_score
from core.models import ApiKey, Company, User
from core.provisioning import provision_manager_company
from inventory.models.core import Location, ProductModel
from inventory.models.ledger import Movement

INSIGHTS_URL = '/api/v1/platform/insights/'
HEALTH_URL = '/api/v1/platform/insights/health/'


def _superuser_client():
    superuser = User.objects.create_superuser(
        username='platform-admin', password='password123',
    )
    client = APIClient()
    client.force_authenticate(user=superuser)
    return client, superuser


def _manager(company_name='Mgr Co', **kwargs):
    """Provision a manager company (seeded with exactly one Default Key)."""
    company, _api_key, _value = provision_manager_company(name=company_name, **kwargs)
    user = User.objects.create_user(
        username=f'mgr-{company.id}', password='password123',
        company=company, role='Admin',
    )
    return company, user


def _developer(name='Dev Co', with_user=True):
    """Create a developer company directly (no seeded key)."""
    company = Company.objects.create(
        name=name, account_type=Company.AccountType.DEVELOPER,
    )
    user = None
    if with_user:
        user = User.objects.create_user(
            username=f'dev-{company.id}', password='password123',
            company=company, role='Admin',
        )
    return company, user


def _record_movement(company, *, occurred_at):
    """Post a movement for ``company`` so recency detection picks it up.

    A movement is tied to a company through its ``product_model``; both
    locations must belong to the same company to pass model validation.
    """
    suffix = Movement.objects.count()
    product = ProductModel.objects.create(
        company=company, sku=f'SKU-{company.id}-{suffix}', name='Widget',
    )
    src = Location.objects.create(company=company, name=f'Src-{suffix}', type='VIRTUAL')
    dst = Location.objects.create(company=company, name=f'Dst-{suffix}', type='WAREHOUSE')
    return Movement.objects.create(
        product_model=product, from_location=src, to_location=dst,
        quantity=5, occurred_at=occurred_at,
    )


def _anomaly_kinds_for(anomalies, company):
    """Kinds detected for a given company in the anomaly feed."""
    cid = str(company.id)
    return {a['kind'] for a in anomalies if a['company_id'] == cid}


@pytest.mark.django_db
class TestInsightsAnomalies:
    def test_dormant_company_with_no_recent_movement(self):
        """A company whose only movement is 40 days old appears as ``dormant``."""
        company, _ = _manager(company_name='Sleepy Co')
        _record_movement(company, occurred_at=timezone.now() - timezone.timedelta(days=40))

        client, _superuser = _superuser_client()
        response = client.get(INSIGHTS_URL)

        assert response.status_code == status.HTTP_200_OK
        assert 'dormant' in _anomaly_kinds_for(response.data, company)

    def test_keyless_company(self):
        """A developer with no API key appears as ``keyless``."""
        company, _ = _developer(name='Keyless Co')
        # Give it a recent movement so dormancy doesn't muddy the assertion.
        _record_movement(company, occurred_at=timezone.now())

        client, _superuser = _superuser_client()
        response = client.get(INSIGHTS_URL)

        assert response.status_code == status.HTTP_200_OK
        kinds = _anomaly_kinds_for(response.data, company)
        assert 'keyless' in kinds

    def test_manager_with_two_keys_is_multi_key_manager(self):
        """A manager holding >1 key violates the one-key invariant."""
        company, _ = _manager(company_name='Greedy Co')  # seeded with 1 key
        ApiKey.objects.create(company=company, key='extra-key', label='Extra')
        _record_movement(company, occurred_at=timezone.now())

        client, _superuser = _superuser_client()
        response = client.get(INSIGHTS_URL)

        assert response.status_code == status.HTTP_200_OK
        assert 'multi_key_manager' in _anomaly_kinds_for(response.data, company)


@pytest.mark.django_db
class TestInsightsHealth:
    def test_healthy_company_scores_high_with_no_critical_anomaly(self):
        """Active manager: recent movement, 1 key, 1 user → high score, no critical."""
        company, _ = _manager(company_name='Healthy Co')
        _record_movement(company, occurred_at=timezone.now())

        client, _superuser = _superuser_client()

        anomalies = client.get(INSIGHTS_URL)
        assert anomalies.status_code == status.HTTP_200_OK
        cid = str(company.id)
        criticals = [
            a for a in anomalies.data
            if a['company_id'] == cid and a['severity'] == 'critical'
        ]
        assert criticals == []

        health = client.get(HEALTH_URL)
        assert health.status_code == status.HTTP_200_OK
        row = next(r for r in health.data if r['company_id'] == cid)
        assert row['score'] == 100  # every positive signal, no anomalies

    def test_health_sorted_worst_first(self):
        """Scores are returned ascending so the neediest company leads."""
        healthy, _ = _manager(company_name='Healthy Co')
        _record_movement(healthy, occurred_at=timezone.now())
        # A keyless, userless, movement-less developer — the worst case.
        _developer(name='Neglected Co', with_user=False)

        client, _superuser = _superuser_client()
        response = client.get(HEALTH_URL)

        assert response.status_code == status.HTTP_200_OK
        scores = [r['score'] for r in response.data]
        assert scores == sorted(scores)


class TestComputeHealthScore:
    """Direct unit tests of the pure scorer — no DB, no Django."""

    def test_all_positive_signals_score_100(self):
        score, factors = compute_health_score(HealthSignals(
            is_active=True, has_users=True, has_key=True,
            has_recent_activity=True, anomaly_count=0,
        ))
        assert score == 100
        assert factors == WEIGHTS

    def test_all_negative_signals_score_0(self):
        score, factors = compute_health_score(HealthSignals(
            is_active=False, has_users=False, has_key=False,
            has_recent_activity=False, anomaly_count=3,
        ))
        assert score == 0
        assert all(points == 0 for points in factors.values())

    def test_score_in_range_and_deterministic(self):
        """Output is always 0-100 and identical for identical input."""
        signals = HealthSignals(
            is_active=True, has_users=True, has_key=False,
            has_recent_activity=False, anomaly_count=2,
        )
        first = compute_health_score(signals)
        second = compute_health_score(signals)
        score, _ = first
        assert 0 <= score <= 100
        assert first == second  # deterministic


@pytest.mark.django_db
class TestInsightsSecurityGate:
    """SECURITY GATE (case 6): a non-superuser never reaches intelligence."""

    def test_manager_forbidden_on_insights(self):
        _company, manager = _manager(company_name='Plain Manager')
        client = APIClient()
        client.force_authenticate(user=manager)

        response = client.get(INSIGHTS_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_forbidden_on_health(self):
        _company, manager = _manager(company_name='Plain Manager')
        client = APIClient()
        client.force_authenticate(user=manager)

        response = client.get(HEALTH_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN
