"""
Regression tests for the QR `qr_url` public-base override (CLEANUP-03).

The QR encodes `/go/<code>`; in Docker/dev `request.build_absolute_uri` resolves
to an internal host unreachable from a phone. `get_qr_url` must prefer
settings.PUBLIC_BASE_URL when set, and fall back to the request origin otherwise.
"""
import pytest
from django.test import Client, override_settings
from rest_framework.test import APIRequestFactory
from core.models import ApiKey, Company
from inventory.models import DynamicQRCode, ProductModel
from inventory.serializers.movements import DynamicQRCodeSerializer


@pytest.fixture
def qr_code(db):
    company = Company.objects.create(name="QR URL Corp", license_code="QRURL1")
    return DynamicQRCode.objects.create(company=company)


@pytest.mark.django_db
@override_settings(PUBLIC_BASE_URL="https://app.example.test", FRONTEND_BASE_URL="")
def test_qr_url_uses_public_base(qr_code):
    """With PUBLIC_BASE_URL set, the URL is built from the public origin.

    FRONTEND_BASE_URL is blanked because it takes priority and is set in the
    Docker dev environment — the test must not depend on the runner's env.
    """
    data = DynamicQRCodeSerializer(qr_code).data
    assert data["qr_url"] == f"https://app.example.test/go/{qr_code.code}"


@pytest.mark.django_db
@override_settings(PUBLIC_BASE_URL="")
def test_qr_url_falls_back_to_request_origin(qr_code):
    """With PUBLIC_BASE_URL empty and a request in context, fall back to request origin."""
    request = APIRequestFactory().get("/")
    data = DynamicQRCodeSerializer(qr_code, context={"request": request}).data
    assert data["qr_url"].endswith(f"/go/{qr_code.code}")
    assert "://" in data["qr_url"]  # absolute, from the request origin


@pytest.mark.django_db
@override_settings(FRONTEND_BASE_URL="", PUBLIC_BASE_URL="")
def test_redirect_target_lands_on_widget_not_internal_host():
    """A CONFIGURED code's /go/<code>/ redirect points at the public /widget
    route, never an internal Docker host.

    With no base-URL settings, QRRedirectView builds a relative `/widget?...`
    Location, so the redirect inherits the public origin from the browser.
    This guards against a regression that re-introduces an internal host
    (backend:8000 / localhost:8000) in the redirect target.
    """
    company = Company.objects.create(name="QR Redir Corp", license_code="QRREDIR")
    api_key = ApiKey.objects.create(company=company, label="K", key="qr-redir-key")
    product = ProductModel.objects.create(company=company, sku="QR-RD", name="P")
    qr = DynamicQRCode.objects.create(
        company=company,
        api_key=api_key,
        product_model=product,
        status="CONFIGURED",
    )

    resp = Client().get(f"/go/{qr.code}/")

    assert resp.status_code == 302
    location = resp["Location"]
    assert location.startswith("/widget"), location
    assert "backend:8000" not in location
    assert "localhost:8000" not in location
    # Security: the raw API key must never appear in the redirect URL —
    # only the short-lived signed token does.
    assert "api_key=" not in location
    assert "token=" in location
    assert api_key.key not in location
