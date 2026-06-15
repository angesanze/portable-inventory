"""
End-to-end widget flow tests:
  create product → get stock → add transaction → verify stock changed → move between locations
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APIClient
from core.models import Company, User, ApiKey
from inventory.models import ProductModel, Location, Movement
from inventory.services import LedgerService, StockService


@pytest.fixture
def widget_env(db):
    """Full widget environment: company, user, API key, locations, product with stock."""
    company = Company.objects.create(name="E2E Corp", license_code="E2ETST")

    user = User.objects.create_user(username="e2e_admin", password="password", company=company)

    api_key = ApiKey.objects.create(company=company, label="E2E Key", key="e2e-test-key")

    supplier = Location.objects.create(company=company, name="External", type="VIRTUAL")
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    store = Location.objects.create(company=company, name="Store", type="STORE")

    product = ProductModel.objects.create(
        company=company, sku="E2E-001", name="E2E Widget",
    )

    # Seed 50 units into warehouse
    LedgerService.transfer_stock(product, supplier, warehouse, Decimal("50"), user, "Initial stock")

    client = APIClient()

    return {
        "company": company,
        "user": user,
        "api_key": api_key,
        "supplier": supplier,
        "warehouse": warehouse,
        "store": store,
        "product": product,
        "client": client,
    }


@pytest.mark.django_db
class TestWidgetE2EFlow:
    """Full widget lifecycle: list → detail → transaction → verify stock → transfer."""

    def test_list_products_returns_stock(self, widget_env):
        """Widget list endpoint returns products with correct stock."""
        client = widget_env["client"]
        url = reverse("widget-list")

        resp = client.get(url, {"api_key": widget_env["api_key"].key})
        assert resp.status_code == 200

        data = resp.json()
        assert data["company"] == "E2E Corp"
        assert len(data["products"]) >= 1

        p = next(p for p in data["products"] if p["sku"] == "E2E-001")
        assert p["quantity"] == 50

    def test_retrieve_product_detail(self, widget_env):
        """Widget detail returns product info and stock."""
        client = widget_env["client"]
        product = widget_env["product"]
        url = reverse("widget-detail", kwargs={"pk": str(product.id)})

        resp = client.get(url, {"api_key": widget_env["api_key"].key})
        assert resp.status_code == 200

        data = resp.json()
        assert data["product_name"] == "E2E Widget"
        assert data["sku"] == "E2E-001"

    def test_full_add_subtract_flow(self, widget_env):
        """Add stock via widget API, verify increase, subtract, verify decrease."""
        client = widget_env["client"]
        product = widget_env["product"]
        warehouse = widget_env["warehouse"]
        key = widget_env["api_key"].key

        # 1. Add 20 via move endpoint (positive quantity = Inbound)
        move_url = reverse("widget-move")
        resp = client.post(
            f"{move_url}?api_key={key}",
            {
                "product_id": str(product.id),
                "location_id": str(warehouse.id),
                "quantity": 20,
            },
            format="json",
        )
        assert resp.status_code == 200

        # Verify stock increased: 50 + 20 = 70
        stock = StockService.get_stock_for_location(product, warehouse)
        assert stock == Decimal("70")

        # 2. Subtract 10 (negative quantity = Outbound)
        resp = client.post(
            f"{move_url}?api_key={key}",
            {
                "product_id": str(product.id),
                "location_id": str(warehouse.id),
                "quantity": -10,
            },
            format="json",
        )
        assert resp.status_code == 200

        # Verify stock: 70 - 10 = 60
        stock = StockService.get_stock_for_location(product, warehouse)
        assert stock == Decimal("60")

    def test_transfer_between_locations(self, widget_env):
        """Transfer stock between warehouse and store, verify both balances."""
        client = widget_env["client"]
        product = widget_env["product"]
        warehouse = widget_env["warehouse"]
        store = widget_env["store"]
        key = widget_env["api_key"].key

        transfer_url = reverse("widget-transfer")
        resp = client.post(
            f"{transfer_url}?api_key={key}",
            {
                "product_id": str(product.id),
                "from_location_id": str(warehouse.id),
                "to_location_id": str(store.id),
                "quantity": 15,
                "reason": "Restock store",
            },
            format="json",
        )
        assert resp.status_code == 200

        wh_stock = StockService.get_stock_for_location(product, warehouse)
        store_stock = StockService.get_stock_for_location(product, store)
        assert wh_stock == Decimal("35")
        assert store_stock == Decimal("15")

        # Verify conservation: total system stock unchanged
        total = StockService.get_stock_for_model(product)
        assert total["total"] == Decimal("50")

    def test_locations_endpoint(self, widget_env):
        """Widget locations endpoint returns company locations."""
        client = widget_env["client"]
        url = reverse("widget-locations")

        resp = client.get(url, {"api_key": widget_env["api_key"].key})
        assert resp.status_code == 200

        names = [loc["name"] for loc in resp.json()]
        assert "Warehouse" in names

    def test_insufficient_stock_transfer(self, widget_env):
        """Transfer more than available stock returns error."""
        client = widget_env["client"]
        product = widget_env["product"]
        warehouse = widget_env["warehouse"]
        store = widget_env["store"]
        key = widget_env["api_key"].key

        transfer_url = reverse("widget-transfer")
        resp = client.post(
            f"{transfer_url}?api_key={key}",
            {
                "product_id": str(product.id),
                "from_location_id": str(warehouse.id),
                "to_location_id": str(store.id),
                "quantity": 999,
            },
            format="json",
        )
        # Should fail — insufficient stock (409)
        assert resp.status_code == 409

    def test_unauthenticated_access_denied(self, widget_env):
        """No API key = 401."""
        client = widget_env["client"]
        resp = client.get(reverse("widget-list"))
        assert resp.status_code == 401

    def test_cross_company_isolation(self, widget_env):
        """Products from other companies not visible."""
        # Create second company
        other_company = Company.objects.create(name="Other Corp", license_code="OTRCO1")
        ProductModel.objects.create(company=other_company, sku="OTHER-001", name="Other Product")

        client = widget_env["client"]
        resp = client.get(reverse("widget-list"), {"api_key": widget_env["api_key"].key})
        assert resp.status_code == 200

        skus = [p["sku"] for p in resp.json()["products"]]
        assert "OTHER-001" not in skus
        assert "E2E-001" in skus
