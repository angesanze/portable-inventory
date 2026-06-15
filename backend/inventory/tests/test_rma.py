"""Returns / RMA (RMA-08): customer + supplier return lifecycle.

Covers the full customer-return cycle for the three resolutions (RESTOCK,
SCRAP, RETURN_TO_SUPPLIER) with a coherent ledger, supplier returns shipped
directly to the vendor, SERIALIZED reactivation RETURNED→ACTIVE on restock,
cross-company isolation, double-resolve prevention, and the quarantine area
being excluded from available stock.

Every physical stock change goes through LedgerService — the tests assert on
the resulting Movements and on StockService quantities.
"""
import pytest
from decimal import Decimal

from core.models import Company, User
from inventory import constants
from inventory.models import (
    Customer, Location, Movement, PhysicalProduct, ReturnOrder,
    ReturnOrderLine, Supplier,
)
from inventory.services import LedgerService, RmaService, StockService, CounterpartyService
from inventory.exceptions import InventoryError
from .helpers import make_simple_product, make_serialized_product


@pytest.fixture
def env(db):
    company = Company.objects.create(name="RMA Corp", license_code="RMA001")
    user = User.objects.create_user(username="rma_user", password="x", company=company)
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    customer = Customer.objects.create(company=company, name="Mario Rossi")
    supplier = Supplier.objects.create(company=company, name="Acme Forniture")
    product = make_simple_product(company)
    return {
        "company": company, "user": user, "warehouse": warehouse,
        "customer": customer, "supplier": supplier, "product": product,
    }


def make_customer_rma(env, lines):
    """lines: list of (product_model, quantity, physical_product?)."""
    rma = ReturnOrder.objects.create(
        company=env["company"], kind=constants.RMA_KIND_CUSTOMER_RETURN,
        customer=env["customer"], number=RmaService.next_number(env["company"]),
        created_by=env["user"],
    )
    for entry in lines:
        product, qty = entry[0], entry[1]
        pp = entry[2] if len(entry) > 2 else None
        ReturnOrderLine.objects.create(
            return_order=rma, product_model=product, quantity=qty, physical_product=pp,
        )
    return rma


def stock_in(env, product, qty, location=None):
    """Receive `qty` into the warehouse from the vendor (a real receipt)."""
    vendor = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_VENDOR)
    LedgerService.transfer_stock(
        product_model=product, from_location=vendor, to_location=location or env["warehouse"],
        quantity=qty, user=env["user"], reason="seed",
    )


# ── Numbering ────────────────────────────────────────────────────────


def test_numbers_sequential_per_company(env):
    rma1 = make_customer_rma(env, [(env["product"], Decimal("1"))])
    rma2 = make_customer_rma(env, [(env["product"], Decimal("1"))])
    assert rma1.number.startswith("RMA-")
    n1 = int(rma1.number.rsplit('-', 1)[1])
    n2 = int(rma2.number.rsplit('-', 1)[1])
    assert n2 == n1 + 1


# ── Quarantine excluded from available ───────────────────────────────


def test_quarantine_excluded_from_available(env):
    """Goods in quarantine are real stock but never count as available."""
    product = env["product"]
    stock_in(env, product, Decimal("5"))
    rma = make_customer_rma(env, [(product, Decimal("3"))])
    RmaService.receive(rma, env["user"])

    quarantine = RmaService.quarantine_location(env["company"])
    assert quarantine.is_sellable is False
    # Physically present in quarantine.
    assert StockService.get_stock_for_location(product, quarantine) == Decimal("3")
    # But NOT available there (non-sellable → 0).
    assert StockService.get_available_for_location(product, quarantine) == Decimal("0")
    # Sellable total only counts the warehouse (5), not quarantine (3).
    assert StockService.get_stock_for_model(product)["total"] == Decimal("5")
    # Surfaced separately.
    q = StockService.get_quarantine_for_model(product)
    assert q["total"] == Decimal("3")
    assert q["breakdown"][constants.DEFAULT_QUARANTINE_LOCATION_NAME] == Decimal("3")


# ── Customer return: the three resolutions ───────────────────────────


