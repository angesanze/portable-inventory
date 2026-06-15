import pytest
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Company, User, ApiKey
from inventory.models import Location


@pytest.mark.django_db
class TestCompanyRegistration:
    def setup_method(self):
        self.client = APIClient()
        self.url = '/api/v1/onboarding/'
        self.valid_payload = {
            'company_name': 'Acme Corp',
            'admin_email': 'admin@acme.com',
            'admin_password': 'securepass123',
            'industry_type': 'manufacturing',
            'vat': '00743110157',
        }

    def test_registration_creates_company_user_defaults(self):
        """Registration creates company + user + API key + default resources."""
        response = self.client.post(self.url, self.valid_payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        data = response.data

        # Company created
        company = Company.objects.get(id=data['company']['id'])
        assert company.name == 'Acme Corp'
        assert company.settings['industry_type'] == 'manufacturing'

        # User created with is_staff
        user = User.objects.get(id=data['user']['id'])
        assert user.email == 'admin@acme.com'
        assert user.company == company
        # GOVERNANCE-11: the first user of a self-service company is its OWNER
        # (was the legacy free-text 'Admin').
        assert user.role == User.Role.OWNER
        assert user.is_staff is True

        # API key created
        api_key = ApiKey.objects.get(id=data['api_key']['id'])
        assert api_key.company == company
        assert api_key.is_active is True
        assert len(data['api_key']['key']) == 64  # hex(32) = 64 chars

        # Default locations seeded (Main Warehouse + Loss)
        locations = Location.objects.filter(company=company)
        location_names = set(locations.values_list('name', flat=True))
        assert 'Main Warehouse' in location_names
        assert 'Loss' in location_names


    def test_registration_creates_manager_company(self):
        """Self-service registration always yields a leaf manager company."""
        response = self.client.post(self.url, self.valid_payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        company = Company.objects.get(id=response.data['company']['id'])
        assert company.account_type == Company.AccountType.MANAGER
        assert company.is_manager is True
        assert company.parent is None

    def test_registration_ignores_account_type_in_payload(self):
        """A malicious account_type='developer' in the payload is ignored."""
        payload = {**self.valid_payload, 'account_type': 'developer'}
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        company = Company.objects.get(id=response.data['company']['id'])
        assert company.account_type == Company.AccountType.MANAGER
        assert company.is_developer is False

    def test_registration_returns_valid_jwt_tokens(self):
        """JWT tokens returned are valid and can authenticate."""
        response = self.client.post(self.url, self.valid_payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        tokens = response.data['tokens']
        assert 'access' in tokens
        assert 'refresh' in tokens

        # Use access token to hit authenticated endpoint
        auth_client = APIClient()
        auth_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        product_response = auth_client.get('/api/v1/product-models/')
        assert product_response.status_code == status.HTTP_200_OK

    def test_duplicate_email_rejected(self):
        """Registering with same email twice fails."""
        self.client.post(self.url, self.valid_payload, format='json')

        response = self.client.post(self.url, self.valid_payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'admin_email' in response.data

    def test_registration_returns_license_code(self):
        """License code returned so user can share with team."""
        response = self.client.post(self.url, self.valid_payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        license_code = response.data['company']['license_code']
        assert len(license_code) == 6
        assert Company.objects.filter(license_code=license_code).exists()

    def test_password_too_short_rejected(self):
        """Password under 8 chars fails validation."""
        payload = {**self.valid_payload, 'admin_password': 'short'}
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_email_rejected(self):
        """Invalid email format fails validation."""
        payload = {**self.valid_payload, 'admin_email': 'not-an-email'}
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_missing_company_name_rejected(self):
        """Company name is required."""
        payload = {**self.valid_payload}
        del payload['company_name']
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_industry_type_defaults_to_other(self):
        """Industry type defaults to 'other' when not provided."""
        payload = {**self.valid_payload}
        del payload['industry_type']
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['company']['industry_type'] == 'other'


@pytest.mark.django_db
class TestCompanySettings:
    def setup_method(self):
        self.client = APIClient()
        self.url = '/api/v1/company/settings/'
        self.company = Company.objects.create(
            name='Test Co', license_code='TSTSET',
            settings={'industry_type': 'manufacturing'},
        )
        self.user = User.objects.create_user(
            username='test@test.com', email='test@test.com',
            password='testpass123', company=self.company,
        )
        self.client.force_authenticate(user=self.user)

    def test_get_settings(self):
        response = self.client.get(self.url)
        assert response.status_code == 200
        assert response.data['industry_type'] == 'manufacturing'

    def test_patch_timezone_and_currency(self):
        response = self.client.patch(
            self.url,
            {'timezone': 'America/New_York', 'currency': 'EUR'},
            format='json',
        )
        assert response.status_code == 200
        assert response.data['timezone'] == 'America/New_York'
        assert response.data['currency'] == 'EUR'
        # Existing settings preserved
        assert response.data['industry_type'] == 'manufacturing'

    def test_patch_rejects_unknown_keys(self):
        response = self.client.patch(
            self.url, {'evil_key': 'hacked'}, format='json',
        )
        assert response.status_code == 400
        assert 'evil_key' in response.data['detail']

    def test_unauthenticated_rejected(self):
        client = APIClient()
        response = client.patch(self.url, {'timezone': 'UTC'}, format='json')
        assert response.status_code == 401
