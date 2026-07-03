"""Sales orders (SALES-ORDERS-04): order → confirm (reserve) → pick → ship.

Confirming reserves stock for every line or fails with a per-line shortfall
report; shipping consumes the reservation and creates the outbound Movement
attributed to the customer. Covers partials, cancel-releases-reservations,
FEFO pick-list ordering, the "no two orders oversell the same stock" guarantee,
and cross-company isolation.
"""

import pytest
from decimal import Decimal

from rest_framework.test import APIClient

from core.models import Company, User
from inventory.models import (
    Customer,
    Location,
    Movement,
    PhysicalProduct,
    ProductBatch,
    Reservation,
    SalesOrder,
    SalesOrderLine,
)
from inventory.services import LedgerService, SalesService, StockService
from inventory.services.reservations import ReservationService
from inventory.exceptions import InventoryError
from .helpers import (
    make_batch_product,
    make_perishable_product,
    make_serialized_product,
    make_simple_product,
)


@pytest.fixture
def env(db):
    company = Company.objects.create(name="SO Corp", license_code="SO0001")
    user = User.objects.create_user(username="so_user", password="x", company=company)
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    external = Location.objects.create(company=company, name="External Vendor", type="VIRTUAL")
    customer = Customer.objects.create(company=company, name="Beta Retail")
    product = make_simple_product(company)
    return {
        "company": company,
        "user": user,
        "warehouse": warehouse,
        "external": external,
        "customer": customer,
        "product": product,
    }


def seed_stock(env, product, qty, location=None):
    LedgerService.transfer_stock(
        product,
        env["external"],
        location or env["warehouse"],
        Decimal(str(qty)),
        env["user"],
        "Seed",
    )


def make_so(env, lines=None, product=None, qty=Decimal("10"), unit_price=Decimal("5.00")):
    so = SalesOrder.objects.create(
        company=env["company"],
        customer=env["customer"],
        number=SalesService.next_number(env["company"]),
        created_by=env["user"],
    )
    if lines is None:
        lines = [(product or env["product"], qty, unit_price)]
    for product_model, quantity, price in lines:
        SalesOrderLine.objects.create(
            sales_order=so,
            product_model=product_model,
            quantity_ordered=quantity,
            unit_price=price,
        )
    return so


# ── Numbering ────────────────────────────────────────────────────────


def test_numbers_are_sequential_per_company(env):
    so1 = make_so(env)
    so2 = make_so(env, lines=[(make_simple_product(env["company"]), Decimal("1"), None)])
    year_prefix = so1.number.rsplit("-", 1)[0]
    assert so1.number.startswith("SO-")
    assert so2.number == f"{year_prefix}-{int(so1.number.rsplit('-', 1)[1]) + 1:04d}"

    other_company = Company.objects.create(name="Other", license_code="SO0002")
    other_customer = Customer.objects.create(company=other_company, name="Other Cust")
    other_so = SalesOrder.objects.create(
        company=other_company,
        customer=other_customer,
        number=SalesService.next_number(other_company),
    )
    assert other_so.number == so1.number


# ── Confirm reserves all lines or fails ──────────────────────────────


def test_confirm_reserves_every_line(env):
    p2 = make_simple_product(env["company"])
    seed_stock(env, env["product"], 10)
    seed_stock(env, p2, 4)
    so = make_so(
        env, lines=[(env["product"], Decimal("6"), Decimal("5")), (p2, Decimal("4"), Decimal("3"))]
    )

    SalesService.confirm(so, env["warehouse"])
    so.refresh_from_db()
    assert so.status == "CONFIRMED"

    reserved_p1 = ReservationService.active_reserved_qty(env["product"], env["warehouse"])
    reserved_p2 = ReservationService.active_reserved_qty(p2, env["warehouse"])
    assert reserved_p1 == Decimal("6")
    assert reserved_p2 == Decimal("4")


def test_confirm_fails_with_per_line_shortfall(env):
    p2 = make_simple_product(env["company"], sku="SHORT")
    seed_stock(env, env["product"], 10)
    seed_stock(env, p2, 2)
    so = make_so(env, lines=[(env["product"], Decimal("6"), None), (p2, Decimal("5"), None)])

    with pytest.raises(InventoryError, match=r"SHORT.*need 5"):
        SalesService.confirm(so, env["warehouse"])

    so.refresh_from_db()
    assert so.status == "DRAFT"
    # Atomic: the first line's reservation must NOT survive the failure
    assert ReservationService.active_reserved_qty(env["product"], env["warehouse"]) == Decimal("0")


