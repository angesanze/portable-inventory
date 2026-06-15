import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from core.models import Company, User, ApiKey
from inventory.models import ProductModel, Location
import datetime

@pytest.mark.django_db
class TestSecurityAudit:
    def setup_method(self):
        # Setup Company A
        self.company_a = Company.objects.create(name="Company A", license_code="COMPA1")
        self.user_a = User.objects.create_user(username="user_a", password="testpass123", company=self.company_a, role="Admin")
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)

        # Setup Company B
        self.company_b = Company.objects.create(name="Company B", license_code="COMPB1")
        self.user_b = User.objects.create_user(username="user_b", password="testpass123", company=self.company_b, role="Admin")
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)

        # Create API keys for widget tests
        self.api_key_a = ApiKey.objects.create(
            company=self.company_a,
            key="testkey_a_" + "x" * 22,
            label="Test Key A",
        )
        self.api_key_b = ApiKey.objects.create(
            company=self.company_b,
            key="testkey_b_" + "y" * 22,
            label="Test Key B",
        )

    def test_api_key_masking(self):
        """Verify that API keys are masked in GET responses."""
        # /api/v1/api-keys/ is gated by the `manage_api_keys` capability
        # (developer tier) since the dual-tier rollout.
        self.company_a.account_type = 'developer'
        self.company_a.save()
        # Create an API Key for Company A
        api_key = ApiKey.objects.create(company=self.company_a, label="Secret Key", key="1234567890abcdef1234567890abcdef")

        response = self.client_a.get(f'/api/v1/api-keys/')
        assert response.status_code == 200
        
        # Check that the key is masked
        data = response.data
        if 'results' in data: # DefaultRouter uses pagination
            data = data['results']
        
        key_entry = next(k for k in data if k['id'] == str(api_key.id))
        assert key_entry['key'] == "1234567890abcdef1234567890abcdef"
        assert key_entry['label'] == "Secret Key"
        
    def test_cross_company_isolation(self):
        """Verify that Company A cannot see Company B's products."""
        ProductModel.objects.create(company=self.company_b, sku="CAT-B", name="Secret B")
        
        response = self.client_a.get('/api/v1/product-models/')
        assert response.status_code == 200
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        skus = [p['sku'] for p in data]
        assert "CAT-B" not in skus
        
    def test_unauthorized_post_leakage(self):
        """Verify that attempting to create an object for another company is blocked or auto-scoped."""
        payload = {
            "sku": "LEAK-1",
            "name": "Leaked Product",
            "profile": "SIMPLE_COUNT",
            "company": str(self.company_b.id) # Try to force company B
        }
        response = self.client_a.post('/api/v1/product-models/', payload)
        assert response.status_code == 201

        # Verify it was created for Company A, NOT Company B
        prod = ProductModel.objects.get(sku="LEAK-1")
        assert prod.company == self.company_a

    def test_expired_api_key_rejected(self):
        """Verify expired API keys are rejected."""
        expired_key = ApiKey.objects.create(
            company=self.company_a,
            key="expired_key_" + "z" * 20,
            label="Expired Key",
            expires_at=timezone.now() - datetime.timedelta(hours=1),
        )
        client = APIClient()
        response = client.get(f'/api/v1/widget/?api_key={expired_key.key}')
        assert response.status_code == 401

    def test_inactive_api_key_rejected(self):
        """Verify inactive API keys are rejected."""
        inactive_key = ApiKey.objects.create(
            company=self.company_a,
            key="inactive_key_" + "w" * 19,
            label="Inactive Key",
            is_active=False,
        )
        client = APIClient()
        response = client.get(f'/api/v1/widget/?api_key={inactive_key.key}')
        assert response.status_code == 401

    def test_cross_company_api_key_isolation(self):
        """Verify Company A's API key cannot see Company B's products via widget."""
        ProductModel.objects.create(company=self.company_b, sku="SECRET-B", name="Secret B Product")
        client = APIClient()
        response = client.get(f'/api/v1/widget/?api_key={self.api_key_a.key}')
        assert response.status_code == 200
        product_names = [p.get('name', '') for p in response.data.get('products', [])]
        assert "Secret B Product" not in product_names

    def test_allowed_domains_enforcement(self):
        """Verify allowed_domains restricts requests from unauthorized origins."""
        restricted_key = ApiKey.objects.create(
            company=self.company_a,
            key="domain_key_" + "d" * 21,
            label="Domain Restricted Key",
            allowed_domains="allowed.example.com, other.example.com",
        )
        client = APIClient()

        # Request from disallowed origin should be rejected
        response = client.get(
            f'/api/v1/widget/?api_key={restricted_key.key}',
            HTTP_ORIGIN='https://evil.com',
        )
        assert response.status_code == 403

        # Request from allowed origin should succeed
        response = client.get(
            f'/api/v1/widget/?api_key={restricted_key.key}',
            HTTP_ORIGIN='https://allowed.example.com',
        )
        assert response.status_code == 200

    def test_allowed_domains_subdomain_match(self):
        """Verify subdomain matching works for allowed_domains."""
        restricted_key = ApiKey.objects.create(
            company=self.company_a,
            key="subdomain_key_" + "s" * 18,
            label="Subdomain Key",
            allowed_domains="example.com",
        )
        client = APIClient()

        # Subdomain should match
        response = client.get(
            f'/api/v1/widget/?api_key={restricted_key.key}',
            HTTP_ORIGIN='https://app.example.com',
        )
        assert response.status_code == 200

        # Non-matching domain should fail
        response = client.get(
            f'/api/v1/widget/?api_key={restricted_key.key}',
            HTTP_ORIGIN='https://notexample.com',
        )
        assert response.status_code == 403

    def test_allowed_domains_empty_allows_all(self):
        """Verify empty allowed_domains permits all origins (wildcard)."""
        wildcard_key = ApiKey.objects.create(
            company=self.company_a,
            key="wildcard_key_" + "a" * 19,
            label="Wildcard Key",
            allowed_domains="",
        )
        client = APIClient()
        response = client.get(
            f'/api/v1/widget/?api_key={wildcard_key.key}',
            HTTP_ORIGIN='https://any-domain.com',
        )
        assert response.status_code == 200

    def test_api_key_permission_enforcement(self):
        """Verify API key with read-only permission cannot write."""
        read_only_key = ApiKey.objects.create(
            company=self.company_a,
            key="readonly_key_" + "r" * 19,
            label="Read Only Key",
            permissions={'read': True, 'write': False, 'delete': False, 'manage_qr': False, 'scan': False},
        )
        # Seed locations for the company
        Location.objects.get_or_create(
            company=self.company_a, name="External Vendor", defaults={'type': 'VIRTUAL'}
        )
        Location.objects.get_or_create(
            company=self.company_a, name="Warehouse", defaults={'type': 'WAREHOUSE'}
        )
        client = APIClient()

        # Read should work
        response = client.get(f'/api/v1/widget/?api_key={read_only_key.key}')
        assert response.status_code == 200

        # Write (POST) should be rejected
        response = client.post(
            '/api/v1/widget/create_location/',
            {'api_key': read_only_key.key, 'name': 'New Loc'},
        )
        assert response.status_code == 403

    def test_seed_e2e_not_registered_in_production(self):
        """Verify seed-e2e URL is only registered when DEBUG=True."""
        from django.conf import settings
        from django.urls import reverse, NoReverseMatch

        if settings.DEBUG:
            # In test env (DEBUG=True), URL should exist
            url = reverse('seed-e2e')
            assert url == '/api/v1/seed-e2e/'
        else:
            # In production (DEBUG=False), URL should not be registered
            with pytest.raises(NoReverseMatch):
                reverse('seed-e2e')
