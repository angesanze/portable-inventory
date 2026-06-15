"""End-to-end smoke matrix per inventory profile (PRESET-LOGIC-08).

For every profile, scripted test covers the full happy path:
    create → set initial stock → see in widget list → operate via widget → see updated stock.

The SERIALIZED-with-tracker test also asserts the Phase 01 contract: a status
change does NOT make the item disappear from inventory.
"""
import uuid
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from core.models import ApiKey, Company, User
from inventory.models import (
    Location,
    Movement,
    PhysicalProduct,
    ProductBatch,
    ProductModel,
)


# ── Fixture ──────────────────────────────────────────────────────────────

@pytest.fixture
def env(db):
    """Company + API key + warehouse + authenticated app client."""
    company = Company.objects.create(
        name="Preset Lifecycle Co",
        license_code=uuid.uuid4().hex[:6].upper(),
    )
    user = User.objects.create_user(
        username=f"plc_{uuid.uuid4().hex[:6]}",
        password="testpass123",
        company=company,
        role="Admin",
    )
    api_key = ApiKey.objects.create(
        company=company,
        label="Lifecycle Key",
        key=f"key-{uuid.uuid4().hex[:12]}",
    )
    warehouse = Location.objects.create(
        company=company, name="Main Warehouse", type="WAREHOUSE"
    )
    Location.objects.create(
        company=company, name="External", type="VIRTUAL"
    )

    app_client = APIClient()
    app_client.force_authenticate(user=user)
    return {
        "company": company,
        "user": user,
        "api_key": api_key,
        "warehouse": warehouse,
        "app_client": app_client,
        "widget_client": APIClient(),
    }


# ── Helpers ──────────────────────────────────────────────────────────────

def _create_product(env, payload):
    resp = env["app_client"].post(
        "/api/v1/product-models/", payload, format="json"
    )
    assert resp.status_code == 201, resp.content
    return resp.data["id"]


def _widget_list(env):
    resp = env["widget_client"].get(
        "/api/v1/widget/", {"api_key": env["api_key"].key}
    )
    assert resp.status_code == 200, resp.content
    return resp.data["products"]


def _widget_detail(env, product_id):
    resp = env["widget_client"].get(
        f"/api/v1/widget/{product_id}/", {"api_key": env["api_key"].key}
    )
    assert resp.status_code == 200, resp.content
    return resp.data


def _widget_transaction(env, product_id, payload):
    resp = env["widget_client"].post(
        f"/api/v1/widget/{product_id}/transaction/?api_key={env['api_key'].key}",
        payload,
        format="json",
    )
    return resp


def _find_in_list(products, sku):
    matches = [p for p in products if p.get("sku") == sku]
    assert matches, f"sku {sku!r} not found in widget list (skus={[p.get('sku') for p in products]})"
    return matches[0]


# ── Lifecycles ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_simple_count_lifecycle(env):
    """SIMPLE_COUNT: initial_balance → widget add → updated stock."""
    pid = _create_product(env, {
        "sku": "LC-SIMPLE-1",
        "name": "Bolts",
        "profile": "SIMPLE_COUNT",
        "initial_balance": 50,
        "initial_location_id": str(env["warehouse"].id),
    })

    listed = _find_in_list(_widget_list(env), "LC-SIMPLE-1")
    assert float(listed["quantity"]) == 50.0

    resp = _widget_transaction(env, pid, {
        "operation": "add",
        "quantity": 10,
        "location_id": str(env["warehouse"].id),
    })
    assert resp.status_code == 200, resp.content

    assert float(_widget_detail(env, pid)["quantity"]) == 60.0


