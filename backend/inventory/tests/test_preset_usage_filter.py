"""Tests for filtering ProductModel list by default_calculator preset.

Regression: filterset_fields previously only included 'profile', so DRF
silently ignored ?default_calculator=<id>. PresetUsageCount in the UI then
showed the full company-scoped count for every preset card.
"""

import pytest
from rest_framework.test import APIClient

from core.models import Company, User
from inventory.models import ProductModel, CalculatorTemplate


@pytest.mark.django_db
class TestPresetUsageFilter:
    def setup_method(self):
        self.company = Company.objects.create(name="FilterCo", license_code="FLTPRS")
        self.user = User.objects.create_user(
            username="filter_user",
            password="testpass123",
            company=self.company,
            role="Admin",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.preset_a = CalculatorTemplate.objects.create(
            company=self.company,
            name="Preset A (Kg)",
            engine_type="counter",
            engine_config={"input_label": "Kg", "step": 1},
        )
        self.preset_b = CalculatorTemplate.objects.create(
            company=self.company,
            name="Preset B (pcs)",
            engine_type="counter",
            engine_config={"input_label": "pcs", "step": 1},
        )

        # One product uses preset A, one uses no preset.
        self.with_a = ProductModel.objects.create(
            company=self.company,
            sku="USE-A",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=self.preset_a,
        )
        self.no_preset = ProductModel.objects.create(
            company=self.company,
            sku="NO-PRESET",
            name="Scatole",
            profile="SIMPLE_COUNT",
        )

    def test_filter_returns_only_products_with_that_preset(self):
        response = self.client.get(f"/api/v1/product-models/?default_calculator={self.preset_a.id}")
        assert response.status_code == 200
        results = response.data["results"]
        assert response.data["count"] == 1
        assert len(results) == 1
        assert results[0]["sku"] == "USE-A"

    def test_filter_with_unused_preset_returns_empty(self):
        response = self.client.get(f"/api/v1/product-models/?default_calculator={self.preset_b.id}")
        assert response.status_code == 200
        assert response.data["count"] == 0
        assert response.data["results"] == []

    def test_no_filter_returns_all_company_products(self):
        # Sanity: without the filter we still see both rows (no regression).
        response = self.client.get("/api/v1/product-models/")
        assert response.status_code == 200
        assert response.data["count"] == 2
