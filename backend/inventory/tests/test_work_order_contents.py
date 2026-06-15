
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Company, User
from inventory.models import ProductModel, Location, PhysicalProduct, WorkOrder, ProductBatch

class WorkOrderContentsTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="WOContentsCo", license_code="WOCNT1")
        self.user = User.objects.create_user(username="woadmin", password="password", company=self.company)

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Common Setup
        self.bucket_product = ProductModel.objects.create(
            company=self.company,
            sku="BUCKET-1",
            name="Bucket Product",
            profile="BATCH_TRACKED",
        )
        self.tracker_product = ProductModel.objects.create(
            company=self.company,
            sku="TRACKER-1",
            name="Tracker Product",
            profile="SERIALIZED"
        )
        self.location = Location.objects.create(company=self.company, name="Warehouse A", type="WAREHOUSE")

        # Create a Kit/WorkOrder
        self.work_order = WorkOrder.objects.create(
            company=self.company,
            product_model=self.tracker_product, # Assuming kit itself is a product or just a holder
            name="Test Kit 1",
            description="A test kit"
        )

    def test_contents_with_batches(self):
        # Create a batch assigned to the WorkOrder
        ProductBatch.objects.create(
            product_model=self.bucket_product,
            quantity=10.5,
            work_order=self.work_order,
            location=self.location,
            batch_identifier="BATCH-001"
        )

        url = f"/api/v1/work-orders/{self.work_order.id}/contents/"
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['type'], 'BATCH')
        self.assertEqual(data[0]['sku'], 'BUCKET-1')
        self.assertEqual(data[0]['quantity'], 10.5)
        self.assertEqual(data[0]['batch_identifier'], 'BATCH-001')

    def test_contents_with_serialized_items(self):
        # Create a serialized item assigned to the WorkOrder
        PhysicalProduct.objects.create(
            product_model=self.tracker_product,
            identifier="SN-100",
            status="ACTIVE",
            work_order=self.work_order,
            location=self.location
        )

        url = f"/api/v1/work-orders/{self.work_order.id}/contents/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['type'], 'SERIAL')
        self.assertEqual(data[0]['sku'], 'TRACKER-1')
        self.assertEqual(data[0]['quantity'], 1)
        self.assertEqual(data[0]['identifier'], 'SN-100')

    def test_mixed_contents(self):
        # Add a batch
        ProductBatch.objects.create(
            product_model=self.bucket_product,
            quantity=5,
            work_order=self.work_order,
            location=self.location,
            batch_identifier="BATCH-MIX"
        )
        # Add a serialized item
        PhysicalProduct.objects.create(
            product_model=self.tracker_product,
            identifier="SN-MIX",
            status="ACTIVE",
            work_order=self.work_order,
            location=self.location
        )

        url = f"/api/v1/work-orders/{self.work_order.id}/contents/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(data := response.data), 2)
        
        types = sorted([item['type'] for item in data])
        self.assertEqual(types, ['BATCH', 'SERIAL'])

    def test_empty_work_order(self):
        empty_wo = WorkOrder.objects.create(
            company=self.company,
            product_model=self.tracker_product,
            name="Empty Kit"
        )
        url = f"/api/v1/work-orders/{empty_wo.id}/contents/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)