def test_confirm_requires_lines(env):
    so = SalesOrder.objects.create(
        company=env["company"],
        customer=env["customer"],
        number=SalesService.next_number(env["company"]),
    )
    with pytest.raises(InventoryError, match="without lines"):
        SalesService.confirm(so, env["warehouse"])


# ── Acceptance: two orders cannot oversell the same stock ─────────────


def test_two_confirms_never_exceed_available(env):
    """Two SOs of 8 on stock 10: the second confirm fails naming the line."""
    seed_stock(env, env["product"], 10)
    so1 = make_so(env, qty=Decimal("8"))
    so2 = make_so(env, qty=Decimal("8"))

    SalesService.confirm(so1, env["warehouse"])
    with pytest.raises(InventoryError, match="need 8"):
        SalesService.confirm(so2, env["warehouse"])

    so2.refresh_from_db()
    assert so2.status == "DRAFT"
    # Only the first order's 8 are held
    assert ReservationService.active_reserved_qty(env["product"], env["warehouse"]) == Decimal("8")


# ── Ship consumes reservation + records customer ─────────────────────


def test_ship_partial_then_complete(env):
    """Ship 5 then 3 on a line of 8: two Movements, reservation consumed
    exactly, status PARTIALLY_SHIPPED → SHIPPED (acceptance)."""
    seed_stock(env, env["product"], 10)
    so = make_so(env, qty=Decimal("8"))
    SalesService.confirm(so, env["warehouse"])
    line = so.lines.first()

    moves1 = SalesService.ship(so, [{"line_id": str(line.id), "quantity": "5"}], env["user"])
    so.refresh_from_db()
    line.refresh_from_db()
    assert so.status == "PARTIALLY_SHIPPED"
    assert line.quantity_shipped == Decimal("5")
    assert len(moves1) == 1
    m = moves1[0]
    assert m.customer == env["customer"]
    assert m.to_location.type == "VIRTUAL"
    assert m.from_location == env["warehouse"]
    assert m.reason == f"SO {so.number}"
    # Physical stock dropped by 5; remainder 3 still reserved
    assert StockService.get_stock_for_location(env["product"], env["warehouse"]) == Decimal("5")
    assert ReservationService.active_reserved_qty(env["product"], env["warehouse"]) == Decimal("3")

    moves2 = SalesService.ship(so, [{"line_id": str(line.id), "quantity": "3"}], env["user"])
    so.refresh_from_db()
    line.refresh_from_db()
    assert so.status == "SHIPPED"
    assert line.quantity_shipped == Decimal("8")
    assert len(moves2) == 1
    assert StockService.get_stock_for_location(env["product"], env["warehouse"]) == Decimal("2")
    assert ReservationService.active_reserved_qty(env["product"], env["warehouse"]) == Decimal("0")

    assert Movement.objects.filter(reason=f"SO {so.number}").count() == 2


def test_ship_over_residual_blocked(env):
    seed_stock(env, env["product"], 10)
    so = make_so(env, qty=Decimal("4"))
    SalesService.confirm(so, env["warehouse"])
    line = so.lines.first()
    with pytest.raises(InventoryError, match="exceeds the remaining"):
        SalesService.ship(so, [{"line_id": str(line.id), "quantity": "5"}], env["user"])
    line.refresh_from_db()
    assert line.quantity_shipped == Decimal("0")
    assert Movement.objects.filter(reason=f"SO {so.number}").count() == 0


def test_ship_requires_confirmed(env):
    seed_stock(env, env["product"], 10)
    so = make_so(env, qty=Decimal("4"))
    line = so.lines.first()
    with pytest.raises(InventoryError, match="not shippable"):
        SalesService.ship(so, [{"line_id": str(line.id), "quantity": "1"}], env["user"])


# ── Cancel releases reservations ─────────────────────────────────────


def test_cancel_releases_reservations(env):
    seed_stock(env, env["product"], 10)
    so = make_so(env, qty=Decimal("6"))
    SalesService.confirm(so, env["warehouse"])
    assert ReservationService.active_reserved_qty(env["product"], env["warehouse"]) == Decimal("6")

    SalesService.cancel(so)
    so.refresh_from_db()
    assert so.status == "CANCELLED"
    # Reservations released → full stock available again
    assert ReservationService.active_reserved_qty(env["product"], env["warehouse"]) == Decimal("0")
    assert StockService.get_available_for_location(env["product"], env["warehouse"]) == Decimal(
        "10"
    )


