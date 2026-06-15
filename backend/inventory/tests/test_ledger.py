import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError
from inventory.exceptions import InsufficientStockError
from core.models import Company, User
from inventory.models import ProductModel, Location, Movement
from inventory.services import LedgerService, StockService

@pytest.fixture
def test_data(db):
    """Fixture that sets up the standard test environment"""
    company = Company.objects.create(name="Acme Corp", license_code="LEDGER")
    user = User.objects.create_user(username="manager", password="password", company=company)
    
    supplier = Location.objects.create(company=company, name="Supplier", type="VIRTUAL")
    warehouse = Location.objects.create(company=company, name="Warehouse A", type="WAREHOUSE")
    store = Location.objects.create(company=company, name="Store 1", type="STORE")
    
    product = ProductModel.objects.create(company=company, sku="COFFEE-001", name="Premium Arabica", attributes={"roast": "medium"})
    
    # Initial Stock
    LedgerService.transfer_stock(product, supplier, warehouse, Decimal("100"), user, "Initial Purchase")
    
    return {
        "company": company,
        "user": user,
        "supplier": supplier,
        "warehouse": warehouse,
        "store": store,
        "product": product
    }

def test_transfer_stock_success(test_data):
    """Test standard stock movement between locations"""
    product = test_data['product']
    warehouse = test_data['warehouse']
    store = test_data['store']
    user = test_data['user']
    supplier = test_data['supplier']

    # Move 30 from Warehouse to Store
    LedgerService.transfer_stock(product, warehouse, store, Decimal("30"), user, "Restock Store")
    
    sys_stock = StockService.get_stock_for_model(product)
    
    # Verify Total (Conservation of Mass)
    # Virtual location acts as a source, so total stock in system increases
    assert sys_stock['total'] == 100 
    
    # Verify Breakdown
    assert sys_stock['breakdown']['Warehouse A'] == 70
    assert sys_stock['breakdown']['Store 1'] == 30
    
    # Verify Supplier (Virtual) balance explicitly
    assert StockService.get_stock_for_location(product, supplier) == -100

def test_transfer_insufficient_funds(test_data):
    """Test that moving more than available raises ValidationError"""
    product = test_data['product']
    warehouse = test_data['warehouse']
    store = test_data['store']
    user = test_data['user']

    # Try to move 150 (only 100 available)
    with pytest.raises(InsufficientStockError) as exc_info:
        LedgerService.transfer_stock(product, warehouse, store, Decimal("150"), user, "Fail Test")

    assert "Insufficient available stock" in str(exc_info.value)

def test_immutability(test_data):
    """Test that movements cannot be modified after creation"""
    product = test_data['product']
    warehouse = test_data['warehouse']
    user = test_data['user']
    
    # Get the initial movement (Supplier -> Warehouse)
    movement = Movement.objects.filter(product_model=product, to_location=warehouse).first()
    
    # Try to change quantity
    movement.quantity = Decimal("500")
    
    with pytest.raises(ValidationError) as excinfo:
        movement.save()
        
    assert "Movement records are immutable" in str(excinfo.value)

def test_idempotency(test_data):
    """Reusing an idempotency key replays the original movement (no duplicate, no error)."""
    product = test_data['product']
    warehouse = test_data['warehouse']
    store = test_data['store']
    user = test_data['user']
    import uuid

    key = str(uuid.uuid4())

    # First Move - Should Succeed
    first = LedgerService.transfer_stock(product, warehouse, store, Decimal("10"), user, "Run 1", idempotency_key=key)

    # Second Move with same key — idempotent replay: returns the original
    # Movement instead of raising (clients retry after timeouts).
    second = LedgerService.transfer_stock(product, warehouse, store, Decimal("10"), user, "Run 2", idempotency_key=key)

    assert second.id == first.id
    assert Movement.objects.filter(idempotency_key=key).count() == 1