@pytest.mark.django_db
def test_unit_conversion_lifecycle(env):
    """UNIT_CONVERSION: initial_balance → widget add → updated stock (passthrough qty)."""
    pid = _create_product(env, {
        "sku": "LC-CONV-1",
        "name": "Detergent",
        "profile": "UNIT_CONVERSION",
        "engine_config": {
            "ratio_source": "config",
            "conversion_ratio": "1",
            "precision": 2,
            "stock_unit": "liters",
            "input_label": "Liters",
        },
        "initial_balance": 20,
        "initial_location_id": str(env["warehouse"].id),
    })

    listed = _find_in_list(_widget_list(env), "LC-CONV-1")
    assert float(listed["quantity"]) == 20.0

    resp = _widget_transaction(env, pid, {
        "operation": "add",
        "quantity": 5,
        "location_id": str(env["warehouse"].id),
    })
    assert resp.status_code == 200, resp.content

    assert float(_widget_detail(env, pid)["quantity"]) == 25.0


@pytest.mark.django_db
def test_dimensional_lifecycle(env):
    """DIMENSIONAL: initial_dimensions → widget add via dimensions → ledger sums computed values."""
    pid = _create_product(env, {
        "sku": "LC-DIM-1",
        "name": "Fabric Roll",
        "profile": "DIMENSIONAL",
        "engine_config": {
            "dimensions": ["length", "width"],
            "unit": "m",
            "computed_unit": "m²",
            "formula": "length * width",
        },
        "initial_balance": 12,
        "initial_dimensions": {"length": 3, "width": 4},
        "initial_location_id": str(env["warehouse"].id),
    })

    listed = _find_in_list(_widget_list(env), "LC-DIM-1")
    assert float(listed["quantity"]) == 12.0

    # Add a 2 × 5 = 10 m² piece. Widget transaction computes qty from formula —
    # `quantity` placeholder must be > 0 to pass the upstream gate.
    resp = _widget_transaction(env, pid, {
        "operation": "add",
        "quantity": 1,
        "length": 2,
        "width": 5,
        "location_id": str(env["warehouse"].id),
    })
    assert resp.status_code == 200, resp.content

    assert float(_widget_detail(env, pid)["quantity"]) == 22.0


@pytest.mark.django_db
def test_batch_tracked_lifecycle(env):
    """BATCH_TRACKED: initial_batch → widget add (auto-batch synthesized) → batches grow."""
    pid = _create_product(env, {
        "sku": "LC-BATCH-1",
        "name": "Chemical Reagent",
        "profile": "BATCH_TRACKED",
        "initial_batch": {
            "batch_identifier": "INIT-BATCH",
            "lot_number": "LOT-1",
            "initial_quantity": 25,
            "initial_location_id": str(env["warehouse"].id),
        },
    })

    listed = _find_in_list(_widget_list(env), "LC-BATCH-1")
    assert float(listed["quantity"]) == 25.0

    resp = _widget_transaction(env, pid, {
        "operation": "add",
        "quantity": 5,
        "location_id": str(env["warehouse"].id),
        "bucket_data": {"batch_identifier": "NEW-BATCH"},
    })
    assert resp.status_code == 200, resp.content

    detail = _widget_detail(env, pid)
    assert float(detail["quantity"]) == 30.0
    identifiers = {b["batch_identifier"] for b in detail["stock_value"]}
    assert "INIT-BATCH" in identifiers
    assert "NEW-BATCH" in identifiers


@pytest.mark.django_db
def test_perishable_lifecycle(env):
    """PERISHABLE: initial_batch with expiry → widget add carrying expiry → both batches present."""
    pid = _create_product(env, {
        "sku": "LC-PERISH-1",
        "name": "Yogurt",
        "profile": "PERISHABLE",
        "initial_batch": {
            "batch_identifier": "YOG-INIT",
            "expiry_date": "2026-12-31",
            "initial_quantity": 10,
            "initial_location_id": str(env["warehouse"].id),
        },
    })

    listed = _find_in_list(_widget_list(env), "LC-PERISH-1")
    assert float(listed["quantity"]) == 10.0

    resp = _widget_transaction(env, pid, {
        "operation": "add",
        "quantity": 4,
        "location_id": str(env["warehouse"].id),
        "expiry_date": "2027-01-31",
        "batch_ref": "YOG-NEXT",
    })
    assert resp.status_code == 200, resp.content

    detail = _widget_detail(env, pid)
    assert float(detail["quantity"]) == 14.0
    expiries = [
        b.get("expiry_date") for b in detail["stock_value"]
    ]
    assert "2026-12-31" in expiries
    assert "2027-01-31" in expiries


