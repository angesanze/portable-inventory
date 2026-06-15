"""Tests for standardized exception-based error handling in widget transaction processing."""

import pytest
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch
from django.utils import timezone
from datetime import timedelta

from rest_framework.test import APIClient
from core.models import Company
from inventory.models import ProductModel, Location, PhysicalProduct, WorkOrder, ProductBatch
from inventory.exceptions import (
    InventoryError, ItemNotFoundError, InsufficientStockError, InvalidEngineConfigError,
)
from inventory.services.widget_transaction import WidgetTransactionService
from inventory.services.batch_manager import BatchManagerService


@pytest.fixture
def company_setup(db):
    return Company.objects.create(name="WidgetErrCo", license_code=uuid.uuid4().hex[:6].upper())


@pytest.fixture
def warehouse(company_setup):
    # Remove auto-seeded physical locations so only one warehouse exists
    Location.objects.filter(company=company_setup, type__in=['WAREHOUSE', 'PHYSICAL', 'STORE']).delete()
    return Location.objects.create(name="Warehouse", type="WAREHOUSE", company=company_setup)


@pytest.fixture
def external(company_setup):
    return Location.objects.create(name="External", type="VIRTUAL", company=company_setup)


@pytest.fixture
def product(company_setup):
    return ProductModel.objects.create(
        company=company_setup,
        name="Test Product",
        sku=f"TST-{uuid.uuid4().hex[:6]}",
    )


# --- WidgetTransactionService exception tests ---

class TestTransactionExceptions:

    @pytest.mark.django_db
    def test_product_not_found_raises_item_not_found(self, company_setup):
        fake_pk = uuid.uuid4()
        with pytest.raises(ItemNotFoundError, match="ProductModel not found"):
            WidgetTransactionService.process_transaction(
                company_setup, "test-key", str(fake_pk), {"operation": "add", "quantity": 1}
            )

    @pytest.mark.django_db
    def test_invalid_operation_for_batch_manager_raises(self, company_setup):
        wo = WorkOrder.objects.create(
            company=company_setup, name="WO-TEST", status="OPEN"
        )
        with pytest.raises(InventoryError, match="Invalid operation for Batch Manager"):
            WidgetTransactionService.process_transaction(
                company_setup, "test-key", str(wo.id), {"operation": "add", "quantity": 1}
            )

    @pytest.mark.django_db
    def test_invalid_quantity_raises(self, company_setup, product, warehouse, external):
        with pytest.raises(InventoryError, match="Invalid quantity"):
            WidgetTransactionService.process_transaction(
                company_setup, "test-key", str(product.id),
                {"operation": "add", "quantity": 0}
            )

    @pytest.mark.django_db
    def test_invalid_operation_raises(self, company_setup, product, warehouse, external):
        with pytest.raises(InventoryError, match="Invalid operation"):
            WidgetTransactionService.process_transaction(
                company_setup, "test-key", str(product.id),
                {"operation": "invalid_op", "quantity": 5}
            )

    @pytest.mark.django_db
    def test_physical_product_not_found_raises(self, company_setup, product, warehouse, external):
        fake_pp = uuid.uuid4()
        with pytest.raises(ItemNotFoundError, match="Physical Product not found"):
            WidgetTransactionService.process_transaction(
                company_setup, "test-key", str(product.id),
                {"operation": "add", "quantity": 1, "physical_product_id": str(fake_pp)}
            )

    @pytest.mark.django_db
    def test_no_warehouse_raises(self, db):
        # Use a fresh company with zero locations
        comp = Company.objects.create(name="NoWHCo", license_code=uuid.uuid4().hex[:6].upper())
        prod = ProductModel.objects.create(
            company=comp, name="No WH", sku=f"NW-{uuid.uuid4().hex[:6]}"
        )
        # Ensure no warehouse/physical locations exist
        Location.objects.filter(company=comp).exclude(type='VIRTUAL').delete()
        with pytest.raises(InventoryError, match="No Warehouse found"):
            WidgetTransactionService.process_transaction(
                comp, "test-key", str(prod.id),
                {"operation": "add", "quantity": 1}
            )

    @pytest.mark.django_db
    def test_no_active_items_raises_insufficient_stock(self, company_setup, warehouse, external):
        prod = ProductModel.objects.create(
            company=company_setup, name="Serial", sku=f"SER-{uuid.uuid4().hex[:6]}",
            profile="SERIALIZED",
        )
        with pytest.raises(InsufficientStockError, match="No active items found"):
            WidgetTransactionService.process_transaction(
                company_setup, "test-key", str(prod.id),
                {"operation": "subtract", "quantity": 1}
            )

    @pytest.mark.django_db
    def test_no_error_dicts_returned(self, company_setup, product, warehouse, external):
        """Successful transaction should never contain an 'error' key."""
        with patch('inventory.services.widget_transaction.LedgerService.transfer_stock'):
            result = WidgetTransactionService.process_transaction(
                company_setup, "test-key", str(product.id),
                {"operation": "add", "quantity": 5}
            )
        assert "error" not in result
        assert result["success"] is True


