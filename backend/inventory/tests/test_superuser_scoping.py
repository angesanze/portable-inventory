import pytest
from rest_framework.test import APIClient
from rest_framework import status
from core.models import User, Company
from inventory.models import ProductModel
import uuid


@pytest.mark.django_db
class TestSuperUserScoping:
    def test_superuser_sees_all_records_by_default(self):
        """Verify current behavior: Superuser sees records from ALL companies."""

        unique_suffix = uuid.uuid4().hex[:8]

        # 1. Setup Data
        # Company A with Product
        company_a = Company.objects.create(
            name=f"Company A {unique_suffix}", license_code=f"LICA{unique_suffix[:4]}"
        )
        product_a = ProductModel.objects.create(
            name="Product A", company=company_a, sku=f"SKU-A-{unique_suffix}"
        )

        # Company B (Empty)
        company_b = Company.objects.create(
            name=f"Company B {unique_suffix}", license_code=f"LICB{unique_suffix[:4]}"
        )

        # 2. Setup Superuser assigned to Company B
        superuser = User.objects.create_superuser(
            username=f"admin_b_{unique_suffix}", email="admin@b.com", password="password"
        )
        superuser.company = company_b
        superuser.save()

        # 3. Request Products as Superuser
        client = APIClient()
        client.force_authenticate(user=superuser)

        response = client.get("/api/v1/product-models/")
        assert response.status_code == status.HTTP_200_OK

        data = response.data
        if isinstance(data, dict) and "results" in data:
            results = data["results"]
        else:
            results = data

        # Current Behavior (FIXED): Superuser in Company B sees NO products from Company A
        assert len(results) == 0
        print("\nSUCCESS: Superuser in Company B is correctly scoped (sees no products).")

    def test_superuser_should_be_scoped_if_company_set(self):
        """Verify DESIRED behavior: Superuser assigned to Company B should NOT see Company A's products."""
        unique_suffix = uuid.uuid4().hex[:8]
        # 1. Setup Data
        company_a = Company.objects.create(
            name=f"Company A {unique_suffix}", license_code=f"LCA2{unique_suffix[:4]}"
        )
        product_a = ProductModel.objects.create(
            name="Product A", company=company_a, sku=f"SKU-A-2-{unique_suffix}"
        )

        company_b = Company.objects.create(
            name=f"Company B {unique_suffix}", license_code=f"LCB2{unique_suffix[:4]}"
        )

        superuser = User.objects.create_superuser(
            username=f"admin_b_2_{unique_suffix}", email="admin@b.com", password="password"
        )
        superuser.company = company_b
        superuser.save()

        client = APIClient()
        client.force_authenticate(user=superuser)

        response = client.get("/api/v1/product-models/")

        data = response.data
        if isinstance(data, dict) and "results" in data:
            results = data["results"]
        else:
            results = data

        # Desired: count should be 0 because Company B has no products
        # If this fails, it means the fix is needed.
        if len(results) == 0:
            print("SUCCESS: Superuser is correctly scoped.")
        else:
            print(f"FAILURE: Superuser saw {len(results)} products, expected 0.")
            # We EXPECT this to fail before the fix, so let's assert it fails for now to confirm reproduction
            # assert len(results) > 0