@pytest.mark.django_db
def test_serialized_no_preset_lifecycle(env):
    """SERIALIZED (no preset): initial_serials → subtract one → count drops."""
    pid = _create_product(env, {
        "sku": "LC-SER-1",
        "name": "Plain Serials",
        "profile": "SERIALIZED",
        "initial_serials": ["SN-A1", "SN-A2", "SN-A3"],
        "initial_location_id": str(env["warehouse"].id),
    })

    listed = _find_in_list(_widget_list(env), "LC-SER-1")
    assert float(listed["quantity"]) == 3.0

    resp = _widget_transaction(env, pid, {
        "operation": "subtract",
        "quantity": 1,
        "physical_identifier": "SN-A1",
        "location_id": str(env["warehouse"].id),
    })
    assert resp.status_code == 200, resp.content

    # Plain SERIALIZED (no tracker preset) → ACTIVE-only count drops by 1.
    assert float(_widget_detail(env, pid)["quantity"]) == 2.0
    moved = PhysicalProduct.objects.get(identifier="SN-A1")
    assert moved.location.type == "VIRTUAL"


@pytest.mark.django_db
def test_serialized_with_tracker_preset_lifecycle(env):
    """SERIALIZED + tracker preset: status change keeps the item in inventory (Phase 01 contract)."""
    pid = _create_product(env, {
        "sku": "LC-TRK-1",
        "name": "Macbook 13",
        "profile": "SERIALIZED",
        "engine_config": {
            "status_transitions": {
                "ACTIVE": ["BROKEN"],
                "BROKEN": ["REPAIRED"],
                "REPAIRED": ["ACTIVE"],
            }
        },
        "initial_serials": ["MBP-001", "MBP-002"],
        "initial_location_id": str(env["warehouse"].id),
    })

    listed = _find_in_list(_widget_list(env), "LC-TRK-1")
    # Tracker-mode total counts all statuses, not just ACTIVE.
    assert float(listed["quantity"]) == 2.0

    resp = _widget_transaction(env, pid, {
        "operation": "status_change",
        "physical_identifier": "MBP-001",
        "new_status": "BROKEN",
    })
    assert resp.status_code == 200, resp.content

    # Phase 01 contract: status change must NOT remove the item from inventory.
    detail = _widget_detail(env, pid)
    assert float(detail["quantity"]) == 2.0
    statuses = {row["identifier"]: row["status"] for row in detail["stock_value"]}
    assert statuses["MBP-001"] == "BROKEN"
    assert statuses["MBP-002"] == "ACTIVE"


@pytest.mark.django_db
def test_assembled_lifecycle(env):
    """ASSEMBLED (BULK + counter + ASSEMBLY): same initial_balance path as SIMPLE_COUNT, then add via widget."""
    pid = _create_product(env, {
        "sku": "LC-ASSY-1",
        "name": "Bike Kit",
        "profile": "ASSEMBLED",
        "initial_balance": 4,
        "initial_location_id": str(env["warehouse"].id),
    })

    listed = _find_in_list(_widget_list(env), "LC-ASSY-1")
    assert float(listed["quantity"]) == 4.0

    resp = _widget_transaction(env, pid, {
        "operation": "add",
        "quantity": 2,
        "location_id": str(env["warehouse"].id),
    })
    assert resp.status_code == 200, resp.content

    assert float(_widget_detail(env, pid)["quantity"]) == 6.0
