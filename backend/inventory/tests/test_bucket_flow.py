import pytest
from rest_framework.test import APIClient
from inventory.models import ProductModel, Location, ProductBatch
from core.models import Company, ApiKey

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def setup_data(db):
    import uuid
    company = Company.objects.create(name="BucketFlowCo", license_code=uuid.uuid4().hex[:6].upper())
    api_key = ApiKey.objects.create(company=company, key=f"bkt_{uuid.uuid4().hex[:12]}")
    
    # Locations
    loc_wh = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")

    # Product
    prod = ProductModel.objects.create(
        company=company,
        sku="YOGURT",
        name="Yogurt",
        profile="BATCH_TRACKED",
    )
    
    return {
        "client": APIClient(),
        "key": api_key.key,
        "product": prod,
        "location": loc_wh
    }

@pytest.mark.django_db
def test_bucket_receive_and_consume(setup_data):
    client = setup_data["client"]
    key = setup_data["key"]
    prod = setup_data["product"]
    loc = setup_data["location"]

    # 1. RECEIVE (Add Batch)
    # Payload similar to what frontend SHOULD send
    payload_receive = {
        "product_id": str(prod.id),
        "location_id": str(loc.id),
        "quantity": 10,
        "reason": "Inbound Test",
        "batch_data": {
            "batch_identifier": "LOT-A",
            "data": {"expiry": "2025-01-01"}
        },
        "calc_payload": {
            "operation": "add",
            "quantity": 10
        }
    }
    
    resp = client.post(f"/api/v1/widget/move/?api_key={key}", payload_receive, format='json')
    assert resp.status_code == 200, resp.data
    
    # Verify Batch Created
    batch = ProductBatch.objects.get(product_model=prod, batch_identifier="LOT-A")
    assert batch.quantity == 10
    assert batch.location == loc
    assert batch.data['expiry'] == "2025-01-01"

    # 2. CONSUME (Remove from Batch)
    payload_consume = {
        "product_id": str(prod.id),
        "location_id": str(loc.id),
        "quantity": -5,
        "batch_id": str(batch.id),
        "calc_payload": {
            "operation": "subtract",
            "quantity": 5
        }
    }

    resp = client.post(f"/api/v1/widget/move/?api_key={key}", payload_consume, format='json')
    assert resp.status_code == 200, resp.data
    
    # Verify Deduction
    batch.refresh_from_db()
    assert batch.quantity == 5
