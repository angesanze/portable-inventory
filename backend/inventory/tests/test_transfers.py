"""Inter-site transfers with an in-transit state (TRANSFERS-07).

Every stock change goes through LedgerService.transfer_stock. Covers: ship
parks goods in In Transit (source down, destination unchanged); partial
receive; shortage → LOSS; the per-line invariant sent == received + shortage +
in_transit; serialized and batch end-to-end; cross-company isolation.
"""

import pytest
from decimal import Decimal

from core.models import Company, User
from inventory import constants
from inventory.models import (
    Location,
    PhysicalProduct,
    ProductBatch,
    TransferOrder,
    TransferOrderLine,
)
from inventory.services import (
    CounterpartyService,
    LedgerService,
    StockService,
    TransferService,
)
from inventory.exceptions import InventoryError
from .helpers import make_batch_product, make_serialized_product, make_simple_product


@pytest.fixture
def env(db):
    company = Company.objects.create(name="TR Corp", license_code="TR0001")
    user = User.objects.create_user(username="tr_user", password="x", company=company)
    src = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    dst = Location.objects.create(company=company, name="Store", type="STORE")
    external = Location.objects.create(company=company, name="External Vendor", type="VIRTUAL")
    product = make_simple_product(company)
    return {
        "company": company,
        "user": user,
        "src": src,
        "dst": dst,
        "external": external,
        "product": product,
    }


def seed_bulk(env, product, qty, location=None, **kwargs):
    return LedgerService.transfer_stock(
        product,
        env["external"],
        location or env["src"],
        Decimal(str(qty)),
        env["user"],
        "Seed",
        **kwargs,
    )


def make_transfer(env, lines):
    """lines: list of dicts {product_model, quantity_sent, batch?, physical_product?}."""
    order = TransferOrder.objects.create(
        company=env["company"],
        from_location=env["src"],
        to_location=env["dst"],
        number=TransferService.next_number(env["company"]),
        created_by=env["user"],
    )
    for line in lines:
        TransferOrderLine.objects.create(transfer_order=order, **line)
    return order


def stock_at(product, location):
    return StockService.get_stock_for_location(product, location)


# ── Numbering ────────────────────────────────────────────────────────


def test_numbers_are_sequential_per_company(env):
    o1 = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("1")}])
    o2 = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("1")}])
    assert o1.number.startswith("TR-")
    prefix = o1.number.rsplit("-", 1)[0]
    assert o2.number == f"{prefix}-{int(o1.number.rsplit('-', 1)[1]) + 1:04d}"

    other = Company.objects.create(name="Other", license_code="TR0002")
    Location.objects.create(company=other, name="W", type="WAREHOUSE")
    Location.objects.create(company=other, name="S", type="STORE")
    other_order = TransferOrder.objects.create(
        company=other,
        from_location=Location.objects.get(company=other, name="W"),
        to_location=Location.objects.get(company=other, name="S"),
        number=TransferService.next_number(other),
    )
    assert other_order.number == o1.number


# ── Ship → In Transit ────────────────────────────────────────────────


def test_ship_moves_to_in_transit(env):
    """Source drops, destination unchanged, goods sit in the In Transit buffer."""
    seed_bulk(env, env["product"], 100)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("100")}])

    TransferService.ship(order, env["user"])
    order.refresh_from_db()
    assert order.status == "IN_TRANSIT"
    assert order.shipped_at is not None

    transit = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_TRANSIT)
    assert transit.type == constants.LOCATION_TYPE_VIRTUAL
    assert stock_at(env["product"], env["src"]) == Decimal("0")
    assert stock_at(env["product"], env["dst"]) == Decimal("0")
    assert stock_at(env["product"], transit) == Decimal("100")

    # In Transit is virtual → excluded from the standard breakdown (not at
    # either site, not sellable).
    breakdown = StockService.get_stock_for_model(env["product"])
    assert "In Transit" not in breakdown["breakdown"]
    assert breakdown["total"] == Decimal("0")

    # ...but the dedicated exposure surfaces it.
    report = TransferService.in_transit_stock(env["company"])
    assert report["total"] == Decimal("100")
    assert report["by_product"][0]["quantity"] == Decimal("100")


