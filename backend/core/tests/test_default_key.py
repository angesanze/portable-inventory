"""Read-only "my default key" endpoint — DUAL-TIER-09 task 3.

A manager owns exactly one hidden ``Default Key`` it can neither list, create,
rotate nor delete (``manage_api_keys=false``). The ``GET /api/v1/api-keys/default/``
action drops the viewset-level gate so any authenticated tier can fetch its OWN
company's single key for QR generation — while list/create stay 403 for managers.
The endpoint is always scoped to ``request.user.company`` (no cross-company leak)
and auto-creates a key so a manager is never keyless.
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Company, ApiKey, User
from core.provisioning import provision_manager_company


@pytest.mark.django_db
class TestDefaultKeyEndpoint:
    def _manager_client(self, company_name='Mgr Co'):
        company, api_key, _value = provision_manager_company(name=company_name)
        manager = User.objects.create_user(
            username=f'mgr-{company.id}', password='password123',
            company=company, role='Admin',
        )
        client = APIClient()
        client.force_authenticate(user=manager)
        return client, company, api_key

    def test_manager_can_read_default_key(self):
        """Manager GET default → 200 with its key despite manage_api_keys=false."""
        client, company, api_key = self._manager_client()

        response = client.get('/api/v1/api-keys/default/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(api_key.id)
        assert response.data['key'] == api_key.key
        assert response.data['label'] == 'Default Key'

    def test_manager_list_still_forbidden(self):
        """The manage_api_keys gate still blocks listing for managers."""
        client, _company, _api_key = self._manager_client()

        response = client.get('/api/v1/api-keys/')

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_create_still_forbidden(self):
        """The manage_api_keys gate still blocks creation for managers."""
        client, company, _api_key = self._manager_client()

        response = client.post('/api/v1/api-keys/', {'label': 'Sneaky Key'}, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert ApiKey.objects.filter(company=company).count() == 1

    def test_default_never_returns_another_companys_key(self):
        """Two companies → each sees only its own key (no cross-tenant leak)."""
        client_a, _company_a, api_key_a = self._manager_client(company_name='Company A')
        _client_b, _company_b, api_key_b = self._manager_client(company_name='Company B')

        response = client_a.get('/api/v1/api-keys/default/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(api_key_a.id)
        assert response.data['id'] != str(api_key_b.id)
        assert response.data['key'] != api_key_b.key

    def test_keyless_company_auto_creates_key(self):
        """A company with zero keys gets one auto-created on first call."""
        company = Company.objects.create(
            name='Keyless Co', license_code='KEYLESS',
            account_type=Company.AccountType.MANAGER,
        )
        user = User.objects.create_user(
            username='keyless-admin', password='password123',
            company=company, role='Admin',
        )
        assert ApiKey.objects.filter(company=company).count() == 0
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get('/api/v1/api-keys/default/')

        assert response.status_code == status.HTTP_200_OK
        assert ApiKey.objects.filter(company=company).count() == 1
        created = ApiKey.objects.get(company=company)
        assert response.data['id'] == str(created.id)
        assert response.data['key'] == created.key
        assert created.label == 'Default Key'
