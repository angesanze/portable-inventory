import pytest
from rest_framework.test import APIClient
from inventory.models import ProductModel, Location, Movement
from core.models import User, Company

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def simple_user_company(db):
    from core.models import Company, User
    company = Company.objects.create(name="TestCo", license_code="TEST01")
    user = User.objects.create_user(username="test_user", password="testpass123", company=company, role="Admin")

    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return user, company, api_client

@pytest.mark.django_db
def test_create_product_with_initial_balance(simple_user_company):
    user, company, client = simple_user_company
    
    # Ensure locations exist
    Location.objects.get_or_create(company=company, name="Main Warehouse", type="WAREHOUSE")
    
    payload = {
        "sku": "INIT-001",
        "name": "Initial Stock Test",
        "profile": "SIMPLE_COUNT",
        "initial_balance": 50.5
    }

    response = client.post('/api/v1/product-models/', payload, format='json')
    assert response.status_code == 201

    product = ProductModel.objects.get(sku="INIT-001")
    assert product.initial_balance == 50.5

    # Check for Movement
    movements = Movement.objects.filter(product_model=product)
    assert movements.count() == 1
    mv = movements.first()
    assert mv.quantity == 50.5
    assert mv.reason == "Initial Stock Onboarding"
    assert mv.from_location.type == "VIRTUAL"
    assert mv.to_location.type == "WAREHOUSE"