def test_transit_location_is_single_per_company(env):
    a = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_TRANSIT)
    b = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_TRANSIT)
    assert a.id == b.id
    assert Location.objects.filter(company=env["company"], name="In Transit").count() == 1


def test_ship_requires_draft(env):
    seed_bulk(env, env["product"], 10)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("10")}])
    TransferService.ship(order, env["user"])
    with pytest.raises(InventoryError):
        TransferService.ship(order, env["user"])


# ── Receive (partial) ────────────────────────────────────────────────


def test_partial_receive(env):
    seed_bulk(env, env["product"], 100)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("100")}])
    TransferService.ship(order, env["user"])
    line = order.lines.first()
    transit = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_TRANSIT)

    TransferService.receive(order, [{"line_id": str(line.id), "quantity": "60"}], env["user"])
    order.refresh_from_db()
    line.refresh_from_db()
    assert order.status == "PARTIALLY_RECEIVED"
    assert line.quantity_received == Decimal("60")
    assert line.quantity_in_transit == Decimal("40")
    assert stock_at(env["product"], env["dst"]) == Decimal("60")
    assert stock_at(env["product"], transit) == Decimal("40")

    TransferService.receive(order, [{"line_id": str(line.id), "quantity": "40"}], env["user"])
    order.refresh_from_db()
    line.refresh_from_db()
    assert order.status == "RECEIVED"
    assert order.received_at is not None
    assert line.quantity_received == Decimal("100")
    assert line.quantity_in_transit == Decimal("0")
    assert stock_at(env["product"], env["dst"]) == Decimal("100")
    assert stock_at(env["product"], transit) == Decimal("0")


def test_receive_over_residual_blocked(env):
    seed_bulk(env, env["product"], 10)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("10")}])
    TransferService.ship(order, env["user"])
    line = order.lines.first()
    with pytest.raises(InventoryError):
        TransferService.receive(order, [{"line_id": str(line.id), "quantity": "11"}], env["user"])


# ── Shortage → LOSS ──────────────────────────────────────────────────


def test_shortage_to_loss_and_invariant(env):
    """100 shipped, 95 received, 5 shortage: ledger balances, In Transit zero,
    status RECEIVED (acceptance criterion)."""
    seed_bulk(env, env["product"], 100)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("100")}])
    TransferService.ship(order, env["user"])
    line = order.lines.first()

    TransferService.receive(order, [{"line_id": str(line.id), "quantity": "95"}], env["user"])
    TransferService.report_shortage(order, str(line.id), "5", env["user"])

    order.refresh_from_db()
    line.refresh_from_db()
    assert order.status == "RECEIVED"
    assert line.quantity_received == Decimal("95")
    assert line.quantity_shortage == Decimal("5")
    assert line.quantity_in_transit == Decimal("0")
    # Invariant
    assert (
        line.quantity_sent
        == line.quantity_received + line.quantity_shortage + line.quantity_in_transit
    )

    transit = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_TRANSIT)
    loss = Location.objects.get(company=env["company"], type=constants.LOCATION_TYPE_LOSS)
    assert stock_at(env["product"], transit) == Decimal("0")
    assert stock_at(env["product"], env["dst"]) == Decimal("95")
    assert stock_at(env["product"], loss) == Decimal("5")
    assert stock_at(env["product"], env["src"]) == Decimal("0")


def test_shortage_over_residual_blocked(env):
    seed_bulk(env, env["product"], 10)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("10")}])
    TransferService.ship(order, env["user"])
    line = order.lines.first()
    with pytest.raises(InventoryError):
        TransferService.report_shortage(order, str(line.id), "11", env["user"])


# ── Serialized end-to-end ────────────────────────────────────────────


