import pytest
from rest_framework.test import APIClient
from core.models import Company, User
from inventory.models import DynamicQRCode
from django.core.cache import cache


@pytest.mark.django_db
class TestRateLimiting:
    def setup_method(self):
        cache.clear()
        # Setup Company
        self.company = Company.objects.create(name="TestCo", license_code="TESTRL")
        self.user = User.objects.create_user(
            username="test_user", password="testpass123", company=self.company, role="Admin"
        )
        self.client = APIClient()

    def test_qr_redirect_throttling(self):
        """Verify that the public QR redirect is throttled."""
        qr = DynamicQRCode.objects.create(
            company=self.company, status="VIRGIN", label="Throttled QR"
        )
        url = f"/go/{qr.code}/"

        # 20 per minute is the limit
        for _ in range(20):
            response = self.client.get(url)
            assert (
                response.status_code == 302 or response.status_code == 404
            )  # 404 if no api key yet, but 302 if redirect

        # 21st should be throttled
        response = self.client.get(url)
        assert response.status_code == 429
