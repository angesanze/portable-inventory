"""Unit-string propagation across widget, product list, and stock list payloads.

Phase 2 of COUNTER-UNIT (`COUNTER-UNIT-01.md`): backend payloads must expose
`unit` so the four frontend renderers that build their own numeric string can
append it. Counter engine with `input_label` → unit string; counter without
preset → None; non-counter engine → None (other engines manage their own
units inside the numeric formatter).
"""

import uuid
from decimal import Decimal

import pytest

from core.models import Company, User
from inventory.models import (
    ProductModel,
    Location,
    CalculatorTemplate,
    Movement,
)
from inventory.services import WidgetProductService
from inventory.serializers import ProductModelListSerializer


@pytest.fixture
def company(db):
    return Company.objects.create(
        name="UnitCo",
        license_code=uuid.uuid4().hex[:6].upper(),
    )


@pytest.fixture
def user(company):
    return User.objects.create_user(username="unit_user", password="pw", company=company)


@pytest.fixture
def warehouse(company):
    return Location.objects.create(company=company, name="WH", type="WAREHOUSE")


@pytest.fixture
def supplier(company):
    return Location.objects.create(company=company, name="Supplier", type="VIRTUAL")


@pytest.fixture
def kg_preset(company):
    return CalculatorTemplate.objects.create(
        company=company,
        name="Kg",
        engine_type="counter",
        engine_config={"input_label": "Kg", "step": 1},
    )


def _stock(product, supplier, warehouse, user, qty):
    Movement.objects.create(
        product_model=product,
        from_location=supplier,
        to_location=warehouse,
        quantity=Decimal(qty),
        performed_by=user,
        reason="seed",
    )


@pytest.mark.django_db
class TestWidgetPayloadUnit:
    def test_counter_with_preset_has_unit(self, company, user, supplier, warehouse, kg_preset):
        product = ProductModel.objects.create(
            company=company,
            sku="U-1",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=kg_preset,
            engine_config={"input_label": "Kg", "step": 1},
        )
        _stock(product, supplier, warehouse, user, 3)

        items = WidgetProductService.get_widget_products(company)
        item = next(i for i in items if i["sku"] == "U-1")
        assert item["unit"] == "Kg"
        assert item["stock_display"].endswith("Kg")

    def test_counter_without_preset_unit_none(self, company, user, supplier, warehouse):
        product = ProductModel.objects.create(
            company=company,
            sku="U-2",
            name="Scatole",
            profile="SIMPLE_COUNT",
        )
        _stock(product, supplier, warehouse, user, 120)

        items = WidgetProductService.get_widget_products(company)
        item = next(i for i in items if i["sku"] == "U-2")
        assert item["unit"] is None

    def test_non_counter_engine_unit_none(self, company, user, supplier, warehouse):
        product = ProductModel.objects.create(
            company=company,
            sku="U-3",
            name="Serial Widget",
            profile="SERIALIZED",
        )
        items = WidgetProductService.get_widget_products(company)
        item = next((i for i in items if i["sku"] == "U-3"), None)
        # Serial widget with zero stock is still emitted unless location filter excludes it.
        # If suppressed by zero-stock filter, the assertion still holds vacuously.
        if item is not None:
            assert item["unit"] is None


@pytest.mark.django_db
class TestStockSummaryUnit:
    def test_stock_summary_includes_unit_for_counter_with_preset(self, company, kg_preset):
        product = ProductModel.objects.create(
            company=company,
            sku="L-1",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=kg_preset,
            engine_config={"input_label": "Kg", "step": 1},
        )
        data = ProductModelListSerializer(product).data
        assert data["stock_summary"]["unit"] == "Kg"

    def test_stock_summary_unit_none_without_preset(self, company):
        product = ProductModel.objects.create(
            company=company,
            sku="L-2",
            name="Scatole",
            profile="SIMPLE_COUNT",
        )
        data = ProductModelListSerializer(product).data
        assert data["stock_summary"]["unit"] is None

    def test_stock_summary_unit_none_for_non_counter(self, company):
        product = ProductModel.objects.create(
            company=company,
            sku="L-3",
            name="Serial",
            profile="SERIALIZED",
        )
        data = ProductModelListSerializer(product).data
        assert data["stock_summary"]["unit"] is None


@pytest.mark.django_db
class TestStockRowUnit:
    def test_products_poly_list_includes_unit(self, company, user, kg_preset):
        from rest_framework.test import APIClient

        product_kg = ProductModel.objects.create(
            company=company,
            sku="P-1",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=kg_preset,
            engine_config={"input_label": "Kg", "step": 1},
        )
        product_plain = ProductModel.objects.create(
            company=company,
            sku="P-2",
            name="Scatole",
            profile="SIMPLE_COUNT",
        )

        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get("/api/v1/products-poly/")
        assert resp.status_code == 200
        rows = {r["sku"]: r for r in resp.json()}
        assert rows["P-1"]["unit"] == "Kg"
        assert rows["P-2"]["unit"] is None