def test_customer_return_restock_and_scrap_acceptance(env):
    """Acceptance: cliente rende 3 pezzi → quarantena +3; 2 RESTOCK + 1 SCRAP
    → magazzino +2, LOSS +1, quarantena 0, RMA RESOLVED."""
    product = env["product"]
    stock_in(env, product, Decimal("10"))
    rma = make_customer_rma(env, [(product, Decimal("1")), (product, Decimal("1")), (product, Decimal("1"))])
    RmaService.receive(rma, env["user"])
    rma.refresh_from_db()
    assert rma.status == constants.RMA_STATUS_RECEIVED

    quarantine = RmaService.quarantine_location(env["company"])
    assert StockService.get_stock_for_location(product, quarantine) == Decimal("3")

    lines = list(rma.lines.all())
    RmaService.resolve_line(lines[0], constants.RMA_RESOLUTION_RESTOCK, env["user"])
    RmaService.resolve_line(lines[1], constants.RMA_RESOLUTION_RESTOCK, env["user"])
    RmaService.resolve_line(lines[2], constants.RMA_RESOLUTION_SCRAP, env["user"])

    # Warehouse: 10 (seed) + 2 restocked = 12.
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("12")
    # Quarantine drained.
    assert StockService.get_stock_for_location(product, quarantine) == Decimal("0")
    # LOSS holds the scrapped unit.
    loss = Location.objects.get(company=env["company"], type=constants.LOCATION_TYPE_LOSS)
    incoming_loss = Movement.objects.filter(
        product_model=product, to_location=loss,
    ).count()
    assert incoming_loss == 1

    rma.refresh_from_db()
    assert rma.status == constants.RMA_STATUS_RESOLVED


def test_customer_return_to_supplier(env):
    product = env["product"]
    stock_in(env, product, Decimal("4"))
    rma = make_customer_rma(env, [(product, Decimal("2"))])
    RmaService.receive(rma, env["user"])

    line = rma.lines.first()
    # A customer return carries no supplier; the RETURN_TO_SUPPLIER resolution
    # attributes one explicitly.
    RmaService.resolve_line(
        line, constants.RMA_RESOLUTION_RETURN_TO_SUPPLIER, env["user"], supplier=env["supplier"],
    )

    vendor = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_VENDOR)
    mv = Movement.objects.filter(product_model=product, to_location=vendor).order_by('-occurred_at').first()
    assert mv is not None
    assert mv.supplier_id == env["supplier"].id

    quarantine = RmaService.quarantine_location(env["company"])
    assert StockService.get_stock_for_location(product, quarantine) == Decimal("0")
    rma.refresh_from_db()
    assert rma.status == constants.RMA_STATUS_RESOLVED


# ── SERIALIZED RETURNED → ACTIVE on restock ──────────────────────────


def test_serialized_returned_to_active_on_restock(env):
    product = make_serialized_product(env["company"])
    # An item that was shipped out and is now flagged RETURNED, sitting nowhere
    # sellable (location left at vendor virtual). Customer brings it back.
    vendor = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_CUSTOMER)
    pp = PhysicalProduct.objects.create(
        product_model=product, identifier="SN-001", status="RETURNED", location=vendor,
    )
    rma = make_customer_rma(env, [(product, Decimal("1"), pp)])
    RmaService.receive(rma, env["user"])

    pp.refresh_from_db()
    quarantine = RmaService.quarantine_location(env["company"])
    assert pp.status == "ACTIVE"
    assert pp.location_id == quarantine.id

    line = rma.lines.first()
    RmaService.resolve_line(line, constants.RMA_RESOLUTION_RESTOCK, env["user"])
    pp.refresh_from_db()
    assert pp.status == "ACTIVE"
    assert pp.location_id == env["warehouse"].id
    # Counts as 1 sellable serialized unit in the warehouse.
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("1")


# ── Supplier return (direct) ─────────────────────────────────────────