def test_serialized_end_to_end(env):
    product = make_serialized_product(env["company"])
    item = PhysicalProduct.objects.create(
        product_model=product,
        identifier="SN-1",
        location=env["src"],
        status="ACTIVE",
    )
    order = make_transfer(
        env,
        [
            {
                "product_model": product,
                "quantity_sent": Decimal("1"),
                "physical_product": item,
            }
        ],
    )
    TransferService.ship(order, env["user"])
    item.refresh_from_db()
    transit = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_TRANSIT)
    assert item.location_id == transit.id

    line = order.lines.first()
    TransferService.receive(order, [{"line_id": str(line.id), "quantity": "1"}], env["user"])
    item.refresh_from_db()
    order.refresh_from_db()
    assert item.location_id == env["dst"].id
    assert order.status == "RECEIVED"


# ── Batch end-to-end (identifier continuity) ─────────────────────────


def test_batch_end_to_end_keeps_identifier(env):
    product = make_batch_product(env["company"])
    seed_bulk(env, product, 50, batch_data={"batch_identifier": "LOT-A"})
    batch = ProductBatch.objects.get(
        product_model=product, batch_identifier="LOT-A", location=env["src"]
    )
    order = make_transfer(
        env,
        [
            {
                "product_model": product,
                "quantity_sent": Decimal("50"),
                "batch": batch,
            }
        ],
    )
    TransferService.ship(order, env["user"])
    batch.refresh_from_db()
    assert batch.quantity == Decimal("0")  # left the source

    line = order.lines.first()
    TransferService.receive(order, [{"line_id": str(line.id), "quantity": "50"}], env["user"])
    order.refresh_from_db()
    assert order.status == "RECEIVED"
    # Same identifier reconstituted at destination (continuity)
    dest_batch = ProductBatch.objects.get(
        product_model=product,
        batch_identifier="LOT-A",
        location=env["dst"],
    )
    assert dest_batch.quantity == Decimal("50")
    transit = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_TRANSIT)
    assert stock_at(product, transit) == Decimal("0")


# ── Cancel ───────────────────────────────────────────────────────────


def test_cancel_only_draft(env):
    seed_bulk(env, env["product"], 10)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("10")}])
    TransferService.cancel(order)
    order.refresh_from_db()
    assert order.status == "CANCELLED"


def test_cannot_cancel_in_transit(env):
    seed_bulk(env, env["product"], 10)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("10")}])
    TransferService.ship(order, env["user"])
    with pytest.raises(InventoryError):
        TransferService.cancel(order)


# ── Cross-company isolation ──────────────────────────────────────────


def test_cross_company_transit_is_isolated(env):
    seed_bulk(env, env["product"], 30)
    order = make_transfer(env, [{"product_model": env["product"], "quantity_sent": Decimal("30")}])
    TransferService.ship(order, env["user"])

    other = Company.objects.create(name="Other Co", license_code="TR0003")
    other_user = User.objects.create_user(username="o_user", password="x", company=other)
    o_src = Location.objects.create(company=other, name="OW", type="WAREHOUSE")
    o_dst = Location.objects.create(company=other, name="OS", type="STORE")
    o_ext = Location.objects.create(company=other, name="External Vendor", type="VIRTUAL")
    o_product = make_simple_product(other)
    LedgerService.transfer_stock(o_product, o_ext, o_src, Decimal("5"), other_user, "Seed")
    o_order = TransferOrder.objects.create(
        company=other,
        from_location=o_src,
        to_location=o_dst,
        number=TransferService.next_number(other),
        created_by=other_user,
    )
    TransferOrderLine.objects.create(
        transfer_order=o_order,
        product_model=o_product,
        quantity_sent=Decimal("5"),
    )
    TransferService.ship(o_order, other_user)

    # Each company sees only its own in-transit goods
    report = TransferService.in_transit_stock(env["company"])
    assert report["total"] == Decimal("30")
    assert all(row["sku"] == env["product"].sku for row in report["by_product"])

    other_report = TransferService.in_transit_stock(other)
    assert other_report["total"] == Decimal("5")

    # Distinct transit locations
    t1 = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_TRANSIT)
    t2 = CounterpartyService.resolve(other, constants.COUNTERPARTY_TRANSIT)
    assert t1.id != t2.id
