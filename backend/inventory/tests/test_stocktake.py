"""Physical stocktake (STOCKTAKE-05): snapshot → count → variance → apply.

Covers the snapshot for all three tracking modes, ADJUSTMENT booking in both
directions (surplus and shortfall), the one-open-session-per-location rule,
uncounted skip/zero, the APPLIED immutability, and cross-company isolation.
"""

import pytest
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.test import APIClient

from core.models import Company, User
from inventory.models import (
    CountSession,
    Location,
    Movement,
    PhysicalProduct,
)
from inventory.models.stocktake import CS_STATUS_APPLIED, CS_STATUS_COUNTING
from inventory.services import (
    CounterpartyService,
    LedgerService,
    StockService,
    StocktakeService,
)
from inventory.exceptions import InventoryError
from inventory import constants
from .helpers import (
    make_batch_product,
    make_serialized_product,
    make_simple_product,
)


@pytest.fixture
def env(db):
    company = Company.objects.create(name="Stk Corp", license_code="STK001")
    user = User.objects.create_user(username="stk_user", password="x", company=company)
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    external = Location.objects.create(company=company, name="External Vendor", type="VIRTUAL")
    return {
        "company": company,
        "user": user,
        "warehouse": warehouse,
        "external": external,
    }


def seed_bulk(env, product, qty, location=None):
    return LedgerService.transfer_stock(
        product,
        env["external"],
        location or env["warehouse"],
        Decimal(str(qty)),
        env["user"],
        "Seed",
    )


def seed_batch(env, product, qty, identifier, location=None):
    return LedgerService.transfer_stock(
        product,
        env["external"],
        location or env["warehouse"],
        Decimal(str(qty)),
        env["user"],
        "Seed",
        batch_data={"batch_identifier": identifier},
    )


def seed_serial(env, product, identifier, location=None):
    from inventory.orchestrators import InventoryOrchestrator

    pp = InventoryOrchestrator.resolve_or_create_item(
        product,
        identifier,
        env["external"],
        inbound=True,
    )
    LedgerService.transfer_stock(
        product,
        env["external"],
        location or env["warehouse"],
        Decimal("1"),
        env["user"],
        "Seed",
        physical_product=pp,
    )
    return PhysicalProduct.objects.get(product_model=product, identifier=identifier)


# ── Snapshot per tracking mode ──────────────────────────────────────


def test_snapshot_bulk(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 100)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    assert session.status == CS_STATUS_COUNTING
    line = session.lines.get(product_model=product)
    assert line.expected_qty == Decimal("100")
    assert line.batch_id is None and line.physical_product_id is None


def test_snapshot_batch(env):
    product = make_batch_product(env["company"])
    seed_batch(env, product, 40, "LOT-A")
    seed_batch(env, product, 10, "LOT-B")
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    lines = session.lines.filter(product_model=product)
    assert lines.count() == 2
    assert {l.batch.batch_identifier: l.expected_qty for l in lines} == {
        "LOT-A": Decimal("40"),
        "LOT-B": Decimal("10"),
    }


def test_snapshot_serialized(env):
    product = make_serialized_product(env["company"])
    seed_serial(env, product, "SN-1")
    seed_serial(env, product, "SN-2")
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    lines = session.lines.filter(product_model=product)
    assert lines.count() == 2
    assert all(l.expected_qty == Decimal("1") and l.physical_product_id for l in lines)


# ── Apply: ADJUSTMENT in both directions ────────────────────────────


def test_apply_bulk_shortfall(env):
    """Expected 100, counted 97 → ADJUSTMENT movement of 3, stock post = 97."""
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 100)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    line = session.lines.get(product_model=product)
    StocktakeService.record_count(line, 97, env["user"])

    adjustment = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_ADJUSTMENT)
    result = StocktakeService.apply(session, env["user"])

    assert result["adjustments"] == 1
    m = Movement.objects.get(id=result["movement_ids"][0])
    assert m.quantity == Decimal("3")
    assert m.from_location_id == env["warehouse"].id
    assert m.to_location_id == adjustment.id
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("97")
    session.refresh_from_db()
    assert session.status == CS_STATUS_APPLIED


def test_apply_bulk_surplus(env):
    """Expected 50, counted 55 → ADJUSTMENT→location of 5, stock post = 55."""
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 50)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    line = session.lines.get(product_model=product)
    StocktakeService.record_count(line, 55, env["user"])

    adjustment = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_ADJUSTMENT)
    result = StocktakeService.apply(session, env["user"])

    m = Movement.objects.get(id=result["movement_ids"][0])
    assert m.quantity == Decimal("5")
    assert m.from_location_id == adjustment.id
    assert m.to_location_id == env["warehouse"].id
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("55")


def test_apply_batch_shortfall(env):
    product = make_batch_product(env["company"])
    seed_batch(env, product, 40, "LOT-A")
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    line = session.lines.get(product_model=product)
    StocktakeService.record_count(line, 30, env["user"])
    StocktakeService.apply(session, env["user"])
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("30")


