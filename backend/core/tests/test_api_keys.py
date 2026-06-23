from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from core.models import Company, ApiKey

User = get_user_model()


class DeveloperApiKeyTests(APITestCase):
    """Developers/superusers may fully manage keys (manage_api_keys=true)."""

    def setUp(self):
        # A developer company carries the manage_api_keys capability.
        self.company = Company.objects.create(
            name="Dev Corp", license_code="DEVKEY",
            account_type=Company.AccountType.DEVELOPER,
        )
        self.user = User.objects.create_user(
            username='devadmin', password='password123',
            company=self.company, role='Admin'
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse('api-key-list')

    def test_create_api_key(self):
        """Ensure a developer can create a new API key"""
        data = {'label': 'Integration Key'}
        response = self.client.post(self.url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ApiKey.objects.count(), 1)
        created_key = ApiKey.objects.get()
        self.assertEqual(created_key.label, 'Integration Key')
        # SEC-03: the plaintext is revealed once in the response; the DB stores
        # only the hash, never the live credential.
        self.assertTrue(response.data.get('key'))
        self.assertTrue(created_key.key_hash)
        self.assertFalse(created_key.key)

    def test_list_api_keys(self):
        """Ensure a developer lists only their own keys"""
        ApiKey.objects.create(company=self.company, key="key1", label="Key 1")

        # Another company
        other_company = Company.objects.create(name="Other Corp", license_code="OTHKEY")
        ApiKey.objects.create(company=other_company, key="key2", label="Key 2")

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check if response is paginated or list
        if isinstance(response.data, list):
            results = response.data
        else:
            results = response.data.get('results', [])

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['label'], "Key 1")

    def test_delete_api_key(self):
        """Ensure a developer can revoke/delete a key"""
        key = ApiKey.objects.create(company=self.company, key="key1", label="Key 1")
        url = reverse('api-key-detail', args=[key.id])

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(ApiKey.objects.count(), 0)


class ManagerApiKeyHiddenTests(APITestCase):
    """Managers never manage keys — the gate enforces manage_api_keys=false.

    Their single auto-created ``Default Key`` stays hidden; the dashboard
    surfaces no key-management path to them, and the server denies every
    list/create/rotate/delete attempt regardless of the UI.
    """

    def setUp(self):
        # Default account_type is MANAGER.
        self.company = Company.objects.create(name="Mgr Corp", license_code="MGRKEY")
        self.user = User.objects.create_user(
            username='mgradmin', password='password123',
            company=self.company, role='Admin'
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse('api-key-list')

    def test_manager_cannot_list_keys(self):
        ApiKey.objects.create(company=self.company, key="key1", label="Default Key")
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_cannot_create_key(self):
        response = self.client.post(self.url, {'label': 'Sneaky Key'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # No extra key minted by the manager.
        self.assertEqual(ApiKey.objects.filter(company=self.company).count(), 0)

    def test_manager_cannot_delete_key(self):
        key = ApiKey.objects.create(company=self.company, key="key1", label="Default Key")
        url = reverse('api-key-detail', args=[key.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ApiKey.objects.filter(pk=key.id).exists())

    def test_manager_cannot_rotate_key(self):
        key = ApiKey.objects.create(company=self.company, key="key1", label="Default Key")
        url = reverse('api-key-rotate', args=[key.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
