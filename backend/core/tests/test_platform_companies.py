"""Platform company read API — SUPERADMIN-01 task 4.

The platform list (`GET /api/v1/platform/companies/`) is the superuser-only
data spine for the superadmin console: it lists EVERY company on the
deployment (managers and developers), annotated with per-company counts and
last activity. The security gate is the headline assertion — no tenant, manager
*or* developer, ever reaches it (developers see only their own children via
`/tenants`). Mirrors the APIClient style of ``core/tests/test_default_key.py``.
"""

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.audit import record_audit
from core.models import ApiKey, AuditLog, Company, User
from core.provisioning import provision_manager_company
from inventory.models.core import Location, ProductModel
from inventory.models.ledger import Movement

PLATFORM_URL = '/api/v1/platform/companies/'


def _superuser_client():
    superuser = User.objects.create_superuser(
        username='platform-admin', password='password123',
    )
    client = APIClient()
    client.force_authenticate(user=superuser)
    return client, superuser


def _manager(company_name='Mgr Co', **kwargs):
    company, api_key, _value = provision_manager_company(name=company_name, **kwargs)
    user = User.objects.create_user(
        username=f'mgr-{company.id}', password='password123',
        company=company, role='Admin',
    )
    return company, user


def _developer(name='Dev Co'):
    company = Company.objects.create(
        name=name, account_type=Company.AccountType.DEVELOPER,
    )
    user = User.objects.create_user(
        username=f'dev-{company.id}', password='password123',
        company=company, role='Admin',
    )
    return company, user


