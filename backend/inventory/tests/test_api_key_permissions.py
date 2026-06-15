"""
Tests for API key granular permissions:
- Read-only key cannot create transactions
- Expired key is rejected
- Usage tracking increments on each request
- Rate limit tier enforcement
- Domain whitelist blocking
"""
import datetime
import secrets

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import ApiKey
from inventory.models import Location, ProductModel
from inventory.tests.helpers import make_company as _make_company


@pytest.mark.django_db
class TestReadOnlyKeyCannotWrite:
    """Read-only API key must be blocked from write operations."""

    def setup_method(self):
        self.company, self.user, _ = _make_company("RO")
        self.read_only_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Read Only",
            permissions={
                'read': True,
                'write': False,
                'delete': False,
                'manage_qr': False,
                'scan': False,
            },
        )
        # Ensure locations exist for widget
        Location.objects.get_or_create(
            company=self.company, name="External Vendor",
            defaults={'type': 'VIRTUAL'},
        )
        Location.objects.get_or_create(
            company=self.company, name="Warehouse",
            defaults={'type': 'WAREHOUSE'},
        )
        self.product = ProductModel.objects.create(
            company=self.company, sku="RO-PROD", name="RO Product",
        )
        self.client = APIClient()

    def test_read_only_key_can_list_products(self):
        response = self.client.get(
            f'/api/v1/widget/?api_key={self.read_only_key.key}'
        )
        assert response.status_code == status.HTTP_200_OK

    def test_read_only_key_cannot_create_location(self):
        response = self.client.post(
            '/api/v1/widget/create_location/',
            {'api_key': self.read_only_key.key, 'name': 'Blocked Loc'},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_read_only_key_cannot_post_transaction(self):
        response = self.client.post(
            f'/api/v1/widget/{self.product.id}/transaction/',
            {
                'api_key': self.read_only_key.key,
                'quantity': 5,
                'transaction_type': 'IN',
            },
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_full_permission_key_can_write(self):
        full_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Full Access",
            permissions={
                'read': True,
                'write': True,
                'delete': True,
                'manage_qr': True,
                'scan': True,
            },
        )
        response = self.client.post(
            '/api/v1/widget/create_location/',
            {'api_key': full_key.key, 'name': 'Allowed Loc', 'type': 'WAREHOUSE'},
        )
        assert response.status_code in (
            status.HTTP_200_OK,
            status.HTTP_201_CREATED,
        )


@pytest.mark.django_db
class TestExpiredKeyRejected:
    """Expired API keys must return 401."""

    def setup_method(self):
        self.company, _, _ = _make_company("EXP")
        self.client = APIClient()

    def test_expired_key_rejected(self):
        expired_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Expired Key",
            expires_at=timezone.now() - datetime.timedelta(hours=1),
        )
        response = self.client.get(
            f'/api/v1/widget/?api_key={expired_key.key}'
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_expired_key_accepted(self):
        valid_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Valid Key",
            expires_at=timezone.now() + datetime.timedelta(days=30),
        )
        response = self.client.get(
            f'/api/v1/widget/?api_key={valid_key.key}'
        )
        assert response.status_code == status.HTTP_200_OK

    def test_key_without_expiry_accepted(self):
        no_expiry_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="No Expiry Key",
            expires_at=None,
        )
        response = self.client.get(
            f'/api/v1/widget/?api_key={no_expiry_key.key}'
        )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestUsageTracking:
    """Usage count and last_used_at must update on each authenticated request."""

    def setup_method(self):
        self.company, _, _ = _make_company("USAGE")
        self.api_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Usage Track Key",
            usage_count=0,
            last_used_at=None,
        )
        self.client = APIClient()

    def test_usage_count_increments(self):
        assert self.api_key.usage_count == 0

        self.client.get(f'/api/v1/widget/?api_key={self.api_key.key}')
        self.api_key.refresh_from_db()
        assert self.api_key.usage_count == 1

        self.client.get(f'/api/v1/widget/?api_key={self.api_key.key}')
        self.api_key.refresh_from_db()
        assert self.api_key.usage_count == 2

    def test_last_used_at_updates(self):
        assert self.api_key.last_used_at is None

        before = timezone.now()
        self.client.get(f'/api/v1/widget/?api_key={self.api_key.key}')
        after = timezone.now()

        self.api_key.refresh_from_db()
        assert self.api_key.last_used_at is not None
        assert before <= self.api_key.last_used_at <= after


@pytest.mark.django_db
class TestRateLimitTierEnforcement:
    """Rate limit tiers must apply different throttle rates."""

    def setup_method(self):
        cache.clear()
        self.company, _, _ = _make_company("RATE")
        self.client = APIClient()

    def test_free_tier_throttled_at_low_limit(self):
        """Free tier has 100/minute burst. Exceed it → 429."""
        free_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Free Tier Key",
            rate_limit_tier='free',
        )
        cache.clear()

        # Burst limit is 100/minute for free tier
        throttled = False
        for i in range(105):
            response = self.client.get(
                f'/api/v1/widget/?api_key={free_key.key}'
            )
            if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                throttled = True
                break

        assert throttled, "Free tier should be throttled within 105 requests"

    def test_premium_tier_allows_more_requests(self):
        """Premium tier has 5000/minute burst — 105 requests should pass."""
        premium_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Premium Tier Key",
            rate_limit_tier='premium',
        )
        cache.clear()

        for i in range(105):
            response = self.client.get(
                f'/api/v1/widget/?api_key={premium_key.key}'
            )
            assert response.status_code == status.HTTP_200_OK, (
                f"Premium tier throttled at request {i + 1}"
            )


@pytest.mark.django_db
class TestDomainWhitelistBlocking:
    """Allowed domains must block unauthorized origins."""

    def setup_method(self):
        self.company, _, _ = _make_company("DOM")
        self.client = APIClient()

    def test_disallowed_origin_blocked(self):
        restricted_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Domain Key",
            allowed_domains="myapp.com, trusted.org",
        )
        response = self.client.get(
            f'/api/v1/widget/?api_key={restricted_key.key}',
            HTTP_ORIGIN='https://evil.com',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_allowed_origin_passes(self):
        restricted_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Domain Key 2",
            allowed_domains="myapp.com, trusted.org",
        )
        response = self.client.get(
            f'/api/v1/widget/?api_key={restricted_key.key}',
            HTTP_ORIGIN='https://myapp.com',
        )
        assert response.status_code == status.HTTP_200_OK

    def test_subdomain_matches_allowed_domain(self):
        restricted_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Domain Key 3",
            allowed_domains="example.com",
        )
        response = self.client.get(
            f'/api/v1/widget/?api_key={restricted_key.key}',
            HTTP_ORIGIN='https://app.example.com',
        )
        assert response.status_code == status.HTTP_200_OK

    def test_empty_domains_allows_all(self):
        open_key = ApiKey.objects.create(
            company=self.company,
            key=secrets.token_hex(32),
            label="Open Key",
            allowed_domains="",
        )
        response = self.client.get(
            f'/api/v1/widget/?api_key={open_key.key}',
            HTTP_ORIGIN='https://anything.com',
        )
        assert response.status_code == status.HTTP_200_OK
