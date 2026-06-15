import pytest
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APIClient
from core.models import Company, User
from inventory.models import ProductModel, Location, Movement
from inventory.services import LedgerService

@pytest.fixture
def test_env(db):
    """Fixture that sets up the standard test environment with an API client"""
    company = Company.objects.create(name="Acme Corp", license_code="ACME01")
    user = User.objects.create_user(username="manager", password="password", company=company)
    
    supplier = Location.objects.create(company=company, name="Supplier", type="VIRTUAL")
    warehouse = Location.objects.create(company=company, name="Warehouse A", type="WAREHOUSE")
    
    client = APIClient()
    client.force_authenticate(user=user)
    
    return {
        "company": company,
        "user": user,
        "client": client,
        "supplier": supplier,
        "warehouse": warehouse
    }

def test_delete_unused_product(test_env):
    """Test that a product with no history can be deleted"""
    product = ProductModel.objects.create(
        company=test_env['company'], 
        sku="UNUSED-001", 
        name="Unused Product"
    )
    
    response = test_env['client'].delete(f'/api/v1/product-models/{product.id}/')
    
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not ProductModel.objects.filter(id=product.id).exists()

def test_delete_product_with_history_fails_gracefully(test_env):
    """Test that deleting a product with movement history returns 400 instead of 500"""
    product = ProductModel.objects.create(
        company=test_env['company'], 
        sku="USED-001", 
        name="Used Product"
    )
    
    # Create history (Movement)
    # This creates a Movement which has on_delete=PROTECT for product_model
    LedgerService.transfer_stock(
        product_model=product,
        from_location=test_env['supplier'],
        to_location=test_env['warehouse'],
        quantity=Decimal("10"),
        user=test_env['user'],
        reason="Initial Stock"
    )
    
    # Attempt to delete
    # Now this should succeed (204) and cascade delete movements
    response = test_env['client'].delete(f'/api/v1/product-models/{product.id}/')
    
    assert response.status_code == status.HTTP_204_NO_CONTENT
    
    # Verify Product is gone
    assert not ProductModel.objects.filter(id=product.id).exists()
    
    # Verify Movement is gone (Cascade)
    assert not Movement.objects.filter(product_model_id=product.id).exists()
