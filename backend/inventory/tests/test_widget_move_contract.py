"""Contract tests: the widget bodies the FRONTEND actually sends must book the
correct quantity / metadata on the backend.

Regression guard for WIDGET-01. The frontend historically posted its calculator
envelope under ``calculator_payload`` — a key the backend never reads — with
``batch_id``/``batch_data`` nested inside it, so the backend silently fell back
to the raw outer quantity: converter ratios and dimension formulas were dropped
and expiry/lot metadata was lost. These tests post the exact fixed shapes
produced by ``features/widget/payload.ts::buildMovePayloadParts`` (and the flat
``/transaction/`` path) and assert the booked result, so the two sides of the
contract can never drift back apart unnoticed.
"""

import uuid
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from core.models import Company, ApiKey
from inventory.models import ProductModel, Location, ProductBatch
from inventory.services.stock import StockService


@pytest.fixture
def setup(db):
    company = Company.objects.create(
        name="MoveContractCo", license_code=uuid.uuid4().hex[:6].upper()
    )
    key = ApiKey.objects.create(company=company, key=f"mvc_{uuid.uuid4().hex[:12]}")
    loc = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    return {"client": APIClient(), "company": company, "key": key.key, "loc": loc}


def _move(setup, body):
    return setup["client"].post(f"/api/v1/widget/move/?api_key={setup['key']}", body, format="json")


@pytest.mark.django_db
def test_dimensional_move_books_formula_value_not_raw_quantity(setup):
    """DIMENSIONAL: ``calc_payload.dimension_values`` drives the booked amount
    (length*width = 6), NOT the raw outer quantity the widget sends as 0."""
    prod = ProductModel.objects.create(
        company=setup["company"],
        sku="SHEET",
        name="Steel Sheet",
        profile="DIMENSIONAL",
        engine_config={"dimensions": ["length", "width"], "unit": "m", "formula": "length * width"},
    )
    resp = _move(
        setup,
        {
            "product_id": str(prod.id),
            "location_id": str(setup["loc"].id),
            "quantity": 0,
            "calc_payload": {"operation": "add", "dimension_values": {"length": 2, "width": 3}},
        },
    )
    assert resp.status_code == 200, resp.data
    assert StockService.get_stock_for_location(prod, setup["loc"]) == Decimal("6")


@pytest.mark.django_db
def test_unit_conversion_move_applies_ratio(setup):
    """UNIT_CONVERSION: the ratio is applied backend-side via ``calc_payload``;
    2 rolls * 10 = 20 units booked, not the raw 2."""
    prod = ProductModel.objects.create(
        company=setup["company"],
        sku="CABLE",
        name="Cable Roll",
        profile="UNIT_CONVERSION",
        engine_config={"ratio_source": "attribute:units_per_roll"},
        attributes={"units_per_roll": 10},
    )
    resp = _move(
        setup,
        {
            "product_id": str(prod.id),
            "location_id": str(setup["loc"].id),
            "quantity": 2,
            "calc_payload": {"operation": "add", "quantity": 2},
        },
    )
    assert resp.status_code == 200, resp.data
    assert StockService.get_stock_for_location(prod, setup["loc"]) == Decimal("20")


@pytest.mark.django_db
def test_perishable_add_stores_expiry_under_expiry_date_key(setup):
    """PERISHABLE add: TOP-LEVEL ``batch_data`` lands in
    ``ProductBatch.data['expiry_date']`` — the exact key ``DateOffsetMonitor``
    reads, so expiry alerts can actually fire."""
    prod = ProductModel.objects.create(
        company=setup["company"],
        sku="MILK",
        name="Milk",
        profile="PERISHABLE",
    )
    resp = _move(
        setup,
        {
            "product_id": str(prod.id),
            "location_id": str(setup["loc"].id),
            "quantity": 5,
            "batch_data": {"batch_identifier": "LOT-EXP", "data": {"expiry_date": "2027-01-01"}},
        },
    )
    assert resp.status_code == 200, resp.data
    batch = ProductBatch.objects.get(product_model=prod, batch_identifier="LOT-EXP")
    assert batch.quantity == Decimal("5")
    assert batch.data.get("expiry_date") == "2027-01-01"


@pytest.mark.django_db
def test_dimensional_flat_transaction_not_rejected_as_invalid_quantity(setup):
    """Flat ``/widget/{id}/transaction/``: a dimensional add carrying
    ``quantity: 0`` must reach the formula rather than tripping the positivity
    guard first (WIDGET-02)."""
    prod = ProductModel.objects.create(
        company=setup["company"],
        sku="SHEET2",
        name="Sheet 2",
        profile="DIMENSIONAL",
        engine_config={"dimensions": ["length", "width"], "unit": "m", "formula": "length * width"},
    )
    resp = setup["client"].post(
        f"/api/v1/widget/{prod.id}/transaction/?api_key={setup['key']}",
        {"operation": "add", "quantity": 0, "dimension_values": {"length": 2, "width": 4}},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert StockService.get_stock_for_location(prod, setup["loc"]) == Decimal("8")