def _record_movement(company, *, occurred_at):
    """Post a movement for ``company`` so its ``last_activity`` is set.

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


@pytest.mark.django_db
class TestPlatformCompanyList:
    def test_superuser_lists_all_companies_with_counts(self):
        """Superuser GET → 200 listing managers AND developers, with counts."""
        manager, _ = _manager(company_name='Manager One')
        developer, _ = _developer(name='Developer One')
        client, _superuser = _superuser_client()

        response = client.get(PLATFORM_URL)

        assert response.status_code == status.HTTP_200_OK
        results = response.data['results'] if 'results' in response.data else response.data
        by_id = {row['id']: row for row in results}
        assert str(manager.id) in by_id
        assert str(developer.id) in by_id
        # The manager was provisioned with exactly one Default Key.
        assert by_id[str(manager.id)]['api_keys_count'] == 1
        assert by_id[str(manager.id)]['account_type'] == 'manager'
        assert by_id[str(developer.id)]['account_type'] == 'developer'

    def test_manager_is_forbidden(self):
        """SECURITY GATE: a manager tenant never reaches the platform list."""
        _company, manager = _manager()
        client = APIClient()
        client.force_authenticate(user=manager)

        response = client.get(PLATFORM_URL)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_developer_is_forbidden(self):
        """SECURITY GATE: a developer sees only its children, never the platform."""
        _company, developer = _developer()
        client = APIClient()
        client.force_authenticate(user=developer)

        response = client.get(PLATFORM_URL)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_filter_by_account_type(self):
        """?account_type=developer returns developers only."""
        manager, _ = _manager(company_name='Manager Filtered')
        developer, _ = _developer(name='Developer Filtered')
        client, _superuser = _superuser_client()

        response = client.get(PLATFORM_URL, {'account_type': 'developer'})

        assert response.status_code == status.HTTP_200_OK
        results = response.data['results'] if 'results' in response.data else response.data
        ids = {row['id'] for row in results}
        assert str(developer.id) in ids
        assert str(manager.id) not in ids
        assert all(row['account_type'] == 'developer' for row in results)

    def test_search_matches_name_and_vat(self):
        """?search= matches by name and by VAT (icontains)."""
        named, _ = _manager(company_name='Acme Logistics')
        vat_company = Company.objects.create(
            name='Other Co', account_type=Company.AccountType.MANAGER,
            vat='12345678901',
        )
        client, _superuser = _superuser_client()

        by_name = client.get(PLATFORM_URL, {'search': 'Acme'})
        assert by_name.status_code == status.HTTP_200_OK
        name_results = by_name.data['results'] if 'results' in by_name.data else by_name.data
        name_ids = {row['id'] for row in name_results}
        assert str(named.id) in name_ids
        assert str(vat_company.id) not in name_ids

        by_vat = client.get(PLATFORM_URL, {'search': '1234567'})
        assert by_vat.status_code == status.HTTP_200_OK
        vat_results = by_vat.data['results'] if 'results' in by_vat.data else by_vat.data
        vat_ids = {row['id'] for row in vat_results}
        assert str(vat_company.id) in vat_ids
        assert str(named.id) not in vat_ids

    def test_last_activity_reflects_latest_movement(self):
        """last_activity is the most recent Movement.occurred_at for the company."""
        company, _ = _manager(company_name='Active Co')
        older = timezone.now() - timezone.timedelta(days=3)
        latest = timezone.now() - timezone.timedelta(hours=1)
        _record_movement(company, occurred_at=older)
        _record_movement(company, occurred_at=latest)
        client, _superuser = _superuser_client()

        response = client.get(PLATFORM_URL, {'search': 'Active Co'})

        assert response.status_code == status.HTTP_200_OK
        results = response.data['results'] if 'results' in response.data else response.data
        row = next(r for r in results if r['id'] == str(company.id))
        assert row['last_activity'] is not None
        # Serialized as ISO; the latest movement wins over the older one.
        assert row['last_activity'].startswith(latest.strftime('%Y-%m-%dT%H'))


@pytest.mark.django_db
class TestPlatformCompanyDetail:
    """Drill-down (`GET /platform/companies/{id}/`) for the console detail drawer.

    The list row carries only counts; the detail endpoint embeds the company's
    users, API keys (with usage telemetry) and recent audit activity.
    """

    def test_detail_embeds_users_api_keys_and_activity(self):
        company, user = _manager(company_name='Detail Co')
        # The manager was provisioned with one Default Key; tag it with usage so
        # the telemetry fields are exercised.
        key = company.api_keys.get()
        key.usage_count = 42
        key.last_used_at = timezone.now()
        key.rate_limit_tier = ApiKey.RateLimitTier.PREMIUM
        key.save(update_fields=['usage_count', 'last_used_at', 'rate_limit_tier'])
        record_audit(user, AuditLog.Action.LOGIN, target_company=company)
        client, _superuser = _superuser_client()

        response = client.get(f'{PLATFORM_URL}{company.id}/')

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        # Users
        usernames = {u['username'] for u in data['users']}
        assert user.username in usernames
        # API keys carry the usage telemetry the drawer renders.
        assert len(data['api_keys']) == 1
        key_row = data['api_keys'][0]
        assert key_row['usage_count'] == 42
        assert key_row['rate_limit_tier'] == 'premium'
        assert key_row['last_used_at'] is not None
        # Recent activity surfaces the audit entry that targeted the company.
        actions = {a['action'] for a in data['recent_activity']}
        assert AuditLog.Action.LOGIN in actions

    def test_developer_detail_lists_children_summary(self):
        developer, _ = _developer(name='Parent Dev')
        child = Company.objects.create(
            name='Owned Mgr', account_type=Company.AccountType.MANAGER,
            parent=developer,
        )
        client, _superuser = _superuser_client()

        response = client.get(f'{PLATFORM_URL}{developer.id}/')

        assert response.status_code == status.HTTP_200_OK
        child_ids = {c['id'] for c in response.data['children_summary']}
        assert str(child.id) in child_ids

    def test_manager_is_forbidden_from_detail(self):
        """SECURITY GATE: a tenant never reaches the platform detail endpoint."""
        company, manager = _manager(company_name='Forbidden Co')
        client = APIClient()
        client.force_authenticate(user=manager)

        response = client.get(f'{PLATFORM_URL}{company.id}/')

        assert response.status_code == status.HTTP_403_FORBIDDEN