def test_supplier_return_ships_from_warehouse(env):
    product = env["product"]
    stock_in(env, product, Decimal("6"))
    rma = ReturnOrder.objects.create(
        company=env["company"], kind=constants.RMA_KIND_SUPPLIER_RETURN,
        supplier=env["supplier"], number=RmaService.next_number(env["company"]),
        created_by=env["user"],
    )
    ReturnOrderLine.objects.create(return_order=rma, product_model=product, quantity=Decimal("2"))

    RmaService.ship_supplier_return(rma, env["user"], location=env["warehouse"])

    # Warehouse drained by 2.
    assert StockService.get_stock_for_location(product, env["warehouse"]) == Decimal("4")
    vendor = CounterpartyService.resolve(env["company"], constants.COUNTERPARTY_VENDOR)
    mv = Movement.objects.filter(
        product_model=product, from_location=env["warehouse"], to_location=vendor,
    ).first()
    assert mv is not None
    assert mv.supplier_id == env["supplier"].id
    rma.refresh_from_db()
    assert rma.status == constants.RMA_STATUS_RESOLVED


# ── Double resolve forbidden ─────────────────────────────────────────


def test_double_resolve_forbidden(env):
    product = env["product"]
    stock_in(env, product, Decimal("3"))
    rma = make_customer_rma(env, [(product, Decimal("1"))])
    RmaService.receive(rma, env["user"])
    line = rma.lines.first()
    RmaService.resolve_line(line, constants.RMA_RESOLUTION_RESTOCK, env["user"])

    with pytest.raises(InventoryError):
        RmaService.resolve_line(line, constants.RMA_RESOLUTION_SCRAP, env["user"])


def test_cannot_resolve_before_receive(env):
    product = env["product"]
    rma = make_customer_rma(env, [(product, Decimal("1"))])
    line = rma.lines.first()
    with pytest.raises(InventoryError):
        RmaService.resolve_line(line, constants.RMA_RESOLUTION_RESTOCK, env["user"])


# ── Cross-company isolation ──────────────────────────────────────────


def test_cross_company_quarantine_isolation(db):
    from .helpers import make_company
    company_a, user_a, _ = make_company("A")
    company_b, user_b, _ = make_company("B")
    Location.objects.create(company=company_a, name="WH-A", type="WAREHOUSE")
    Location.objects.create(company=company_b, name="WH-B", type="WAREHOUSE")
    cust_a = Customer.objects.create(company=company_a, name="Cust A")
    prod_a = make_simple_product(company_a)

    vendor_a = CounterpartyService.resolve(company_a, constants.COUNTERPARTY_VENDOR)
    LedgerService.transfer_stock(
        product_model=prod_a, from_location=vendor_a,
        to_location=Location.objects.get(company=company_a, name="WH-A"),
        quantity=Decimal("5"), user=user_a, reason="seed",
    )

    rma_a = ReturnOrder.objects.create(
        company=company_a, kind=constants.RMA_KIND_CUSTOMER_RETURN, customer=cust_a,
        number=RmaService.next_number(company_a), created_by=user_a,
    )
    ReturnOrderLine.objects.create(return_order=rma_a, product_model=prod_a, quantity=Decimal("2"))
    RmaService.receive(rma_a, user_a)

    # Company B sees no quarantine for company A's product, and its own
    # quarantine location is distinct.
    q_a = RmaService.quarantine_location(company_a)
    q_b = RmaService.quarantine_location(company_b)
    assert q_a.id != q_b.id
    assert q_a.company_id == company_a.id
    assert q_b.company_id == company_b.id
    # company B has no return orders.
    assert ReturnOrder.objects.filter(company=company_b).count() == 0


# ── Costing does not explode (COSTING-06) ────────────────────────────


def test_costing_runs_through_rma_cycle(env):
    """RESTOCK is inbound at current average, SCRAP freezes COGS — the ledger
    drives CostingService automatically; just assert nothing raises."""
    product = env["product"]
    stock_in(env, product, Decimal("5"))
    rma = make_customer_rma(env, [(product, Decimal("1")), (product, Decimal("1"))])
    RmaService.receive(rma, env["user"])
    lines = list(rma.lines.all())
    RmaService.resolve_line(lines[0], constants.RMA_RESOLUTION_RESTOCK, env["user"])
    RmaService.resolve_line(lines[1], constants.RMA_RESOLUTION_SCRAP, env["user"])
    rma.refresh_from_db()
    assert rma.status == constants.RMA_STATUS_RESOLVED
