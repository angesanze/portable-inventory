"""Tests for the PhysicalProduct detail endpoint payload completeness.

Phase 07 of the inventory profiles deep audit: the show page must be able
to build itself from a single GET. This file pins down the contract:

* nested ``product_model`` / ``location`` / ``work_order`` / ``batch``;
* ``status_label``, ``attributes``, ``created_at``/``updated_at``;
* ``last_status_change`` — most recent ``quantity=0`` audit Movement, or null.
"""
import pytest
from rest_framework.test import APIClient

from inventory.engines import TrackerEngine
from inventory.models import Location, Movement, PhysicalProduct, ProductModel
from inventory.strategies import TrackerStatusBehavior
from inventory.tests.helpers import make_company


@pytest.fixture
def env(db):
    company, user, _ = make_company("DET")
    warehouse = Location.objects.create(
        company=company, name="Main Warehouse", type="WAREHOUSE",
    )
    transitions = {
        "ACTIVE": ["BROKEN"],
        "BROKEN": ["ACTIVE"],
    }
    product = ProductModel.objects.create(
        company=company,
        sku="DET-001",
        name="Tracked Asset",
        profile="SERIALIZED",
        engine_config={"status_transitions": transitions},
        attributes={"team": "ops"},
    )
    pp = PhysicalProduct.objects.create(
        product_model=product,
        identifier="SN-DET-0001",
        status="ACTIVE",
        location=warehouse,
    )
    return {
        "company": company,
        "user": user,
        "warehouse": warehouse,
        "product": product,
        "pp": pp,
    }


@pytest.mark.django_db
class TestPhysicalProductDetailPayload:
    def test_detail_returns_last_status_change_for_latest_audit(self, env):
        engine = TrackerEngine(env["product"], env["product"].engine_config)
        TrackerStatusBehavior.execute_status_change(engine, {
            "physical_product_id": str(env["pp"].id),
            "new_status": "BROKEN",
            "notes": "screen cracked",
            "user": env["user"],
        })
        TrackerStatusBehavior.execute_status_change(engine, {
            "physical_product_id": str(env["pp"].id),
            "new_status": "ACTIVE",
            "notes": "back from repair",
            "user": env["user"],
        })
        latest = (
            Movement.objects
            .filter(physical_product=env["pp"], quantity=0)
            .order_by("-occurred_at")
            .first()
        )
        assert latest is not None

        client = APIClient()
        client.force_authenticate(user=env["user"])
        resp = client.get(f"/api/v1/physical-products/{env['pp'].id}/")
        assert resp.status_code == 200, resp.content

        body = resp.data
        assert body["last_status_change"] is not None
        assert body["last_status_change"]["occurred_at"] == latest.occurred_at.isoformat()
        assert "BROKEN" in body["last_status_change"]["reason"]
        assert "ACTIVE" in body["last_status_change"]["reason"]

        # Nested payload shape required by the show page.
        assert body["product_model"]["id"] == str(env["product"].id)
        assert body["product_model"]["sku"] == "DET-001"
        assert body["product_model"]["name"] == "Tracked Asset"
        assert body["product_model"]["profile"] == "SERIALIZED"

        assert body["location"]["id"] == str(env["warehouse"].id)
        assert body["location"]["name"] == "Main Warehouse"
        assert body["location"]["type"] == "WAREHOUSE"

        assert body["work_order"] is None
        assert body["batch"] is None

        assert body["identifier"] == "SN-DET-0001"
        assert body["status"] == "ACTIVE"
        assert body["status_label"] == "Active"
        assert body["attributes"] == {"team": "ops"}
        assert body["created_at"] is not None
        assert body["updated_at"] is not None

    def test_detail_returns_null_when_no_status_changes(self, env):
        client = APIClient()
        client.force_authenticate(user=env["user"])
        resp = client.get(f"/api/v1/physical-products/{env['pp'].id}/")
        assert resp.status_code == 200, resp.content
        assert resp.data["last_status_change"] is None
