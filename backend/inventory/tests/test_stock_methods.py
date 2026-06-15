
from django.test import TestCase
from django.contrib.auth import get_user_model
from core.models import Company, ApiKey
from inventory.models import ProductModel, DynamicQRCode, Location, PhysicalProduct, ProductBatch
from rest_framework.test import APIClient
from rest_framework import status
import json

User = get_user_model()

import uuid

class StockMethodsTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Corp", license_code="TSTCORP")
        self.user = User.objects.create_user(username="testuser", password="password", company=self.company)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create a Location
        self.warehouse = Location.objects.create(company=self.company, name="Warehouse A", type="WAREHOUSE")

        # Create API Key for QR Gen
        self.api_key = ApiKey.objects.create(company=self.company, label="Scanner 1", key="abc-123")


    def test_create_bulk_product(self):
        """Test creating a simple BULK product (e.g. Nails)"""
        payload = {
            "sku": "BULK-001",
            "name": "Box of Nails",
            "profile": "SIMPLE_COUNT",
        }
        response = self.client.post('/api/v1/product-models/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        product = ProductModel.objects.get(sku="BULK-001")
        self.assertEqual(product.tracking_mode, "BULK")
        self.assertEqual(product.engine_type, "counter")

    def test_create_serialized_product(self):
        """Test creating a SERIALIZED product (e.g. Drill)"""
        payload = {
            "sku": "SERIAL-001",
            "name": "Power Drill",
            "profile": "SERIALIZED",
        }
        response = self.client.post('/api/v1/product-models/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        product = ProductModel.objects.get(sku="SERIAL-001")
        self.assertEqual(product.tracking_mode, "INDIVIDUAL")
        self.assertEqual(product.engine_type, "tracker")

    def test_create_batch_product(self):
        """Test creating a BATCH product with Strategy (e.g. Paint)"""
        payload = {
            "sku": "BATCH-001",
            "name": "White Paint",
            "profile": "BATCH_TRACKED",
        }
        response = self.client.post('/api/v1/product-models/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        product = ProductModel.objects.get(sku="BATCH-001")
        self.assertEqual(product.profile, "BATCH_TRACKED")
        # Check if we can add stock to it with batch data (Mixed Calc test)
        
        # 1. Add Stock with Batch Data
        move_url = f'/api/v1/widget/move/?api_key={self.api_key.key}'
        move_payload = {
            "product_id": str(product.id),
            "location_id": str(self.warehouse.id),
            "batch_data": { 
                 "batch_identifier": "LOT-ABC-123",
                 "data": {"lot_number": "LOT-ABC-123"}
            },
            "calc_payload": {
                "operation": "add",
                "quantity": 10
            }
        }
        
        res_move = self.client.post(move_url, move_payload, format='json')
        self.assertEqual(res_move.status_code, status.HTTP_200_OK, res_move.data)
        
        # Verify via Batch Objects (Ledger System)
        batches = ProductBatch.objects.filter(product_model=product)
        self.assertEqual(batches.count(), 1)
        self.assertEqual(batches.first().batch_identifier, "LOT-ABC-123")
        self.assertEqual(batches.first().quantity, 10)

    def test_virgin_qr_location_context(self):
        """Test creating Virgin QR codes with Location Context"""
        url = '/api/v1/qr-codes/generate_batch/'
        payload = {
            "count": 5,
            "api_key": self.api_key.id,
            "label_prefix": "LOC-TEST-",
            "location_id": self.warehouse.id
        }
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data), 5)
        
        # Verify DB
        qr = DynamicQRCode.objects.get(label="LOC-TEST-1")
        self.assertEqual(qr.location, self.warehouse)
        self.assertEqual(qr.status, "VIRGIN")
        
        # Test Locking Logic (Conceptual)
        # If we configure it, it should stay linked to location?
        # The location is context for *where* the scan happened or defaults, 
        # it doesn't necessarily restrict the product, but usually it implies "Items at this location".
