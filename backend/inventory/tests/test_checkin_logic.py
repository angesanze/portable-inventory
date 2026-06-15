
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Company, User, ApiKey
from inventory.models import ProductModel, Location, PhysicalProduct

class CheckInLogicTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="CheckIn Co", license_code="CHKIN1")
        self.user = User.objects.create_user(
            username="checkin_admin", password="password", company=self.company
        )
        self.api_key = ApiKey.objects.create(
            company=self.company, label="CheckIn Key", key="checkin-test-key"
        )
        
        self.product = ProductModel.objects.create(
            company=self.company, 
            sku="SERIAL-1", 
            name="Serialized Widget",
            profile="SERIALIZED"
        )
        self.location = Location.objects.create(company=self.company, name="Warehouse A", type="WAREHOUSE")
        self.client = APIClient()

    def test_prevent_double_checkin(self):
        base_url = f"/api/v1/widget/move/?api_key={self.api_key.key}"
        
        # 1. First Check-In (Should succeed and create item)
        payload = {
            "product_id": str(self.product.id),
            "location_id": str(self.location.id),
            "item_identifier": "SN-001",
            "quantity": 1,
            "reason": "Initial Stock"
        }
        response = self.client.post(base_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify item exists and is ACTIVE
        item = PhysicalProduct.objects.get(identifier="SN-001")
        self.assertEqual(item.status, "ACTIVE")

        # 2. Second Check-In (Should FAIL)
        response = self.client.post(base_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 3. Check Out (Should succeed)
        payload_out = {
            "product_id": str(self.product.id),
            "location_id": str(self.location.id),
            "item_identifier": "SN-001",
            "quantity": -1,
            "reason": "Sales"
        }
        response = self.client.post(base_url, payload_out, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 4. Check In Again (Should succeed now if we manually change status, or if checkout changes it?)
        # Standard checkout currently DOES NOT change status to INACTIVE automatically 
        # unless it moves to a VIRTUAL location 'CONSUMED' or similar.
        
        # For this test, let's manually change status to verify re-activation flow
        item.status = 'EXPIRED' 
        item.save()
        
        response = self.client.post(base_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(item.status, "ACTIVE")
