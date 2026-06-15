"""Weighted-average costing & COGS (COSTING-06).

Method under test: continuous weighted average. Movements flow through the
single choke point LedgerService.transfer_stock, which calls CostingService.

Canonical case (acceptance criterion): buy 10@5 + 10@10 → avg 7.5; sell 5 →
COGS 37.5, residual value 112.5.
"""
import threading
from decimal import Decimal

import pytest
from django.db import connection

from core.models import Company, User
from inventory.models import Location, Movement, ProductCost, ProductModel, PurchaseOrder, PurchaseOrderLine, Supplier
from inventory.services import CostingService, LedgerService
from .helpers import make_simple_product


@pytest.fixture
def env(db):
    company = Company.objects.create(name="Cost Corp", license_code="COST01")
    user = User.objects.create_user(username="cost_user", password="x", company=company)
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    vendor = Location.objects.create(company=company, name="External Vendor", type="VIRTUAL")
    loss = Location.objects.create(company=company, name="Loss", type="LOSS")
    supplier = Supplier.objects.create(company=company, name="Acme")
    product = make_simple_product(company)
    return {
        "company": company, "user": user, "warehouse": warehouse,
        "vendor": vendor, "loss": loss, "supplier": supplier, "product": product,
    }


def _receive(env, qty, unit_cost):
    """Receive `qty` units at `unit_cost`/unit via a PO line so the movement
    carries purchased_cost, then route through the ledger choke point."""
    po = PurchaseOrder.objects.create(
        company=env["company"], supplier=env["supplier"], number=f"PO-{qty}-{unit_cost}",
    )
    line = PurchaseOrderLine.objects.create(
        purchase_order=po, product_model=env["product"],
        quantity_ordered=Decimal(qty), unit_cost=Decimal(unit_cost) if unit_cost is not None else None,
    )
    return LedgerService.transfer_stock(
        product_model=env["product"], from_location=env["vendor"],
        to_location=env["warehouse"], quantity=Decimal(qty), user=env["user"],
        reason="receipt", purchase_order_line=line if unit_cost is not None else None,
    )


def _ship(env, qty, to=None):
    return LedgerService.transfer_stock(
        product_model=env["product"], from_location=env["warehouse"],
        to_location=to or env["vendor"], quantity=Decimal(qty), user=env["user"],
        reason="ship",
    )


# ── Canonical acceptance case ───────────────────────────────────────


def test_weighted_average_canonical(env):
    """10@5 + 10@10 → avg 7.5; sell 5 → COGS 37.5; residual value 112.5."""
    _receive(env, 10, "5")
    _receive(env, 10, "10")

    state = ProductCost.objects.get(product_model=env["product"])
    assert state.avg_unit_cost == Decimal("7.5000")
    assert state.valued_qty == Decimal("20.0000")

    out = _ship(env, 5)
    out.refresh_from_db()
    assert out.cogs_unit_cost == Decimal("7.5000")
    # COGS = 5 * 7.5 = 37.5
    assert (out.cogs_unit_cost * out.quantity) == Decimal("37.5000")

    state.refresh_from_db()
    # Residual: 15 units @ 7.5 = 112.5
    assert state.valued_qty == Decimal("15.0000")
    assert state.stock_value == Decimal("112.5000")


# ── Inbound without cost does not dilute ────────────────────────────


def test_inbound_without_cost_does_not_dilute(env):
    _receive(env, 10, "5")  # avg 5
    _receive(env, 10, None)  # no cost: qty in at current avg, no dilution

    state = ProductCost.objects.get(product_model=env["product"])
    assert state.avg_unit_cost == Decimal("5.0000")
    assert state.valued_qty == Decimal("20.0000")
    assert state.stock_value == Decimal("100.0000")


# ── Internal physical→physical transfer: no cost effect ─────────────


def test_internal_transfer_no_effect(env):
    _receive(env, 10, "5")
    store = Location.objects.create(company=env["company"], name="Store", type="STORE")
    mv = LedgerService.transfer_stock(
        product_model=env["product"], from_location=env["warehouse"],
        to_location=store, quantity=Decimal("4"), user=env["user"], reason="move",
    )
    mv.refresh_from_db()
    assert mv.cogs_unit_cost is None  # not an outbound to a sink
    state = ProductCost.objects.get(product_model=env["product"])
    assert state.avg_unit_cost == Decimal("5.0000")
    assert state.valued_qty == Decimal("10.0000")


# ── Outbound to LOSS sink books COGS ────────────────────────────────


def test_outbound_to_loss_books_cogs(env):
    _receive(env, 10, "5")
    out = _ship(env, 3, to=env["loss"])
    out.refresh_from_db()
    assert out.cogs_unit_cost == Decimal("5.0000")
    state = ProductCost.objects.get(product_model=env["product"])
    assert state.valued_qty == Decimal("7.0000")


