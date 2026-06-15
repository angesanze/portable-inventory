
import pytest
from decimal import Decimal
from unittest.mock import MagicMock, patch
from django.utils import timezone
from datetime import timedelta
import uuid
from rest_framework.test import APIClient
from inventory.models import ProductModel, Location, PhysicalProduct
from inventory.engines import CounterEngine
from inventory.api.public.viewsets.products import ProductWidgetViewSet
from core.models import Company
from inventory.services import StockService, LedgerService

@pytest.mark.django_db
def test_counter_engine_step():
    """Test Issue 2: CounterEngine step should be 1"""
    product = ProductModel(profile='SIMPLE_COUNT', engine_config={})
    engine = CounterEngine(product, {})
    config = engine.get_ui_config()
    assert config['step'] == 1.0, f"Expected step 1.0, got {config.get('step')}"
    assert isinstance(config['step'], float), "step should be numeric (float)"

@pytest.mark.django_db
def test_counter_engine_step_string_config():
    """step provided as string in config should be cast to float"""
    product = ProductModel(profile='SIMPLE_COUNT', engine_config={"step": "0.5"})
    engine = CounterEngine(product, {"step": "0.5"})
    config = engine.get_ui_config()
    assert config['step'] == 0.5
    assert isinstance(config['step'], float)


@pytest.mark.django_db
def test_counter_format_stock_display_integer_with_unit():
    """Integer stock with input_label appends unit suffix."""
    product = ProductModel(profile='SIMPLE_COUNT', engine_config={"input_label": "Kg"})
    engine = CounterEngine(product, {"input_label": "Kg"})
    assert engine.format_stock_display(120) == "120 Kg"


@pytest.mark.django_db
def test_counter_format_stock_display_decimal_with_unit():
    """Decimal stock with input_label appends unit suffix preserving 2 decimals."""
    product = ProductModel(profile='SIMPLE_COUNT', engine_config={"input_label": "L"})
    engine = CounterEngine(product, {"input_label": "L"})
    assert engine.format_stock_display(12.5) == "12.50 L"


@pytest.mark.django_db
def test_counter_format_stock_display_no_unit_key_unchanged():
    """When input_label key absent from config, output is bare numeric (runtime default 'Quantity' ignored)."""
    product = ProductModel(profile='SIMPLE_COUNT', engine_config={})
    engine = CounterEngine(product, {})
    assert engine.format_stock_display(120) == "120"
    assert engine.format_stock_display(12.5) == "12.50"


@pytest.mark.django_db
def test_counter_format_stock_display_empty_unit_unchanged():
    """Empty-string input_label produces bare numeric output."""
    product = ProductModel(profile='SIMPLE_COUNT', engine_config={"input_label": ""})
    engine = CounterEngine(product, {"input_label": ""})
    assert engine.format_stock_display(120) == "120"
    assert engine.format_stock_display(12.5) == "12.50"


@pytest.mark.django_db
def test_counter_format_stock_display_whitespace_only_unit_unchanged():
    """Whitespace-only input_label treated as no unit."""
    product = ProductModel(profile='SIMPLE_COUNT', engine_config={"input_label": "   "})
    engine = CounterEngine(product, {"input_label": "   "})
    assert engine.format_stock_display(120) == "120"

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def company_setup(db):
    code = uuid.uuid4().hex[:6].upper()
    comp = Company.objects.create(name="TestCo", license_code=code)
    return comp

@pytest.fixture
def mock_auth(company_setup):
    api_key = MagicMock()
    api_key.company = company_setup
    return api_key

@pytest.mark.django_db
def test_transaction_serialized_logic(company_setup, mock_auth):
    """Test Issue 1: Transaction logic handles physical_product extraction"""
    wh = Location.objects.create(name="Warehouse", type="WAREHOUSE", company=company_setup)
    ext = Location.objects.create(name="External", type="VIRTUAL", company=company_setup)
    
    product = ProductModel.objects.create(
        company=company_setup,
        name="Serial Prod",
        sku=f"SER-{uuid.uuid4()}",
        profile="SERIALIZED"
    )
    pp = PhysicalProduct.objects.create(
        product_model=product,
        identifier=f"SN-{uuid.uuid4()}",
        location=wh,
        status="ACTIVE"
    )
    
    view = ProductWidgetViewSet()
    view.request = MagicMock()
    view.request.data = {
        "operation": "subtract",
        "quantity": 1,
        "physical_product_id": str(pp.id)
    }
    view.limit_queryset = MagicMock()
    
    with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
        with patch('inventory.services.LedgerService.transfer_stock') as mock_ledger:
            view.transaction(view.request, pk=str(product.id))
            
            assert mock_ledger.called
            call_args = mock_ledger.call_args
            assert call_args.kwargs.get('physical_product') == pp

