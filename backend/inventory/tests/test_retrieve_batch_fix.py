import pytest
import uuid
from inventory.models import ProductModel, Location, ProductBatch
from rest_framework.test import APIClient
from core.models import Company, ApiKey


@pytest.fixture
def company_setup(db):
    comp = Company.objects.create(name="Batch Fix Co", license_code=uuid.uuid4().hex[:6].upper())
    return comp


@pytest.mark.django_db
def test_retrieve_batches_filtered_by_location(company_setup):
    """
    Test that retrieving a BUCKET product with location_id
    only returns batches in that location.
    """
    company = company_setup
    api_key = ApiKey.objects.create(company=company, key=f"testk_{uuid.uuid4()}", label="Test Key")

    # Create Locations
    loc_A = Location.objects.create(name="Warehouse A", type="WAREHOUSE", company=company)
    loc_B = Location.objects.create(name="Warehouse B", type="WAREHOUSE", company=company)

    # Create Product
    product = ProductModel.objects.create(
        company=company, name="Batch Prod", sku=f"BP-{uuid.uuid4()}", profile="BATCH_TRACKED"
    )

    # Create Batches
    # Batch 1 in A
    ProductBatch.objects.create(
        product_model=product, location=loc_A, quantity=10, batch_identifier="B-IN-A", data={}
    )
    # Batch 2 in B
    ProductBatch.objects.create(
        product_model=product, location=loc_B, quantity=20, batch_identifier="B-IN-B", data={}
    )

    client = APIClient()

    # Challenge: Retrieve for Location A
    url = f"/api/v1/widget/{product.id}/?api_key={api_key.key}&location_id={loc_A.id}"
    response = client.get(url)

    assert response.status_code == 200
    data = response.json()

    # Check 'stock_value' list
    batches = data["stock_value"]
    # Verify structure includes location_id (from our latest fix) if it's a batch list
    # Note: retrieval for Bucket items returns list of batches.
    # The previous fix was for Widget.retrieve.
    # We should ALSO test InventoryQueryViewSet.batches if possible, but let's stick to the Widget.retrieve fix first.

    batch_ids = [b["batch_identifier"] for b in batches]

    # Should ONLY verify B-IN-A
    assert "B-IN-A" in batch_ids
    assert "B-IN-B" not in batch_ids, "Found batch from Location B when filtering for A!"

    # Challenge: Retrieve for Location B
    url_B = f"/api/v1/widget/{product.id}/?api_key={api_key.key}&location_id={loc_B.id}"
    res_B = client.get(url_B)
    data_B = res_B.json()
    batches_B = data_B["stock_value"]
    batch_ids_B = [b["batch_identifier"] for b in batches_B]

    assert "B-IN-B" in batch_ids_B
    assert "B-IN-A" not in batch_ids_B