def test_cancel_blocked_after_shipment(env):
    seed_stock(env, env["product"], 10)
    so = make_so(env, qty=Decimal("6"))
    SalesService.confirm(so, env["warehouse"])
    line = so.lines.first()
    SalesService.ship(so, [{"line_id": str(line.id), "quantity": "1"}], env["user"])
    # Once anything has shipped the order is PARTIALLY_SHIPPED and not cancellable.
    with pytest.raises(InventoryError, match="cancelled"):
        SalesService.cancel(so)


# ── Widget cannot consume reserved stock (acceptance) ────────────────


def test_reserved_stock_unavailable_to_plain_transfer(env):
    seed_stock(env, env["product"], 10)
    so = make_so(env, qty=Decimal("10"))
    SalesService.confirm(so, env["warehouse"])
    # All 10 reserved → a non-fulfilling outbound transfer must be refused
    with pytest.raises(InventoryError):
        LedgerService.transfer_stock(
            env["product"],
            env["warehouse"],
            env["external"],
            Decimal("1"),
            env["user"],
            "Widget sale",
        )


# ── FEFO in pick list ────────────────────────────────────────────────


def test_pick_list_fefo_for_perishable(env):
    product = make_perishable_product(env["company"])
    # Two batches, later expiry seeded first
    LedgerService.transfer_stock(
        product,
        env["external"],
        env["warehouse"],
        Decimal("5"),
        env["user"],
        "Seed",
        batch_data={"batch_identifier": "LATE", "data": {"expiry_date": "2027-12-31"}},
    )
    LedgerService.transfer_stock(
        product,
        env["external"],
        env["warehouse"],
        Decimal("5"),
        env["user"],
        "Seed",
        batch_data={"batch_identifier": "SOON", "data": {"expiry_date": "2026-01-31"}},
    )
    so = make_so(env, lines=[(product, Decimal("3"), Decimal("2"))])
    SalesService.confirm(so, env["warehouse"])

    pick = SalesService.pick_list(so)
    line_entry = pick["lines"][0]
    identifiers = [b["batch_identifier"] for b in line_entry["batches"]]
    # FEFO: soonest expiry first
    assert identifiers[0] == "SOON"
    assert identifiers.index("SOON") < identifiers.index("LATE")
    # Pulling a pick list advances CONFIRMED → PICKING
    so.refresh_from_db()
    assert so.status == "PICKING"


# ── Serialized confirm + ship ────────────────────────────────────────


def test_serialized_confirm_and_ship(env):
    product = make_serialized_product(env["company"])
    items = [
        PhysicalProduct.objects.create(
            product_model=product,
            identifier=f"SN-{i}",
            location=env["warehouse"],
            status="ACTIVE",
        )
        for i in range(3)
    ]
    so = make_so(env, lines=[(product, Decimal("2"), Decimal("50"))])
    SalesService.confirm(so, env["warehouse"])
    line = so.lines.first()
    # Two distinct items reserved
    reserved = Reservation.objects.filter(sales_order_line=line, status="ACTIVE")
    assert reserved.count() == 2

    ship_serials = [items[0].identifier, items[1].identifier]
    moves = SalesService.ship(
        so,
        [{"line_id": str(line.id), "quantity": "2", "serials": ship_serials}],
        env["user"],
    )
    assert len(moves) == 2
    assert all(m.customer == env["customer"] for m in moves)
    items[0].refresh_from_db()
    items[1].refresh_from_db()
    # Shipped items leave the warehouse to the virtual External customer location
    assert items[0].location.type == "VIRTUAL"
    assert items[0].location != env["warehouse"]
    so.refresh_from_db()
    assert so.status == "SHIPPED"


# ── Batch confirm + ship ─────────────────────────────────────────────


