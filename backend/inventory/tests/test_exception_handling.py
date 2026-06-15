import pytest
import uuid
from decimal import Decimal
from django.test import RequestFactory
from rest_framework.test import APIRequestFactory
from rest_framework import status

from inventory.exceptions import (
    InventoryError,
    InsufficientStockError,
    InvalidEngineConfigError,
    CompanyIsolationError,
    QRCodeStateError,
    RateLimitExceededError,
)
from inventory.middleware.error_handler import inventory_exception_handler
from inventory.models import (
    ProductModel, Location, ProductBatch, Movement,
)
from inventory.services import LedgerService, StockService
from core.models import Company


@pytest.fixture
def company(db):
    return Company.objects.create(name="TestCo", license_code=uuid.uuid4().hex[:6].upper())


@pytest.fixture
def locations(db, company):
    wh = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    supplier = Location.objects.create(company=company, name="External", type="VIRTUAL")
    return {"warehouse": wh, "supplier": supplier}


@pytest.fixture
def product(db, company):
    return ProductModel.objects.create(
        company=company,
        sku="TEST-001",
        name="Test Product",
    )


# ─── Exception class tests ───────────────────────────────────────────

@pytest.mark.django_db
class TestExceptionClasses:
    def test_inventory_error_defaults(self):
        exc = InventoryError()
        assert exc.status_code == 400
        assert exc.default_code == 'inventory_error'

    def test_insufficient_stock_error(self):
        exc = InsufficientStockError(
            detail="Not enough stock",
            current_stock=5,
            requested=10,
            location="Warehouse A",
        )
        assert exc.status_code == 409
        assert exc.extra_details['current_stock'] == '5'
        assert exc.extra_details['requested'] == '10'
        assert exc.extra_details['location'] == 'Warehouse A'

    def test_invalid_engine_config_error(self):
        exc = InvalidEngineConfigError(
            detail="Bad config",
            validation_errors={'field': 'required'},
        )
        assert exc.status_code == 400
        assert exc.extra_details['validation_errors'] == {'field': 'required'}

    def test_company_isolation_error_generic_message(self):
        exc = CompanyIsolationError()
        assert exc.status_code == 403
        assert str(exc.detail) == 'Access denied.'
        assert exc.extra_details is None

    def test_qr_code_state_error(self):
        exc = QRCodeStateError(
            detail="Cannot lock virgin QR",
            current_state='VIRGIN',
            allowed_transitions=['CONFIGURED'],
        )
        assert exc.status_code == 409
        assert exc.extra_details['current_state'] == 'VIRGIN'
        assert exc.extra_details['allowed_transitions'] == ['CONFIGURED']

    def test_rate_limit_exceeded_error(self):
        exc = RateLimitExceededError(
            detail="Slow down",
            retry_after=60,
        )
        assert exc.status_code == 429
        assert exc.retry_after == 60


# ─── Exception handler tests ─────────────────────────────────────────

class FakeView:
    """Minimal view context for handler."""
    pass


def _make_context():
    factory = APIRequestFactory()
    request = factory.get('/')
    return {'view': FakeView(), 'request': request}


@pytest.mark.django_db
class TestExceptionHandler:
    def test_inventory_error_formatted(self):
        exc = InventoryError("Something went wrong")
        response = inventory_exception_handler(exc, _make_context())
        assert response.status_code == 400
        assert response.data['error'] == 'Something went wrong'
        assert response.data['code'] == 'inventory_error'
        assert 'request_id' in response.data

    def test_insufficient_stock_includes_details(self):
        exc = InsufficientStockError(
            detail="Not enough",
            current_stock=3,
            requested=10,
        )
        response = inventory_exception_handler(exc, _make_context())
        assert response.status_code == 409
        assert response.data['details']['current_stock'] == '3'
        assert response.data['details']['requested'] == '10'

    def test_rate_limit_has_retry_after_header(self):
        exc = RateLimitExceededError(detail="Too fast", retry_after=120)
        response = inventory_exception_handler(exc, _make_context())
        assert response.status_code == 429
        assert response['Retry-After'] == '120'

    def test_unhandled_exception_returns_500(self):
        exc = RuntimeError("kaboom")
        response = inventory_exception_handler(exc, _make_context())
        assert response.status_code == 500
        assert response.data['code'] == 'internal_error'
        assert 'request_id' in response.data

    def test_company_isolation_no_leak(self):
        exc = CompanyIsolationError()
        response = inventory_exception_handler(exc, _make_context())
        assert response.status_code == 403
        assert response.data['error'] == 'Access denied.'
        assert 'details' not in response.data


# ─── Integration: services raise typed exceptions ─────────────────────

@pytest.mark.django_db
class TestServiceExceptionIntegration:
    def test_ledger_rejects_zero_quantity(self, product, locations):
        with pytest.raises(InventoryError, match="positive"):
            LedgerService.transfer_stock(
                product_model=product,
                from_location=locations['supplier'],
                to_location=locations['warehouse'],
                quantity=Decimal('0'),
                user=None,
                reason="Test",
            )

    def test_bulk_transfer_insufficient_stock(self, product, locations):
        with pytest.raises(InsufficientStockError):
            LedgerService.transfer_stock(
                product_model=product,
                from_location=locations['warehouse'],
                to_location=locations['supplier'],
                quantity=Decimal('100'),
                user=None,
                reason="Test",
            )
