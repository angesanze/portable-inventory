"""
Tests for ProductBatchViewSet auth bypass fix.
Verifies that ApiKeyAuthMixin is properly enforced:
- No anonymous access without credentials
- Expired API keys rejected
- Valid API key grants access
- JWT auth still works
"""

import datetime

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from inventory.models import ProductModel, Location, ProductBatch
from inventory.tests.helpers import make_company as _make_company


class ProductBatchAuthBypassTest(TestCase):
    """ProductBatchViewSet must reject unauthenticated requests."""

    def setUp(self):
        self.company_a, self.user_a, self.api_key_a = _make_company("A")
        self.product_a = ProductModel.objects.create(
            company=self.company_a, sku="BATCH-AUTH", name="Auth Test Product"
        )
        self.loc_a = Location.objects.create(
            company=self.company_a, name="Warehouse A", type="WAREHOUSE"
        )
        self.batch = ProductBatch.objects.create(
            product_model=self.product_a,
            location=self.loc_a,
            batch_identifier="LOT-AUTH-001",
            quantity=50,
        )
        self.client = APIClient()

    def test_anonymous_request_rejected(self):
        """Request with no auth credentials must be rejected (not return empty 200)."""
        response = self.client.get("/api/v1/batches/")
        self.assertIn(
            response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
        )

    def test_invalid_api_key_rejected(self):
        """Request with invalid API key must be rejected."""
        response = self.client.get("/api/v1/batches/?api_key=bogus-key-12345")
        self.assertIn(
            response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
        )

    def test_expired_api_key_rejected(self):
        """Request with expired API key must be rejected."""
        self.api_key_a.expires_at = datetime.date(2020, 1, 1)
        self.api_key_a.save()
        response = self.client.get(f"/api/v1/batches/?api_key={self.api_key_a.key}")
        self.assertIn(
            response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
        )

    def test_valid_api_key_returns_data(self):
        """Valid active API key should return batch data."""
        response = self.client.get(f"/api/v1/batches/?api_key={self.api_key_a.key}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if isinstance(response.data, dict) else response.data
        batch_ids = [str(b["id"]) for b in results]
        self.assertIn(str(self.batch.id), batch_ids)

    def test_jwt_auth_returns_data(self):
        """JWT authenticated user should access their company batches."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get("/api/v1/batches/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_cross_company_isolation_api_key(self):
        """API key from company B must not see company A batches."""
        _, _, api_key_b = _make_company("B")
        response = self.client.get(f"/api/v1/batches/?api_key={api_key_b.key}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if isinstance(response.data, dict) else response.data
        batch_ids = [str(b["id"]) for b in results]
        self.assertNotIn(str(self.batch.id), batch_ids)

    def test_create_rejected_unauthenticated(self):
        """SEC-02: the batches endpoint is read-only — a direct (anonymous) write
        that would bypass the LedgerService must not create stock."""
        before = ProductBatch.objects.count()
        response = self.client.post(
            "/api/v1/batches/",
            {
                "product_model": str(self.product_a.id),
                "location": str(self.loc_a.id),
                "batch_identifier": "HACK-001",
                "quantity": 999,
            },
            format="json",
        )
        self.assertIn(
            response.status_code,
            [
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
                status.HTTP_405_METHOD_NOT_ALLOWED,
            ],
        )
        self.assertEqual(ProductBatch.objects.count(), before)

    def test_create_rejected_even_with_valid_key(self):
        """SEC-02: even an authenticated key cannot write giacenza here — batch
        creation must route through the ledger, not a raw REST write."""
        before = ProductBatch.objects.count()
        response = self.client.post(
            f"/api/v1/batches/?api_key={self.api_key_a.key}",
            {
                "product_model": str(self.product_a.id),
                "location": str(self.loc_a.id),
                "batch_identifier": "HACK-002",
                "quantity": 999,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(ProductBatch.objects.count(), before)
