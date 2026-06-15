"""Tests for the ProductModel detail endpoint payload completeness.

Phase 07: the show / edit pages must see ``engine_config`` (dimensions /
formula / unit / expiry_tracking / status_transitions) round-trip through
the API intact, and ``default_calculator_detail`` must surface name +
engine_type when a preset is bound.
"""
import pytest
from rest_framework.test import APIClient

from inventory.models import ProductModel
from inventory.models.strategy import CalculatorTemplate
from inventory.tests.helpers import make_company


@pytest.fixture
def env(db):
    company, user, _ = make_company("PMD")
    product = ProductModel.objects.create(
        company=company,
        sku="DIM-001",
        name="Dimensional Cloth",
        profile="DIMENSIONAL",
        engine_config={
            "dimensions": ["l", "w"],
            "formula": "l*w",
            "unit": "m",
        },
    )
    return {"company": company, "user": user, "product": product}


@pytest.mark.django_db
class TestProductModelDetailPayload:
    def test_dimensional_engine_config_round_trips_through_api(self, env):
        client = APIClient()
        client.force_authenticate(user=env["user"])
        resp = client.get(f"/api/v1/product-models/{env['product'].id}/")
        assert resp.status_code == 200, resp.content

        config = resp.data["engine_config"]
        assert config == {
            "dimensions": ["l", "w"],
            "formula": "l*w",
            "unit": "m",
        }
        # Profile + tracking surface fields the show page banner reads.
        assert resp.data["profile"] == "DIMENSIONAL"
        assert resp.data["engine_type"] == "dimension"

    def test_default_calculator_detail_is_null_when_unset(self, env):
        client = APIClient()
        client.force_authenticate(user=env["user"])
        resp = client.get(f"/api/v1/product-models/{env['product'].id}/")
        assert resp.status_code == 200, resp.content
        assert resp.data["default_calculator_detail"] is None

    def test_default_calculator_detail_surfaces_name_and_engine_type(self, env):
        template = CalculatorTemplate.objects.create(
            company=env["company"],
            name="Cloth Preset",
            engine_type="dimension",
            engine_config={"dimensions": ["l", "w"], "formula": "l*w"},
        )
        env["product"].default_calculator = template
        env["product"].save()

        client = APIClient()
        client.force_authenticate(user=env["user"])
        resp = client.get(f"/api/v1/product-models/{env['product'].id}/")
        assert resp.status_code == 200, resp.content

        detail = resp.data["default_calculator_detail"]
        assert detail is not None
        assert detail["id"] == str(template.id)
        assert detail["name"] == "Cloth Preset"
        assert detail["engine_type"] == "dimension"
