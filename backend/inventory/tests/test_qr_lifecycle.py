"""
QR code lifecycle tests:
  generate batch → configure via widget → lock → scan resolves correctly
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from core.models import Company, User, ApiKey
from inventory.models import ProductModel, Location, DynamicQRCode


@pytest.fixture
def qr_env(db):
    """Environment for QR code tests."""
    company = Company.objects.create(name="QR Corp", license_code="QRCORP")

    user = User.objects.create_user(username="qr_admin", password="password", company=company)
    api_key = ApiKey.objects.create(company=company, label="QR Key", key="qr-test-key")
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    product = ProductModel.objects.create(company=company, sku="QR-001", name="QR Product")

    client = APIClient()

    return {
        "company": company,
        "user": user,
        "api_key": api_key,
        "warehouse": warehouse,
        "product": product,
        "client": client,
    }


@pytest.mark.django_db
class TestQRCodeLifecycle:
    """Full QR lifecycle: create → configure → lock → scan."""

    def _create_qr_batch(self, company, count=3):
        """Create a batch of VIRGIN QR codes."""
        codes = []
        for i in range(count):
            qr = DynamicQRCode.objects.create(company=company)
            codes.append(qr)
        return codes

    def test_virgin_qr_created_with_correct_defaults(self, qr_env):
        """New QR codes start as VIRGIN with no target."""
        qr = DynamicQRCode.objects.create(company=qr_env["company"])
        assert qr.status == "VIRGIN"
        assert not qr.is_configured()
        assert qr.code  # auto-generated
        assert len(qr.code) == 8

    def test_batch_creation(self, qr_env):
        """Batch of QR codes all start VIRGIN."""
        codes = self._create_qr_batch(qr_env["company"], count=5)
        assert len(codes) == 5
        assert all(qr.status == "VIRGIN" for qr in codes)
        # Codes should be unique
        code_strings = [qr.code for qr in codes]
        assert len(set(code_strings)) == 5

    def test_configure_qr_via_api(self, qr_env):
        """Configure VIRGIN QR code to point at product via widget API."""
        client = qr_env["client"]
        qr = DynamicQRCode.objects.create(company=qr_env["company"])
        key = qr_env["api_key"].key
        product = qr_env["product"]

        url = reverse("widget-configure-qr")
        resp = client.post(
            f"{url}?api_key={key}",
            {
                "code": qr.code,
                "target_type": "PRODUCT",
                "target_id": str(product.id),
            },
            format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["new_status"] == "CONFIGURED"

        qr.refresh_from_db()
        assert qr.status == "CONFIGURED"
        assert qr.product_model_id == product.id
        assert qr.is_configured()

    def test_configure_qr_with_location(self, qr_env):
        """Configure QR with location context."""
        client = qr_env["client"]
        qr = DynamicQRCode.objects.create(company=qr_env["company"])
        key = qr_env["api_key"].key

        url = reverse("widget-configure-qr")
        resp = client.post(
            f"{url}?api_key={key}",
            {
                "code": qr.code,
                "target_type": "PRODUCT",
                "target_id": str(qr_env["product"].id),
                "location_id": str(qr_env["warehouse"].id),
            },
            format="json",
        )
        assert resp.status_code == 200

        qr.refresh_from_db()
        assert qr.location_id == qr_env["warehouse"].id

    def test_lock_configured_qr(self, qr_env):
        """Lock a CONFIGURED QR code."""
        client = qr_env["client"]
        qr = DynamicQRCode.objects.create(
            company=qr_env["company"],
            status="CONFIGURED",
            product_model=qr_env["product"],
        )
        key = qr_env["api_key"].key

        url = reverse("widget-lock-qr")
        resp = client.post(
            f"{url}?api_key={key}",
            {"code": qr.code},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["new_status"] == "LOCKED"

        qr.refresh_from_db()
        assert qr.status == "LOCKED"

    def test_cannot_configure_already_configured(self, qr_env):
        """Re-configuring a CONFIGURED QR returns 409."""
        client = qr_env["client"]
        qr = DynamicQRCode.objects.create(
            company=qr_env["company"],
            status="CONFIGURED",
            product_model=qr_env["product"],
        )
        key = qr_env["api_key"].key

        url = reverse("widget-configure-qr")
        resp = client.post(
            f"{url}?api_key={key}",
            {
                "code": qr.code,
                "target_type": "PRODUCT",
                "target_id": str(qr_env["product"].id),
            },
            format="json",
        )
        assert resp.status_code == 409

    def test_cannot_lock_virgin_qr(self, qr_env):
        """Locking a VIRGIN QR returns 409."""
        client = qr_env["client"]
        qr = DynamicQRCode.objects.create(company=qr_env["company"])
        key = qr_env["api_key"].key

        url = reverse("widget-lock-qr")
        resp = client.post(
            f"{url}?api_key={key}",
            {"code": qr.code},
            format="json",
        )
        assert resp.status_code == 409

    def test_cannot_lock_already_locked(self, qr_env):
        """Locking a LOCKED QR returns 409."""
        client = qr_env["client"]
        qr = DynamicQRCode.objects.create(
            company=qr_env["company"],
            status="LOCKED",
            product_model=qr_env["product"],
        )
        key = qr_env["api_key"].key

        url = reverse("widget-lock-qr")
        resp = client.post(
            f"{url}?api_key={key}",
            {"code": qr.code},
            format="json",
        )
        assert resp.status_code == 409

    def test_qr_info_resolves_configured_code(self, qr_env):
        """QR info endpoint returns target for configured code."""
        client = qr_env["client"]
        product = qr_env["product"]
        qr = DynamicQRCode.objects.create(
            company=qr_env["company"],
            status="CONFIGURED",
            product_model=product,
        )
        key = qr_env["api_key"].key

        url = reverse("widget-qr-info")
        resp = client.get(url, {"api_key": key, "code": qr.code})
        assert resp.status_code == 200

        data = resp.json()
        assert data["code"] == qr.code
        assert data["status"] == "CONFIGURED"
        assert data["target_type"] == "PRODUCT"
        assert data["target_id"] == str(product.id)

    def test_qr_info_for_virgin_code(self, qr_env):
        """QR info for VIRGIN code returns no target."""
        client = qr_env["client"]
        qr = DynamicQRCode.objects.create(company=qr_env["company"])
        key = qr_env["api_key"].key

        url = reverse("widget-qr-info")
        resp = client.get(url, {"api_key": key, "code": qr.code})
        assert resp.status_code == 200

        data = resp.json()
        assert data["status"] == "VIRGIN"
        assert data["target_type"] is None

    def test_full_lifecycle_flow(self, qr_env):
        """Complete flow: create → configure → lock → scan info."""
        client = qr_env["client"]
        key = qr_env["api_key"].key
        product = qr_env["product"]

        # 1. Create virgin QR
        qr = DynamicQRCode.objects.create(company=qr_env["company"])
        assert qr.status == "VIRGIN"

        # 2. Configure via API
        resp = client.post(
            f"{reverse('widget-configure-qr')}?api_key={key}",
            {"code": qr.code, "target_type": "PRODUCT", "target_id": str(product.id)},
            format="json",
        )
        assert resp.status_code == 200

        # 3. Lock via API
        resp = client.post(
            f"{reverse('widget-lock-qr')}?api_key={key}",
            {"code": qr.code},
            format="json",
        )
        assert resp.status_code == 200

        # 4. Scan (info) resolves correctly
        resp = client.get(reverse("widget-qr-info"), {"api_key": key, "code": qr.code})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "LOCKED"
        assert data["target_id"] == str(product.id)

    def test_cross_company_qr_isolation(self, qr_env):
        """Cannot access another company's QR code."""
        # Create QR for different company
        other_company = Company.objects.create(name="Other Corp", license_code="OTHER1")
        other_qr = DynamicQRCode.objects.create(company=other_company)

        client = qr_env["client"]
        key = qr_env["api_key"].key

        url = reverse("widget-qr-info")
        resp = client.get(url, {"api_key": key, "code": other_qr.code})
        assert resp.status_code == 404