def test_apply_serialized_missing(env):
    """A serialized unit expected but counted 0 → outbound that very unit."""
    product = make_serialized_product(env["company"])
    pp = seed_serial(env, product, "SN-1")
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    line = session.lines.get(physical_product=pp)
    StocktakeService.record_count(line, 0, env["user"])

    adjustment = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_ADJUSTMENT)
    result = StocktakeService.apply(session, env["user"])
    assert result["adjustments"] == 1
    m = Movement.objects.get(id=result["movement_ids"][0])
    assert m.physical_product_id == pp.id
    assert m.from_location_id == env["warehouse"].id
    assert m.to_location_id == adjustment.id
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("0")


def test_no_variance_no_movement(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 20)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    line = session.lines.get(product_model=product)
    StocktakeService.record_count(line, 20, env["user"])
    result = StocktakeService.apply(session, env["user"])
    assert result["adjustments"] == 0


# ── One open session per location ───────────────────────────────────


def test_double_session_same_location_forbidden(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 10)
    StocktakeService.open_session(env["warehouse"], env["user"])
    with pytest.raises(InventoryError):
        StocktakeService.open_session(env["warehouse"], env["user"])


def test_clean_blocks_second_active_session(env):
    StocktakeService.open_session(env["warehouse"], env["user"])
    dup = CountSession(
        company=env["company"],
        location=env["warehouse"],
        status=CS_STATUS_COUNTING,
    )
    with pytest.raises(DjangoValidationError):
        dup.clean()


def test_new_session_allowed_after_apply(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 10)
    s1 = StocktakeService.open_session(env["warehouse"], env["user"])
    line = s1.lines.get(product_model=product)
    StocktakeService.record_count(line, 10, env["user"])
    StocktakeService.apply(s1, env["user"])
    # Now a fresh session is allowed.
    s2 = StocktakeService.open_session(env["warehouse"], env["user"])
    assert s2.id != s1.id


# ── Uncounted skip / zero ───────────────────────────────────────────


def test_uncounted_skip_leaves_stock(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 30)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    # Do not count anything.
    result = StocktakeService.apply(session, env["user"], uncounted="skip")
    assert result["adjustments"] == 0
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("30")


def test_uncounted_zero_writes_off(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 30)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    result = StocktakeService.apply(session, env["user"], uncounted="zero")
    assert result["adjustments"] == 1
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("0")


# ── APPLIED immutability ────────────────────────────────────────────


def test_applied_session_cannot_reapply(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 10)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    line = session.lines.get(product_model=product)
    StocktakeService.record_count(line, 8, env["user"])
    StocktakeService.apply(session, env["user"])
    with pytest.raises(InventoryError):
        StocktakeService.apply(session, env["user"])


def test_applied_session_cannot_record_count(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 10)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    line = session.lines.get(product_model=product)
    StocktakeService.record_count(line, 8, env["user"])
    StocktakeService.apply(session, env["user"])
    line.refresh_from_db()
    with pytest.raises(InventoryError):
        StocktakeService.record_count(line, 5, env["user"])


# ── Variance report ─────────────────────────────────────────────────


def test_variance_report_flags_movements_after_snapshot(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 50)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    report = StocktakeService.variance_report(session)
    assert report["movements_after_snapshot"] is False
    # A non-stocktake movement after the snapshot trips the warning.
    seed_bulk(env, product, 5)
    report = StocktakeService.variance_report(session)
    assert report["movements_after_snapshot"] is True


def test_variance_report_lists_uncounted_and_variances(env):
    p1 = make_simple_product(env["company"])
    p2 = make_simple_product(env["company"])
    seed_bulk(env, p1, 100)
    seed_bulk(env, p2, 20)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    l1 = session.lines.get(product_model=p1)
    StocktakeService.record_count(l1, 97, env["user"])
    report = StocktakeService.variance_report(session)
    assert len(report["variances"]) == 1
    assert report["variances"][0]["variance"] == Decimal("-3")
    assert len(report["uncounted"]) == 1
    assert report["uncounted"][0]["product_id"] == str(p2.id)


# ── APPLIED report stays consultable ────────────────────────────────


def test_applied_report_consultable(env):
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 100)
    session = StocktakeService.open_session(env["warehouse"], env["user"])
    line = session.lines.get(product_model=product)
    StocktakeService.record_count(line, 97, env["user"])
    StocktakeService.apply(session, env["user"])
    session.refresh_from_db()
    report = StocktakeService.variance_report(session)
    assert report["status"] == CS_STATUS_APPLIED
    assert len(report["variances"]) == 1


# ── Cross-company isolation (API) ───────────────────────────────────


def test_cross_company_session_not_visible(env):
    other = Company.objects.create(name="Other", license_code="STK002")
    other_user = User.objects.create_user(username="other", password="x", company=other)
    product = make_simple_product(env["company"])
    seed_bulk(env, product, 10)
    session = StocktakeService.open_session(env["warehouse"], env["user"])

    client = APIClient()
    client.force_authenticate(user=other_user)
    resp = client.get(f"/api/v1/count-sessions/{session.id}/")
    assert resp.status_code == 404


def test_cannot_open_session_on_foreign_location(env):
    other = Company.objects.create(name="Other2", license_code="STK003")
    other_user = User.objects.create_user(username="other2", password="x", company=other)
    client = APIClient()
    client.force_authenticate(user=other_user)
    resp = client.post(
        "/api/v1/count-sessions/",
        {"location_id": str(env["warehouse"].id)},
        format="json",
    )
    assert resp.status_code == 400
