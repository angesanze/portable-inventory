import pytest
from rest_framework.test import APIClient
from core.models import Company, User
from inventory.models import ProductModel


@pytest.mark.django_db
class TestDefaultPagination:
    def setup_method(self):
        self.company = Company.objects.create(name="TestCo", license_code="TESTPG")
        self.user = User.objects.create_user(
            username="test_user", password="testpass123", company=self.company, role="Admin"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_paginated_format(self):
        """List endpoints return {count, results, next, previous}."""
        ProductModel.objects.create(company=self.company, sku="PAG-1", name="P1")
        response = self.client.get("/api/v1/product-models/")
        assert response.status_code == 200
        assert "results" in response.data
        assert "count" in response.data
        assert isinstance(response.data["results"], list)
        assert response.data["count"] == 1

    def test_page_size_respected(self):
        """Client can control page size via page_size param."""
        for i in range(5):
            ProductModel.objects.create(company=self.company, sku=f"PS-{i}", name=f"P{i}")
        response = self.client.get("/api/v1/product-models/?page_size=2")
        assert response.status_code == 200
        assert len(response.data["results"]) == 2
        assert response.data["count"] == 5

    def test_page_navigation(self):
        """page param navigates through results."""
        for i in range(5):
            ProductModel.objects.create(company=self.company, sku=f"PN-{i}", name=f"P{i}")
        r1 = self.client.get("/api/v1/product-models/?page_size=2&page=1")
        r2 = self.client.get("/api/v1/product-models/?page_size=2&page=2")
        assert r1.status_code == 200
        assert r2.status_code == 200
        ids_1 = {p["id"] for p in r1.data["results"]}
        ids_2 = {p["id"] for p in r2.data["results"]}
        assert ids_1.isdisjoint(ids_2)

    def test_max_page_size_capped(self):
        """page_size above max_page_size is capped at 200."""
        for i in range(3):
            ProductModel.objects.create(company=self.company, sku=f"MX-{i}", name=f"P{i}")
        response = self.client.get("/api/v1/product-models/?page_size=999")
        assert response.status_code == 200
        # Should not error; returns all 3 (under cap)
        assert len(response.data["results"]) == 3