def test_batch_confirm_and_ship(env):
    product = make_batch_product(env["company"])
    LedgerService.transfer_stock(
        product,
        env["external"],
        env["warehouse"],
        Decimal("20"),
        env["user"],
        "Seed",
        batch_data={"batch_identifier": "LOT-A"},
    )
    so = make_so(env, lines=[(product, Decimal("8"), Decimal("4"))])
    SalesService.confirm(so, env["warehouse"])
    line = so.lines.first()
    batch = ProductBatch.objects.get(product_model=product, batch_identifier="LOT-A")

    moves = SalesService.ship(
        so,
        [{"line_id": str(line.id), "quantity": "8", "batch_id": str(batch.id)}],
        env["user"],
    )
    assert len(moves) == 1
    batch.refresh_from_db()
    assert batch.quantity == Decimal("12")
    so.refresh_from_db()
    assert so.status == "SHIPPED"


# ── Cross-company isolation ──────────────────────────────────────────


def test_cross_company_isolation_api(env):
    other_company = Company.objects.create(name="Rival", license_code="SO0003")
    other_user = User.objects.create_user(username="rival", password="x", company=other_company)
    so = make_so(env)

    rival = APIClient()
    rival.force_authenticate(user=other_user)
    resp = rival.get(f"/api/v1/sales-orders/{so.id}/")
    assert resp.status_code == 404
    resp = rival.post(
        f"/api/v1/sales-orders/{so.id}/confirm/",
        {"location_id": str(env["warehouse"].id)},
        format="json",
    )
    assert resp.status_code == 404


# ── API full cycle ───────────────────────────────────────────────────


@pytest.fixture
def api(env):
    client = APIClient()
    client.force_authenticate(user=env["user"])
    return client


def test_api_full_cycle(env, api):
    seed_stock(env, env["product"], 10)
    resp = api.post(
        "/api/v1/sales-orders/",
        {
            "customer_id": str(env["customer"].id),
            "notes": "rush",
            "lines": [
                {
                    "product_model_id": str(env["product"].id),
                    "quantity_ordered": "8",
                    "unit_price": "5.00",
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    so_id = resp.data["id"]
    assert resp.data["status"] == "DRAFT"
    assert resp.data["number"].startswith("SO-")
    line_id = resp.data["lines"][0]["id"]

    # Confirm reserves
    resp = api.post(
        f"/api/v1/sales-orders/{so_id}/confirm/",
        {
            "location_id": str(env["warehouse"].id),
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.data["status"] == "CONFIRMED"

    # Editing a confirmed order is rejected
    resp = api.patch(f"/api/v1/sales-orders/{so_id}/", {"notes": "nope"}, format="json")
    assert resp.status_code == 400

    # Pick list (read-only)
    resp = api.get(f"/api/v1/sales-orders/{so_id}/pick_list/")
    assert resp.status_code == 200
    assert Decimal(str(resp.data["lines"][0]["reserved"])) == Decimal("8")

    # Ship partial
    resp = api.post(
        f"/api/v1/sales-orders/{so_id}/ship/",
        {
            "shipments": [{"line_id": line_id, "quantity": "5"}],
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.data["status"] == "PARTIALLY_SHIPPED"
    assert len(resp.data["movement_ids"]) == 1

    # Ship the rest
    resp = api.post(
        f"/api/v1/sales-orders/{so_id}/ship/",
        {
            "shipments": [{"line_id": line_id, "quantity": "3"}],
        },
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["status"] == "SHIPPED"


def test_api_confirm_shortfall_reported(env, api):
    seed_stock(env, env["product"], 2)
    resp = api.post(
        "/api/v1/sales-orders/",
        {
            "customer_id": str(env["customer"].id),
            "lines": [{"product_model_id": str(env["product"].id), "quantity_ordered": "5"}],
        },
        format="json",
    )
    so_id = resp.data["id"]
    resp = api.post(
        f"/api/v1/sales-orders/{so_id}/confirm/",
        {
            "location_id": str(env["warehouse"].id),
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "need 5" in resp.data["detail"] and "only 2" in resp.data["detail"]


def test_api_cancel_and_delete_rules(env, api):
    so = make_so(env)
    resp = api.post(f"/api/v1/sales-orders/{so.id}/cancel/")
    assert resp.status_code == 200
    assert resp.data["status"] == "CANCELLED"
    # CANCELLED cannot be deleted (only DRAFT)
    resp = api.delete(f"/api/v1/sales-orders/{so.id}/")
    assert resp.status_code == 400

    so2 = make_so(env, lines=[(make_simple_product(env["company"]), Decimal("1"), None)])
    resp = api.delete(f"/api/v1/sales-orders/{so2.id}/")
    assert resp.status_code == 204
    assert not SalesOrder.objects.filter(id=so2.id).exists()
