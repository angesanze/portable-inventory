"""Tests for BATCH_TRACKED profile validation."""

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Company, User
from inventory.models import ProductModel


class BatchProfileModelTest(TestCase):
    """Model-level validation for BATCH_TRACKED profile."""

    def setUp(self):
        self.company = Company.objects.create(name="BatchModelCo", license_code="BMOD01")

    def test_batch_tracked_profile_valid(self):
        """BATCH_TRACKED profile creates valid product."""
        pm = ProductModel(
            company=self.company,
            sku="BATCH-OK",
            name="Valid Batch Product",
            profile="BATCH_TRACKED",
        )
        pm.full_clean()
        pm.save()
        self.assertEqual(pm.tracking_mode, "BATCH")
        self.assertEqual(pm.engine_type, "bucket")

    def test_simple_count_still_works(self):
        """SIMPLE_COUNT profile without strategy still valid."""
        pm = ProductModel(
            company=self.company,
            sku="BULK-OK",
            name="Normal Bulk",
            profile="SIMPLE_COUNT",
        )
        pm.full_clean()
        pm.save()
        self.assertEqual(pm.tracking_mode, "BULK")


class BatchProfileAPITest(TestCase):
    """API-level tests for creating BATCH_TRACKED products."""

    def setUp(self):
        self.company = Company.objects.create(name="BatchAPICo", license_code="BAPI01")
        self.user = User.objects.create_user(
            username="batchapi", password="password", company=self.company
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_batch_product_via_api(self):
        """POST with profile=BATCH_TRACKED succeeds."""
        payload = {
            "sku": "API-BATCH-001",
            "name": "API Batch Product",
            "profile": "BATCH_TRACKED",
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        obj = ProductModel.objects.get(sku="API-BATCH-001")
        self.assertEqual(obj.tracking_mode, "BATCH")


class BatchProfileValidationTest(TestCase):
    """Test that BATCH_TRACKED profile derives correct tracking_mode."""

    def test_batch_tracked_derives_batch(self):
        """BATCH_TRACKED profile maps to BATCH tracking mode."""
        from inventory.profiles import profile_to_legacy

        tm, et, _ = profile_to_legacy("BATCH_TRACKED")
        self.assertEqual(tm, "BATCH")
        self.assertEqual(et, "bucket")
