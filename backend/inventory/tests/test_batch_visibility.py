import pytest
from decimal import Decimal
import uuid
from inventory.models import ProductModel, Location, ProductBatch
from inventory.services import StockService
from core.models import Company


@pytest.fixture
def company_setup(db):
    code = uuid.uuid4().hex[:6].upper()
    comp = Company.objects.create(name="TestCo", license_code=code)
    return comp


@pytest.mark.django_db
def test_batch_stock_filtering_by_location(company_setup):
    """
    Test that StockService.get_stock_for_location correctly filters
    BATCH/BUCKET products by location.
    """
    company = company_setup

    # Create 2 Locations
    loc_A = Location.objects.create(name="Warehouse A", type="WAREHOUSE", company=company)
    loc_B = Location.objects.create(name="Warehouse B", type="WAREHOUSE", company=company)

    # Create Product
    product = ProductModel.objects.create(
        company=company, name="Batch Product", sku=f"BATCH-{uuid.uuid4()}", profile="BATCH_TRACKED"
    )

    # Add Stock to Location A ONLY
    ProductBatch.objects.create(
        product_model=product,
        location=loc_A,
        quantity=Decimal("100"),
        batch_identifier="BATCH-001",
        data={},
    )

    # Verify Stock in A
    stock_A = StockService.get_stock_for_location(product, loc_A)
    assert stock_A == 100, f"Expected 100 in A, got {stock_A}"

    # Verify Stock in B (Should be 0)
    stock_B = StockService.get_stock_for_location(product, loc_B)
    assert stock_B == 0, f"Expected 0 in B, got {stock_B}"

    # Verify Widget ViewSet Logic (simulated)
    # The viewset calls get_stock_for_location and filters if > 0

    should_show_in_A = stock_A > 0
    should_show_in_B = stock_B > 0

    assert should_show_in_A is True
    assert should_show_in_B is False