# ── rebuild_costs replay == incremental state ───────────────────────


def test_rebuild_costs_matches_incremental(env):
    _receive(env, 10, "5")
    _receive(env, 10, "10")
    _ship(env, 5)
    _receive(env, 4, "20")

    incr = ProductCost.objects.get(product_model=env["product"])
    incr_avg, incr_qty = incr.avg_unit_cost, incr.valued_qty

    # Wipe and rebuild from the ledger.
    ProductCost.objects.all().delete()
    from django.core.management import call_command
    call_command("rebuild_costs", company=str(env["company"].id), verbosity=0)

    rebuilt = ProductCost.objects.get(product_model=env["product"])
    assert rebuilt.avg_unit_cost == incr_avg
    assert rebuilt.valued_qty == incr_qty


def test_rebuild_restamps_cogs(env):
    _receive(env, 10, "5")
    out = _ship(env, 5)
    # Clear the stamped COGS to prove rebuild re-derives it.
    Movement.objects.filter(pk=out.pk).update(cogs_unit_cost=None)

    from django.core.management import call_command
    call_command("rebuild_costs", company=str(env["company"].id), verbosity=0)

    out.refresh_from_db()
    assert out.cogs_unit_cost == Decimal("5.0000")


# ── Negative stock clamps valued_qty ≥ 0 ────────────────────────────


def test_negative_stock_clamps_valued_qty(env):
    _receive(env, 5, "5")
    # Ship more than on hand is blocked by stock validation, so drive the
    # clamp through the service directly on an outbound movement.
    out = Movement.objects.create(
        product_model=env["product"], from_location=env["warehouse"],
        to_location=env["vendor"], quantity=Decimal("99"), performed_by=env["user"],
        reason="oversell",
    )
    CostingService.on_outbound(out)
    state = ProductCost.objects.get(product_model=env["product"])
    assert state.valued_qty == Decimal("0.0000")  # clamped, not negative


# ── Concurrency: costing runs inside the per-product lock ────────────


@pytest.mark.django_db(transaction=True)
def test_concurrent_receipts_serialize():
    """Two concurrent receipts must not lose an update on the running average.

    Each thread receives 10@10 starting from 10@5. The per-product lock (held
    across CostingService inside transfer_stock's atomic block) must serialize
    them so the final state reflects all three receipts: 30 units, avg
    (10*5 + 10*10 + 10*10)/30 = 8.3333.

    Uses transaction=True so threads on separate connections see committed data.
    """
    if connection.vendor != "postgresql":
        pytest.skip("row-level locking requires postgres")

    company = Company.objects.create(name="Conc Corp", license_code="CONC01")
    user = User.objects.create_user(username="conc_user", password="x", company=company)
    warehouse = Location.objects.create(company=company, name="WH", type="WAREHOUSE")
    vendor = Location.objects.create(company=company, name="External Vendor", type="VIRTUAL")
    supplier = Supplier.objects.create(company=company, name="Acme")
    product = make_simple_product(company)

    def receive(qty, unit_cost, tag):
        po = PurchaseOrder.objects.create(company=company, supplier=supplier, number=f"PO-{tag}")
        line = PurchaseOrderLine.objects.create(
            purchase_order=po, product_model=product,
            quantity_ordered=Decimal(qty), unit_cost=Decimal(unit_cost),
        )
        LedgerService.transfer_stock(
            product_model=product, from_location=vendor, to_location=warehouse,
            quantity=Decimal(qty), user=user, reason="receipt", purchase_order_line=line,
        )

    receive(10, "5", "seed")

    barrier = threading.Barrier(2)
    errors = []

    def worker(tag):
        from django.db import connections
        try:
            barrier.wait()
            receive(10, "10", tag)
        except Exception as e:  # pragma: no cover - surfaced via assert
            errors.append(e)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=worker, args=(f"t{i}",)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    try:
        assert not errors, errors
        state = ProductCost.objects.get(product_model=product)
        assert state.valued_qty == Decimal("30.0000")
        # (10*5 + 10*10 + 10*10) / 30 = 250/30 = 8.3333
        assert state.avg_unit_cost == Decimal("8.3333")
    finally:
        # transaction=True does not roll back; clean up explicitly.
        Movement.objects.filter(product_model=product).delete()
        ProductCost.objects.filter(product_model=product).delete()
        PurchaseOrderLine.objects.filter(product_model=product).delete()
        PurchaseOrder.objects.filter(company=company).delete()
        product.delete()
        Location.objects.filter(company=company).delete()
        Supplier.objects.filter(company=company).delete()
        user.delete()
        company.delete()
