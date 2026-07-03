from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Company, User
from inventory.models import ProductModel, Location


class CreateProductInitialBalanceTest(TestCase):
    def setUp(self):
        # Setup Company & User
        self.company = Company.objects.create(name="TestCo", license_code="TESTCP")
        self.user = User.objects.create_user(
            username="test_user", password="testpass123", company=self.company, role="Admin"
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Ensure a warehouse exists
        self.location, _ = Location.objects.get_or_create(
            company=self.company, name="Main Warehouse", type="WAREHOUSE"
        )

    def test_create_product_with_initial_balance(self):
        payload = {
            "sku": "NEW-PROD-001",
            "name": "New Product with Stock",
            "profile": "SIMPLE_COUNT",
            "initial_balance": 100,
            "initial_location_id": str(self.location.id),
        }

        url = "/api/v1/product-models/"
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify Product Created
        prod_id = response.data["id"]
        prod = ProductModel.objects.get(id=prod_id)
        self.assertEqual(prod.sku, "NEW-PROD-001")

        # Verify Stock - Assuming LedgerService works, stock should be there.
        # Check stock level via StockService abstraction or just raw movement check
        from inventory.services import StockService

        stock = StockService.get_stock_for_model(prod)
        self.assertEqual(stock["total"], 100)
