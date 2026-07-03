"""Tests for TrackerStatusBehavior audit-row emission and the
PhysicalProduct ``history`` endpoint.

Confirms that:

* every successful status change writes a self-loop ``quantity=0`` Movement
  carrying the ``Status: X → Y`` delta in ``reason``;
* the ``/api/v1/physical-products/<id>/history/`` endpoint returns those
  rows in reverse chronological order.
"""

import uuid
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from inventory.engines import TrackerEngine
from inventory.models import Location, Movement, PhysicalProduct, ProductModel
from inventory.strategies import TrackerStatusBehavior
from inventory.tests.helpers import make_company


@pytest.fixture
def env(db):
    company, user, _ = make_company("HIST")
    warehouse = Location.objects.create(
        company=company,
        name="Main Warehouse",
        type="WAREHOUSE",
    )
    transitions = {
        "ACTIVE": ["BROKEN"],
        "BROKEN": ["REPAIRED"],
        "REPAIRED": ["ACTIVE"],
    }
    product = ProductModel.objects.create(
        company=company,
        sku="HIST-001",
        name="Tracked Laptop",
        profile="SERIALIZED",
        engine_config={"status_transitions": transitions},
    )
    pp = PhysicalProduct.objects.create(
        product_model=product,
        identifier="SN-HIST-0001",
        status="ACTIVE",
        location=warehouse,
    )
    engine = TrackerEngine(product, product.engine_config)
    return {
        "company": company,
        "user": user,
        "warehouse": warehouse,
        "product": product,
        "physical_product": pp,
        "engine": engine,
    }


@pytest.mark.django_db
class TestTrackerStatusHistoryAuditRow:
    def test_status_change_writes_audit_movement(self, env):
        pp = env["physical_product"]
        TrackerStatusBehavior.execute_status_change(
            env["engine"],
            {
                "physical_product_id": str(pp.id),
                "new_status": "BROKEN",
                "notes": "screen cracked",
                "user": env["user"],
            },
        )
        audit = Movement.objects.get(physical_product=pp)
        assert audit.quantity == Decimal("0")
        assert audit.from_location_id == env["warehouse"].id
        assert audit.to_location_id == env["warehouse"].id
        assert audit.reason.startswith("Status: ACTIVE → BROKEN")
        assert "screen cracked" in audit.reason
        assert audit.performed_by_id == env["user"].id

    def test_status_change_without_location_skips_audit(self, env):
        """Movement requires from/to locations; strategy must skip audit when
        item has no location rather than crash."""
        pp = env["physical_product"]
        PhysicalProduct.objects.filter(id=pp.id).update(location=None)
        pp.refresh_from_db()
        TrackerStatusBehavior.execute_status_change(
            env["engine"],
            {
                "physical_product_id": str(pp.id),
                "new_status": "BROKEN",
            },
        )
        pp.refresh_from_db()
        assert pp.status == "BROKEN"
        assert Movement.objects.filter(physical_product=pp).count() == 0


@pytest.mark.django_db
class TestPhysicalProductHistoryEndpoint:
    def _trigger_three_changes(self, env):
        engine = env["engine"]
        pp = env["physical_product"]
        TrackerStatusBehavior.execute_status_change(
            engine,
            {
                "physical_product_id": str(pp.id),
                "new_status": "BROKEN",
                "user": env["user"],
            },
        )
        TrackerStatusBehavior.execute_status_change(
            engine,
            {
                "physical_product_id": str(pp.id),
                "new_status": "REPAIRED",
                "user": env["user"],
            },
        )
        TrackerStatusBehavior.execute_status_change(
            engine,
            {
                "physical_product_id": str(pp.id),
                "new_status": "ACTIVE",
                "user": env["user"],
            },
        )

    def test_history_returns_rows_reverse_chronological(self, env):
        self._trigger_three_changes(env)
        client = APIClient()
        client.force_authenticate(user=env["user"])
        resp = client.get(f"/api/v1/physical-products/{env['physical_product'].id}/history/")
        assert resp.status_code == 200, resp.content
        rows = resp.data["results"]
        assert len(rows) == 3
        # Reverse chronological — newest first.
        timestamps = [r["occurred_at"] for r in rows]
        assert timestamps == sorted(timestamps, reverse=True)

        reasons = [r["reason"] for r in rows]
        assert any(r.startswith("Status: REPAIRED → ACTIVE") for r in reasons)
        assert any(r.startswith("Status: BROKEN → REPAIRED") for r in reasons)
        assert any(r.startswith("Status: ACTIVE → BROKEN") for r in reasons)

        for r in rows:
            assert r["quantity"] == 0.0
            assert r["from_location"] == "Main Warehouse"
            assert r["to_location"] == "Main Warehouse"

    def test_history_scoped_to_company(self, env):
        """A user from a different company cannot read this item's history."""
        self._trigger_three_changes(env)
        _, other_user, _ = make_company("OTHER")
        client = APIClient()
        client.force_authenticate(user=other_user)
        resp = client.get(f"/api/v1/physical-products/{env['physical_product'].id}/history/")
        assert resp.status_code == 404

    def test_history_returns_404_for_unknown_id(self, env):
        client = APIClient()
        client.force_authenticate(user=env["user"])
        resp = client.get(f"/api/v1/physical-products/{uuid.uuid4()}/history/")
        assert resp.status_code == 404