# --- BatchManagerService exception tests ---

class TestBatchManagerExceptions:

    @pytest.mark.django_db
    def test_item_not_found_raises(self, company_setup):
        wo = WorkOrder.objects.create(
            company=company_setup, name="WO-BME", status="OPEN"
        )
        with pytest.raises(ItemNotFoundError, match="Item not found"):
            BatchManagerService.handle_batch_manager_transaction(
                wo, {"delta": 1, "physical_product_id": str(uuid.uuid4())}
            )

    @pytest.mark.django_db
    def test_batch_not_found_raises(self, company_setup):
        wo = WorkOrder.objects.create(
            company=company_setup, name="WO-BNF", status="OPEN"
        )
        with pytest.raises(ItemNotFoundError, match="Batch not found"):
            BatchManagerService.handle_batch_manager_transaction(
                wo, {"delta": -1, "batch_id": str(uuid.uuid4())}
            )


# --- View-layer exception formatting tests ---

class TestViewExceptionFormatting:

    @pytest.mark.django_db
    def test_view_returns_404_for_not_found(self, company_setup):
        from inventory.api.public.viewsets.products import ProductWidgetViewSet

        mock_auth = MagicMock()
        mock_auth.company = company_setup
        mock_auth.label = "test"
        mock_auth.default_location = None

        view = ProductWidgetViewSet()
        view.request = MagicMock()
        view.request.data = {"operation": "add", "quantity": 1}

        with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
            response = view.transaction(view.request, pk=str(uuid.uuid4()))

        assert response.status_code == 404
        assert "error" in response.data

    @pytest.mark.django_db
    def test_view_returns_400_for_inventory_error(self, company_setup, product, warehouse, external):
        from inventory.api.public.viewsets.products import ProductWidgetViewSet

        mock_auth = MagicMock()
        mock_auth.company = company_setup
        mock_auth.label = "test"
        mock_auth.default_location = None

        view = ProductWidgetViewSet()
        view.request = MagicMock()
        view.request.data = {"operation": "add", "quantity": 0}

        with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
            response = view.transaction(view.request, pk=str(product.id))

        assert response.status_code == 400
        assert "error" in response.data

    @pytest.mark.django_db
    def test_view_returns_409_for_insufficient_stock(self, company_setup, warehouse, external):
        from inventory.api.public.viewsets.products import ProductWidgetViewSet

        prod = ProductModel.objects.create(
            company=company_setup, name="Serial409", sku=f"S409-{uuid.uuid4().hex[:6]}",
            profile="SERIALIZED",
        )

        mock_auth = MagicMock()
        mock_auth.company = company_setup
        mock_auth.label = "test"
        mock_auth.default_location = None

        view = ProductWidgetViewSet()
        view.request = MagicMock()
        view.request.data = {"operation": "subtract", "quantity": 1}

        with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
            response = view.transaction(view.request, pk=str(prod.id))

        assert response.status_code == 409
        assert "error" in response.data


# --- View `detail` payload tests: every InventoryError subclass surfaces a
# non-empty `detail` string so the frontend can render it verbatim. ---


def _call_view(company, pk, data):
    from inventory.api.public.viewsets.products import ProductWidgetViewSet

    mock_auth = MagicMock()
    mock_auth.company = company
    mock_auth.label = "test"
    mock_auth.default_location = None

    view = ProductWidgetViewSet()
    view.request = MagicMock()
    view.request.data = data

    with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
        return view.transaction(view.request, pk=str(pk))