@pytest.mark.django_db
def test_transaction_serialized_fifo_fallback(company_setup, mock_auth):
    """Test FIFO Fallback: Subtracting serialized item without ID should pick oldest."""
    wh = Location.objects.create(name="Warehouse FIFO", type="WAREHOUSE", company=company_setup)
    ext = Location.objects.create(name="External", type="VIRTUAL", company=company_setup)
    
    product = ProductModel.objects.create(
        company=company_setup,
        name="Serial FIFO",
        sku=f"SER-FIFO-{uuid.uuid4()}",
        profile="SERIALIZED"
    )
    
    pp1 = PhysicalProduct.objects.create(
        product_model=product, 
        identifier=f"SN-OLD-{uuid.uuid4()}", 
        location=wh, 
        status="ACTIVE"
    )
    # Manually set batch_date in past
    pp1.batch_date = timezone.now().date() - timedelta(days=1)
    pp1.save()
    
    pp2 = PhysicalProduct.objects.create(
        product_model=product, 
        identifier=f"SN-NEW-{uuid.uuid4()}", 
        location=wh, 
        status="ACTIVE",
        batch_date=timezone.now().date()
    )
    
    view = ProductWidgetViewSet()
    view.request = MagicMock()
    # Simulate valid request WITHOUT ID
    view.request.data = {
        "operation": "subtract",
        "quantity": 1,
        "location_id": str(wh.id)
    }
    view.request.query_params = {'location_id': str(wh.id)}
    view.limit_queryset = MagicMock()
    
    with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
        with patch('inventory.services.LedgerService.transfer_stock') as mock_ledger:
            response = view.transaction(view.request, pk=str(product.id))
            print(f"DEBUG RESPONSE: {response.data}")
            assert mock_ledger.called
            call_args = mock_ledger.call_args
            # Should pick pp1 (Oldest)
            assert call_args.kwargs.get('physical_product') == pp1

@pytest.mark.django_db
def test_list_location_filtering(company_setup, mock_auth):
    """Test Issue 3: List method filters logic"""
    loc = Location.objects.create(name="Loc A", type="WAREHOUSE", company=company_setup)
    product = ProductModel.objects.create(company=company_setup, name="Prod A", sku=f"SKU-A-{uuid.uuid4()}")
    
    view = ProductWidgetViewSet()
    view.request = MagicMock()
    view.request.query_params = {'location_id': str(loc.id)}
    
    with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
        with patch('inventory.services.widget_product.StockService') as mock_stock_service:
            # Mock return 5
            mock_stock_service.get_stock_for_location.return_value = Decimal('5')
            mock_stock_service.get_stock_for_model.return_value = {'total': Decimal('10')}
            
            response = view.list(view.request)
            
            mock_stock_service.get_stock_for_location.assert_called_with(product, loc)
            assert response.data['products'][0]['quantity'] == Decimal('5')

@pytest.mark.django_db
def test_widget_product_payload_exposes_status_transitions(company_setup, mock_auth):
    """SERIALIZED+tracker product payload must include status_transitions in calc_config.ui_config."""
    from inventory.services.widget_product import WidgetProductService
    transitions = {"ACTIVE": ["BROKEN"], "BROKEN": ["REPAIRED"], "REPAIRED": ["ACTIVE"]}
    product = ProductModel.objects.create(
        company=company_setup,
        name="Tracker Prod",
        sku=f"TRK-{uuid.uuid4()}",
        profile="SERIALIZED",
        engine_config={"status_transitions": transitions},
    )
    data = WidgetProductService.get_widget_products(company_setup)
    item = next(p for p in data if p['id'] == str(product.id))
    assert 'calc_config' in item
    assert item['calc_config']['ui_config'].get('status_transitions') == transitions


@pytest.mark.django_db
def test_widget_transaction_dispatches_status_change_on_new_status(company_setup, mock_auth):
    """Widget transaction with new_status field routes to TrackerStatusBehavior (no quantity required)."""
    wh = Location.objects.create(name="Warehouse TK", type="WAREHOUSE", company=company_setup)
    transitions = {"ACTIVE": ["IN_USE"], "IN_USE": ["RETURNED"]}
    product = ProductModel.objects.create(
        company=company_setup,
        name="Tracker Item",
        sku=f"TRK-DISP-{uuid.uuid4()}",
        profile="SERIALIZED",
        engine_config={"status_transitions": transitions},
    )
    pp = PhysicalProduct.objects.create(
        product_model=product,
        identifier=f"TRK-SN-{uuid.uuid4()}",
        location=wh,
        status="ACTIVE",
    )
    view = ProductWidgetViewSet()
    view.request = MagicMock()
    view.request.data = {
        "operation": "add",  # arbitrary — backend should dispatch on new_status
        "physical_identifier": pp.identifier,
        "new_status": "IN_USE",
        "notes": "smoke test",
    }
    with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
        response = view.transaction(view.request, pk=str(product.id))
    pp.refresh_from_db()
    assert pp.status == "IN_USE"
    assert response.status_code == 200


@pytest.mark.django_db
def test_list_location_filtering_zero_stock(company_setup, mock_auth):
    """Test Issue 3: List method excludes zero stock items if location_id is present"""
    loc = Location.objects.create(name="Loc Zero", type="WAREHOUSE", company=company_setup)
    product = ProductModel.objects.create(company=company_setup, name="Prod Zero", sku=f"SKU-Z-{uuid.uuid4()}")
    
    view = ProductWidgetViewSet()
    view.request = MagicMock()
    view.request.query_params = {'location_id': str(loc.id)}
    
    with patch.object(ProductWidgetViewSet, '_validate_api_key', return_value=mock_auth):
        with patch('inventory.services.widget_product.StockService') as mock_stock_service:
            # Mock return 0
            mock_stock_service.get_stock_for_location.return_value = Decimal('0')
            
            response = view.list(view.request)
            
            # Verify Response Data is empty
            assert len(response.data['products']) == 0
