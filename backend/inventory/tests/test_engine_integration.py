"""
Engine integration tests: each engine type through full transaction cycle via API.
Tests counter, converter, bucket, tracker engines through the widget transaction endpoint.
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APIClient
from core.models import Company, User, ApiKey
from inventory.models import (
    ProductModel, Location,
    CalculatorTemplate, PhysicalProduct,
)
from inventory.services import LedgerService, StockService


@pytest.fixture
def engine_env(db):
    """Base environment for engine integration tests."""
    company = Company.objects.create(name="Engine Corp", license_code="ENGN01")

    user = User.objects.create_user(username="engine_admin", password="password", company=company)
    api_key = ApiKey.objects.create(company=company, label="Engine Key", key="engine-test-key")

    supplier = Location.objects.create(company=company, name="External", type="VIRTUAL")
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")

    client = APIClient()

    return {
        "company": company,
        "user": user,
        "api_key": api_key,
        "supplier": supplier,
        "warehouse": warehouse,
        "client": client,
    }


@pytest.mark.django_db
class TestCounterEngineIntegration:
    """Counter engine: discrete add/subtract via API."""

    def test_counter_add_and_subtract(self, engine_env):
        product = ProductModel.objects.create(
            company=engine_env["company"],
            sku="COUNTER-001",
            name="Counter Widget",
            profile="SIMPLE_COUNT",
        )
        # Seed stock
        LedgerService.transfer_stock(
            product, engine_env["supplier"], engine_env["warehouse"],
            Decimal("100"), engine_env["user"], "Seed",
        )

        client = engine_env["client"]
        key = engine_env["api_key"].key
        tx_url = reverse("widget-transaction", kwargs={"pk": str(product.id)})

        # Add 25
        resp = client.post(
            f"{tx_url}?api_key={key}",
            {"operation": "add", "quantity": 25, "location_id": str(engine_env["warehouse"].id)},
            format="json",
        )
        assert resp.status_code == 200

        stock = StockService.get_stock_for_location(product, engine_env["warehouse"])
        assert stock == Decimal("125")

        # Subtract 10
        resp = client.post(
            f"{tx_url}?api_key={key}",
            {"operation": "subtract", "quantity": 10, "location_id": str(engine_env["warehouse"].id)},
            format="json",
        )
        assert resp.status_code == 200

        stock = StockService.get_stock_for_location(product, engine_env["warehouse"])
        assert stock == Decimal("115")


@pytest.mark.django_db
class TestBucketEngineIntegration:
    """Bucket engine: segmented stock with batches via API."""

    def test_bucket_add_with_batch(self, engine_env):
        product = ProductModel.objects.create(
            company=engine_env["company"],
            sku="BUCKET-001",
            name="Bucket Widget",
            profile="BATCH_TRACKED",
        )

        client = engine_env["client"]
        key = engine_env["api_key"].key
        tx_url = reverse("widget-transaction", kwargs={"pk": str(product.id)})

        # Add via bucket
        resp = client.post(
            f"{tx_url}?api_key={key}",
            {
                "operation": "add",
                "quantity": 30,
                "location_id": str(engine_env["warehouse"].id),
                "bucket_data": {"batch_identifier": "BATCH-A"},
            },
            format="json",
        )
        assert resp.status_code == 200

        stock = StockService.get_stock_for_location(product, engine_env["warehouse"])
        assert stock == Decimal("30")


@pytest.mark.django_db
class TestTrackerEngineIntegration:
    """Tracker engine: individual item tracking via API."""

    def test_tracker_individual_items(self, engine_env):
        product = ProductModel.objects.create(
            company=engine_env["company"],
            sku="TRACK-001",
            name="Tracker Widget",
            profile="SERIALIZED",
        )

        # Create physical items
        item1 = PhysicalProduct.objects.create(
            product_model=product,
            identifier="SN-001",
            status="ACTIVE",
            location=engine_env["warehouse"],
        )
        item2 = PhysicalProduct.objects.create(
            product_model=product,
            identifier="SN-002",
            status="ACTIVE",
            location=engine_env["warehouse"],
        )

        # Seed stock for the items via ledger
        LedgerService.transfer_stock(
            product, engine_env["supplier"], engine_env["warehouse"],
            Decimal("1"), engine_env["user"], "Item SN-001 inbound",
            physical_product=item1,
        )
        LedgerService.transfer_stock(
            product, engine_env["supplier"], engine_env["warehouse"],
            Decimal("1"), engine_env["user"], "Item SN-002 inbound",
            physical_product=item2,
        )

        stock = StockService.get_stock_for_location(product, engine_env["warehouse"])
        assert stock == Decimal("2")

        # Retrieve product detail via widget API
        client = engine_env["client"]
        key = engine_env["api_key"].key
        detail_url = reverse("widget-detail", kwargs={"pk": str(product.id)})

        resp = client.get(f"{detail_url}?api_key={key}")
        assert resp.status_code == 200

        data = resp.json()
        assert data["engine"] == "tracker"
        # stock_value should list individual items
        assert isinstance(data["stock_value"], list)
        identifiers = [item["identifier"] for item in data["stock_value"]]
        assert "SN-001" in identifiers
        assert "SN-002" in identifiers
