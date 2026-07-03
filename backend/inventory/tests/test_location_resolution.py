"""Tests for location resolution heuristic in WidgetTransactionService."""

import pytest
import uuid
from unittest.mock import MagicMock, patch

from core.models import Company
from inventory.models import ProductModel, Location
from inventory.exceptions import InventoryError
from inventory.services.widget_transaction import WidgetTransactionService


@pytest.fixture
def company(db):
    code = uuid.uuid4().hex[:6].upper()
    comp = Company.objects.create(name="TestCo", license_code=code)
    # Remove auto-seeded physical locations so tests control location state
    Location.objects.filter(company=comp, type__in=["WAREHOUSE", "PHYSICAL", "STORE"]).delete()
    return comp


@pytest.fixture
def product(company):
    return ProductModel.objects.create(
        company=company, name="Loc Test", sku=f"LOC-{uuid.uuid4().hex[:6]}"
    )


@pytest.fixture
def external(company):
    return Location.objects.create(name="External", type="VIRTUAL", company=company)


class TestLocationResolution:
    """Test the 4-tier location resolution: explicit > api_key default > single location > error."""

    @pytest.mark.django_db
    def test_explicit_location_id_used(self, company, product, external):
        """location_id in request data takes priority."""
        wh1 = Location.objects.create(name="WH1", type="WAREHOUSE", company=company)
        wh2 = Location.objects.create(name="WH2", type="WAREHOUSE", company=company)

        with patch("inventory.services.widget_transaction.LedgerService.transfer_stock") as mock_ts:
            WidgetTransactionService.process_transaction(
                company,
                "test-key",
                str(product.id),
                {"operation": "add", "quantity": 1, "location_id": str(wh2.id)},
            )
            call_kwargs = mock_ts.call_args[1]
            # wh2 should be used as either source or destination
            locations = {call_kwargs.get("from_location"), call_kwargs.get("to_location")}
            assert wh2 in locations

    @pytest.mark.django_db
    def test_api_key_default_location_used(self, company, product, external):
        """When no location_id, api_key.default_location used."""
        wh1 = Location.objects.create(name="WH1", type="WAREHOUSE", company=company)
        wh2 = Location.objects.create(name="WH2", type="WAREHOUSE", company=company)

        api_key = MagicMock()
        api_key.label = "test-key"
        api_key.default_location = wh2

        with patch("inventory.services.widget_transaction.LedgerService.transfer_stock") as mock_ts:
            WidgetTransactionService.process_transaction(
                company, api_key, str(product.id), {"operation": "add", "quantity": 1}
            )
            call_kwargs = mock_ts.call_args[1]
            locations = {call_kwargs.get("from_location"), call_kwargs.get("to_location")}
            assert wh2 in locations

    @pytest.mark.django_db
    def test_single_location_auto_selected(self, company, product, external):
        """Company with exactly one physical location — auto-select it."""
        wh = Location.objects.create(name="Only WH", type="WAREHOUSE", company=company)

        with patch("inventory.services.widget_transaction.LedgerService.transfer_stock") as mock_ts:
            WidgetTransactionService.process_transaction(
                company, "test-key", str(product.id), {"operation": "add", "quantity": 1}
            )
            call_kwargs = mock_ts.call_args[1]
            locations = {call_kwargs.get("from_location"), call_kwargs.get("to_location")}
            assert wh in locations

    @pytest.mark.django_db
    def test_multiple_locations_no_default_raises(self, company, product, external):
        """Multiple locations + no location_id + no default = error."""
        Location.objects.create(name="WH1", type="WAREHOUSE", company=company)
        Location.objects.create(name="WH2", type="WAREHOUSE", company=company)

        with pytest.raises(InventoryError, match="Multiple locations found"):
            WidgetTransactionService.process_transaction(
                company, "test-key", str(product.id), {"operation": "add", "quantity": 1}
            )

    @pytest.mark.django_db
    def test_no_locations_raises(self, company, product, external):
        """No physical locations at all = error."""
        # Remove any auto-created physical locations
        Location.objects.filter(company=company).exclude(type="VIRTUAL").delete()

        with pytest.raises(InventoryError, match="No Warehouse found"):
            WidgetTransactionService.process_transaction(
                company, "test-key", str(product.id), {"operation": "add", "quantity": 1}
            )

    @pytest.mark.django_db
    def test_explicit_location_id_overrides_default(self, company, product, external):
        """location_id takes priority over api_key.default_location."""
        wh1 = Location.objects.create(name="WH1", type="WAREHOUSE", company=company)
        wh2 = Location.objects.create(name="WH2", type="WAREHOUSE", company=company)

        api_key = MagicMock()
        api_key.label = "test-key"
        api_key.default_location = wh1  # default is wh1

        with patch("inventory.services.widget_transaction.LedgerService.transfer_stock") as mock_ts:
            WidgetTransactionService.process_transaction(
                company,
                api_key,
                str(product.id),
                {"operation": "add", "quantity": 1, "location_id": str(wh2.id)},  # explicit wh2
            )
            call_kwargs = mock_ts.call_args[1]
            locations = {call_kwargs.get("from_location"), call_kwargs.get("to_location")}
            assert wh2 in locations

    @pytest.mark.django_db
    def test_string_api_key_backward_compat(self, company, product, external):
        """Passing a plain string as api_key still works (backward compat)."""
        Location.objects.create(name="WH", type="WAREHOUSE", company=company)

        with patch("inventory.services.widget_transaction.LedgerService.transfer_stock") as mock_ts:
            WidgetTransactionService.process_transaction(
                company, "legacy-key", str(product.id), {"operation": "add", "quantity": 1}
            )
            call_kwargs = mock_ts.call_args[1]
            assert "legacy-key" in call_kwargs["reason"]
