
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from core.models import User, Company, ApiKey
from inventory.models import ProductModel, Location, Movement, PhysicalProduct, ProductBatch, WorkOrder
from decimal import Decimal
import uuid

from django.utils import timezone

class WidgetApiTest(APITestCase):
    def setUp(self):
        # Setup Company
        self.company = Company.objects.create(name="Widget Corp", license_code="WIDGETCO")
        self.user = User.objects.create_user(username="widget_admin", password="password", company=self.company)
        
        # Setup API Key
        self.api_key = ApiKey.objects.create(company=self.company, label="Public Widget Key", key="test-key-123")
        
        # Setup Products
        self.product1 = ProductModel.objects.create(
            company=self.company, 
            sku="SKU-001", 
            name="Widget A", 
            attributes={"color": "red"}
        )
        self.product2 = ProductModel.objects.create(
            company=self.company, 
            sku="SKU-002", 
            name="Widget B"
        )
        
        # Setup Locations
        self.warehouse = Location.objects.create(company=self.company, name="Warehouse", type="WAREHOUSE")
        
        # Add initial stock
        Movement.objects.create(
            product_model=self.product1,
            from_location=Location.objects.create(company=self.company, name="Supplier", type="VIRTUAL"), # Virtual supplier
            to_location=self.warehouse,
            quantity=Decimal("100"),
            performed_by=self.user,
            reason="Initial Stock",
            occurred_at=timezone.now()
        )
        
        self.url = reverse('widget-list') # Assuming router registers 'widget' -> 'widget-list'

    def test_widget_access_with_valid_key(self):
        """
        Ensure we can access the widget data with a valid API key in query params.
        """
        response = self.client.get(self.url, {'api_key': self.api_key.key})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertEqual(data['company'], "Widget Corp")
        self.assertEqual(len(data['products']), 2)
        
        # Check Product 1 data
        p1_data = next(p for p in data['products'] if p['sku'] == "SKU-001")
        self.assertEqual(p1_data['name'], "Widget A")
        self.assertEqual(p1_data['quantity'], 100.0)
        
        # Check Product 2 data (should be 0 stock)
        p2_data = next(p for p in data['products'] if p['sku'] == "SKU-002")
        self.assertEqual(p2_data['quantity'], 0.0)

    def test_widget_access_without_key(self):
        """Ensure 403/401 if key is missing."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_widget_access_with_invalid_key(self):
        """Ensure 403/401 if key is invalid."""
        response = self.client.get(self.url, {'api_key': "invalid_key_123"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cross_company_isolation(self):
        """Ensure we don't see another company's products."""
        other_company = Company.objects.create(name="Other Corp", license_code="OTHERCORP")
        other_product = ProductModel.objects.create(company=other_company, sku="OTHER-1", name="Other Widget")
        
        response = self.client.get(self.url, {'api_key': self.api_key.key})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        product_skus = [p['sku'] for p in data['products']]
        self.assertNotIn("OTHER-1", product_skus)
        self.assertIn("SKU-001", product_skus)

    def test_list_locations(self):
        """Test listing locations with valid API key."""
        url = reverse('widget-locations') # Assuming registered as 'widget' -> leads to 'widget-locations' for @action
        # NOTE: DefaultRouter names actions as basename-actionname
        
        response = self.client.get(url, {'api_key': self.api_key.key})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(len(data) >= 1)
        self.assertEqual(data[0]['name'], "Warehouse")

    def test_stock_movement(self):
        """Test adding and removing stock via API."""
        url = reverse('widget-move')
        
        # 1. Add Stock (+10)
        payload = {
            "product_id": str(self.product1.id),
            "location_id": str(self.warehouse.id),
            "quantity": 10,
            "reason": "API Test Add"
        }
        response = self.client.post(f"{url}?api_key={self.api_key.key}", payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Initial was 100, +10 = 110
        self.assertEqual(response.json()['quantity'], 10.0) # The View returns the quantity delta
        
        # 2. Remove Stock (-20)
        payload['quantity'] = -20
        response = self.client.post(f"{url}?api_key={self.api_key.key}", payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['quantity'], -20.0)

    def test_widget_fulfill_passes_through_product_less_summary(self):
        """
        The fulfill summary dict has no 'product' key. Verify the transaction()
        handler skips the product-formatting branch and returns the dict as-is
        with HTTP 200 (WO-FULFILL-02).
        """
        work_order = WorkOrder.objects.create(
            company=self.company, name="Fulfill WO", product_model=self.product1,
        )
        ProductBatch.objects.create(
            product_model=self.product1,
            quantity=Decimal("3"),
            work_order=work_order,
            location=self.warehouse,
            batch_identifier="WO-BATCH-1",
        )

        url = reverse('widget-transaction', kwargs={'pk': work_order.id})
        response = self.client.post(
            f"{url}?api_key={self.api_key.key}", {"operation": "fulfill"}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "CLOSED")
        self.assertEqual(data["batches_fulfilled"], 1)
        # Summary returned verbatim — no 'product' key, no crash.
        self.assertNotIn("product", data)

    def test_move_validation(self):
        """Test validation failures."""
        url = reverse('widget-move')
        
        # Missing payload
        response = self.client.post(f"{url}?api_key={self.api_key.key}", {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Invalid Qty (Missing quantity or calc_payload)
        payload = {
            "product_id": str(self.product1.id),
            "location_id": str(self.warehouse.id)
        }
        response = self.client.post(f"{url}?api_key={self.api_key.key}", payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

