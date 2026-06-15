"""Registration API tests for the unique VAT requirement (DUAL-TIER-08)."""

import pytest
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Company

# Known-valid Italian VAT (mod-10 checksum == 0).
VALID_VAT = '00743110157'


@pytest.mark.django_db
class TestRegistrationVat:
    def setup_method(self):
        self.client = APIClient()
        self.url = '/api/v1/onboarding/'
        self.valid_payload = {
            'company_name': 'Acme Corp',
            'admin_email': 'admin@acme.com',
            'admin_password': 'securepass123',
            'industry_type': 'manufacturing',
            'vat': VALID_VAT,
        }

    def test_missing_vat_rejected(self):
        """Registering without a vat field fails with 400."""
        payload = {**self.valid_payload}
        del payload['vat']
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'vat' in response.data

    def test_invalid_vat_rejected(self):
        """Registering with a structurally invalid VAT fails with 400."""
        payload = {**self.valid_payload, 'vat': '12345'}
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'vat' in response.data

    def test_duplicate_vat_rejected(self):
        """A VAT already used by another company is rejected with 400."""
        first = self.client.post(self.url, self.valid_payload, format='json')
        assert first.status_code == status.HTTP_201_CREATED

        # Same VAT, different company + email so the email check passes first.
        payload = {
            **self.valid_payload,
            'company_name': 'Beta Corp',
            'admin_email': 'admin@beta.com',
        }
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'vat' in response.data

    def test_valid_unique_vat_accepted(self):
        """A valid unique VAT yields 201 with both vat and license_code."""
        response = self.client.post(self.url, self.valid_payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        company_data = response.data['company']
        assert company_data['vat'] == VALID_VAT
        assert len(company_data['license_code']) == 6

        # Normalized VAT persisted on the company.
        company = Company.objects.get(id=company_data['id'])
        assert company.vat == VALID_VAT

    def test_vat_normalized_before_dedup(self):
        """A spaced/IT-prefixed duplicate of an existing VAT is still rejected."""
        first = self.client.post(self.url, self.valid_payload, format='json')
        assert first.status_code == status.HTTP_201_CREATED

        payload = {
            **self.valid_payload,
            'company_name': 'Gamma Corp',
            'admin_email': 'admin@gamma.com',
            'vat': 'IT 0074 3110 157',
        }
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'vat' in response.data