class TestViewDetailPayload:
    """Each InventoryError subclass must surface a non-empty `detail` string."""

    @pytest.mark.django_db
    def test_item_not_found_returns_detail(self, company_setup):
        response = _call_view(company_setup, uuid.uuid4(), {"operation": "add", "quantity": 1})
        assert response.status_code == 404
        assert isinstance(response.data.get("detail"), str)
        assert response.data["detail"]
        assert "not found" in response.data["detail"].lower()

    @pytest.mark.django_db
    def test_inventory_error_returns_detail(self, company_setup, product, warehouse, external):
        response = _call_view(company_setup, product.id, {"operation": "add", "quantity": 0})
        assert response.status_code == 400
        assert isinstance(response.data.get("detail"), str)
        assert "Invalid quantity" in response.data["detail"]

    @pytest.mark.django_db
    def test_insufficient_stock_returns_detail(self, company_setup, warehouse, external):
        prod = ProductModel.objects.create(
            company=company_setup, name="SerDetail", sku=f"SD-{uuid.uuid4().hex[:6]}",
            profile="SERIALIZED",
        )
        response = _call_view(company_setup, prod.id, {"operation": "subtract", "quantity": 1})
        assert response.status_code == 409
        assert isinstance(response.data.get("detail"), str)
        assert "No active items" in response.data["detail"]

    @pytest.mark.django_db
    def test_invalid_engine_config_returns_detail(self, company_setup, warehouse, external):
        """DIMENSIONAL profile missing dimension values → InvalidEngineConfigError → 400 with detail."""
        prod = ProductModel.objects.create(
            company=company_setup, name="DimDetail", sku=f"DD-{uuid.uuid4().hex[:6]}",
            profile="DIMENSIONAL",
            engine_config={"dimensions": ["length", "width"], "formula": "length * width"},
        )
        response = _call_view(company_setup, prod.id, {"operation": "add", "quantity": 1})
        assert response.status_code == 400
        assert isinstance(response.data.get("detail"), str)
        assert "dimension" in response.data["detail"].lower()

    @pytest.mark.django_db
    def test_no_raw_python_type_names_in_detail(self, company_setup, product, warehouse, external):
        """`detail` must never expose Python type names like 'ValueError' or 'select_for_update'."""
        response = _call_view(company_setup, product.id, {"operation": "invalid_op", "quantity": 5})
        detail = response.data.get("detail", "")
        assert "ValueError" not in detail
        assert "TypeError" not in detail
        assert "select_for_update" not in detail
        assert "Traceback" not in detail


class TestTrackerInvalidTransition:
    """Tracker status_change with a disallowed transition must surface a clear 400.

    Engine VALID_STATUSES are ACTIVE/IN_USE/RETURNED/EXPIRED/DISPOSED — we use
    ACTIVE→RETURNED (disallowed when only ACTIVE→IN_USE is configured) as the
    analog of the BROKEN→REPAIRED scenario from the playbook.
    """

    @pytest.mark.django_db
    def test_disallowed_transition_returns_400_with_clear_detail(
        self, company_setup, warehouse, external
    ):
        prod = ProductModel.objects.create(
            company=company_setup,
            name="Tracker",
            sku=f"TRK-{uuid.uuid4().hex[:6]}",
            profile="SERIALIZED",
            engine_config={
                "status_transitions": {
                    "ACTIVE": ["IN_USE"],
                    "IN_USE": ["RETURNED"],
                    "RETURNED": ["ACTIVE"],
                }
            },
        )
        pp = PhysicalProduct.objects.create(
            product_model=prod,
            identifier="SN-0001",
            status="ACTIVE",
            location=warehouse,
        )

        response = _call_view(
            company_setup,
            prod.id,
            {
                "operation": "status_change",
                "physical_product_id": str(pp.id),
                "new_status": "RETURNED",
            },
        )

        assert response.status_code == 400
        detail = response.data.get("detail", "")
        assert isinstance(detail, str) and detail
        assert "ACTIVE" in detail
        assert "RETURNED" in detail
        assert "select_for_update" not in detail
        # Item not mutated on rejected transition.
        pp.refresh_from_db()
        assert pp.status == "ACTIVE"
