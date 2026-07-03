"""Purchase orders (PURCHASE-ORDERS-03): order → confirm → receive lifecycle.

Receiving generates Movements through LedgerService only; the ledger itself is
unchanged. Covers the full cycle with partials, over-receipt blocking, the
residual guarantee under repeated receipts, cross-company isolation, and the
profile-specific receive paths (BATCH, SERIALIZED, ASSEMBLED-with-BOM).
"""

import pytest
from decimal import Decimal

from rest_framework.test import APIClient

from core.models import Company, User
from inventory.models import (
    Location,
    Movement,
    PhysicalProduct,
    ProductBatch,
    ProductComponent,
    PurchaseOrder,
    PurchaseOrderLine,
    Supplier,
)
from inventory.services import PurchasingService, StockService
from inventory.exceptions import InventoryError
from .helpers import (
    make_assembled_product,
    make_batch_product,
    make_serialized_product,
    make_simple_product,
)


@pytest.fixture
def env(db):
    company = Company.objects.create(name="PO Corp", license_code="PO0001")
    user = User.objects.create_user(username="po_user", password="x", company=company)
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    supplier = Supplier.objects.create(company=company, name="Acme Forniture")
    product = make_simple_product(company)
    return {
        "company": company,
        "user": user,
        "warehouse": warehouse,
        "supplier": supplier,
        "product": product,
    }


def make_po(env, lines=None, product=None, qty=Decimal("100"), unit_cost=Decimal("2.50")):
    po = PurchaseOrder.objects.create(
        company=env["company"],
        supplier=env["supplier"],
        number=PurchasingService.next_number(env["company"]),
        created_by=env["user"],
    )
    if lines is None:
        lines = [(product or env["product"], qty, unit_cost)]
    for product_model, quantity, cost in lines:
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            product_model=product_model,
            quantity_ordered=quantity,
            unit_cost=cost,
        )
    return po


# ── Numbering ────────────────────────────────────────────────────────


def test_numbers_are_sequential_per_company(env):
    po1 = make_po(env)
    po2 = make_po(env, lines=[(make_simple_product(env["company"]), Decimal("1"), None)])
    year_prefix = po1.number.rsplit("-", 1)[0]
    assert po1.number.startswith("PO-")
    assert po2.number == f"{year_prefix}-{int(po1.number.rsplit('-', 1)[1]) + 1:04d}"

    other_company = Company.objects.create(name="Other", license_code="PO0002")
    other_supplier = Supplier.objects.create(company=other_company, name="Other Supplier")
    other_po = PurchaseOrder.objects.create(
        company=other_company,
        supplier=other_supplier,
        number=PurchasingService.next_number(other_company),
    )
    # Each company has its own progressive
    assert other_po.number == po1.number


# ── Lifecycle ────────────────────────────────────────────────────────


def test_full_cycle_partial_then_complete(env):
    """PO 100 pezzi: ricevo 60 poi 40 → due Movement, stato passa per
    PARTIALLY_RECEIVED, residuo 0 (criterio di accettazione)."""
    po = make_po(env, qty=Decimal("100"))
    PurchasingService.confirm(po)
    po.refresh_from_db()
    assert po.status == "CONFIRMED"

    line = po.lines.first()

    moves1 = PurchasingService.receive(
        po,
        [{"line_id": str(line.id), "quantity": "60"}],
        env["warehouse"],
        env["user"],
    )
    po.refresh_from_db()
    line.refresh_from_db()
    assert po.status == "PARTIALLY_RECEIVED"
    assert line.quantity_received == Decimal("60")
    assert line.quantity_pending == Decimal("40")

    moves2 = PurchasingService.receive(
        po,
        [{"line_id": str(line.id), "quantity": "40"}],
        env["warehouse"],
        env["user"],
    )
    po.refresh_from_db()
    line.refresh_from_db()
    assert po.status == "RECEIVED"
    assert line.quantity_pending == Decimal("0")

    movements = Movement.objects.filter(purchase_order_line=line).order_by("occurred_at")
    assert movements.count() == 2
    assert len(moves1) == 1 and len(moves2) == 1
    for m in movements:
        assert m.supplier == env["supplier"]
        assert m.purchased_cost == Decimal("2.50")
        assert m.reason == f"PO {po.number}"
    assert StockService.get_stock_for_location(env["product"], env["warehouse"]) == Decimal("100")


def test_over_receipt_blocked(env):
    po = make_po(env, qty=Decimal("10"))
    PurchasingService.confirm(po)
    line = po.lines.first()

    with pytest.raises(InventoryError, match="exceeds the remaining"):
        PurchasingService.receive(
            po,
            [{"line_id": str(line.id), "quantity": "11"}],
            env["warehouse"],
            env["user"],
        )
    line.refresh_from_db()
    assert line.quantity_received == Decimal("0")
    # No stock and no movement leaked from the rolled-back receipt
    assert Movement.objects.filter(purchase_order_line=line).count() == 0

    # Explicit flag allows over-receipt
    PurchasingService.receive(
        po,
        [{"line_id": str(line.id), "quantity": "11"}],
        env["warehouse"],
        env["user"],
        allow_over=True,
    )
    line.refresh_from_db()
    assert line.quantity_received == Decimal("11")


def test_repeated_receipts_never_exceed_ordered(env):
    """Lock guarantee, verified sequentially (pattern of
    test_concurrent_transactions.py: logical guarantees without threads):
    receipts consume the residual and the next over-ask fails."""
    po = make_po(env, qty=Decimal("10"))
    PurchasingService.confirm(po)
    line = po.lines.first()

    for _ in range(2):
        PurchasingService.receive(
            po,
            [{"line_id": str(line.id), "quantity": "5"}],
            env["warehouse"],
            env["user"],
        )
    line.refresh_from_db()
    assert line.quantity_received == Decimal("10")

    with pytest.raises(InventoryError):
        PurchasingService.receive(
            po,
            [{"line_id": str(line.id), "quantity": "1"}],
            env["warehouse"],
            env["user"],
        )
    line.refresh_from_db()
    assert line.quantity_received == Decimal("10")
    assert StockService.get_stock_for_location(env["product"], env["warehouse"]) == Decimal("10")


def test_receive_requires_confirmed(env):
    po = make_po(env)
    line = po.lines.first()
    with pytest.raises(InventoryError, match="not receivable"):
        PurchasingService.receive(
            po,
            [{"line_id": str(line.id), "quantity": "1"}],
            env["warehouse"],
            env["user"],
        )


def test_confirm_requires_lines(env):
    po = PurchaseOrder.objects.create(
        company=env["company"],
        supplier=env["supplier"],
        number=PurchasingService.next_number(env["company"]),
    )
    with pytest.raises(InventoryError, match="without lines"):
        PurchasingService.confirm(po)


def test_cancel_only_without_receipts(env):
    po = make_po(env, qty=Decimal("10"))
    PurchasingService.confirm(po)
    line = po.lines.first()
    PurchasingService.receive(
        po,
        [{"line_id": str(line.id), "quantity": "1"}],
        env["warehouse"],
        env["user"],
    )
    # Receipts moved it to PARTIALLY_RECEIVED, which is not cancellable
    with pytest.raises(InventoryError, match="cancelled"):
        PurchasingService.cancel(po)

    po2 = make_po(env, lines=[(make_simple_product(env["company"]), Decimal("5"), None)])
    PurchasingService.cancel(po2)
    po2.refresh_from_db()
    assert po2.status == "CANCELLED"


# ── Profile-specific receive paths ───────────────────────────────────


def test_batch_receive_creates_batch(env):
    product = make_batch_product(env["company"])
    po = make_po(env, lines=[(product, Decimal("30"), Decimal("1.10"))])
    PurchasingService.confirm(po)
    line = po.lines.first()

    PurchasingService.receive(
        po,
        [
            {
                "line_id": str(line.id),
                "quantity": "30",
                "batch_data": {"batch_identifier": "LOT-77"},
                "expiry_date": "2027-01-31",
            }
        ],
        env["warehouse"],
        env["user"],
    )

    batch = ProductBatch.objects.get(product_model=product, batch_identifier="LOT-77")
    assert batch.quantity == Decimal("30")
    assert batch.location == env["warehouse"]
    assert batch.data.get("expiry_date") == "2027-01-31"
    movement = Movement.objects.get(purchase_order_line=line)
    assert movement.batch == batch
    assert movement.purchased_cost == Decimal("1.10")


def test_serialized_receive_creates_physical_products(env):
    product = make_serialized_product(env["company"])
    po = make_po(env, lines=[(product, Decimal("3"), Decimal("99.00"))])
    PurchasingService.confirm(po)
    line = po.lines.first()

    PurchasingService.receive(
        po,
        [{"line_id": str(line.id), "quantity": "2", "serials": ["SN-1", "SN-2"]}],
        env["warehouse"],
        env["user"],
    )

    items = PhysicalProduct.objects.filter(product_model=product).order_by("identifier")
    assert [i.identifier for i in items] == ["SN-1", "SN-2"]
    assert all(i.location == env["warehouse"] and i.status == "ACTIVE" for i in items)
    # One movement per serial, each stamped with cost + line
    movements = Movement.objects.filter(purchase_order_line=line)
    assert movements.count() == 2
    assert all(m.purchased_cost == Decimal("99.00") for m in movements)
    line.refresh_from_db()
    assert line.quantity_received == Decimal("2")
    po.refresh_from_db()
    assert po.status == "PARTIALLY_RECEIVED"


def test_serialized_receive_requires_matching_serials(env):
    product = make_serialized_product(env["company"])
    po = make_po(env, lines=[(product, Decimal("3"), None)])
    PurchasingService.confirm(po)
    line = po.lines.first()

    with pytest.raises(InventoryError, match="one serial per unit"):
        PurchasingService.receive(
            po,
            [{"line_id": str(line.id), "quantity": "2", "serials": ["SN-9"]}],
            env["warehouse"],
            env["user"],
        )
    assert PhysicalProduct.objects.filter(product_model=product).count() == 0


def test_assembled_with_bom_receive_passes_with_source_document(env):
    """Buying finished kits is legitimate: receive passes VIRTUAL→warehouse
    without a work order because source_document == 'PURCHASE'."""
    kit = make_assembled_product(env["company"])
    component = make_simple_product(env["company"])
    ProductComponent.objects.create(parent=kit, child=component, quantity=2)

    po = make_po(env, lines=[(kit, Decimal("5"), Decimal("20.00"))])
    PurchasingService.confirm(po)
    line = po.lines.first()

    PurchasingService.receive(
        po,
        [{"line_id": str(line.id), "quantity": "5"}],
        env["warehouse"],
        env["user"],
    )
    assert StockService.get_stock_for_location(kit, env["warehouse"]) == Decimal("5")
    # Component stock untouched: the kit was bought, not produced
    assert StockService.get_stock_for_location(component, env["warehouse"]) == Decimal("0")


# ── API ──────────────────────────────────────────────────────────────


@pytest.fixture
def api(env):
    client = APIClient()
    client.force_authenticate(user=env["user"])
    return client


def test_api_full_cycle(env, api):
    # Create DRAFT with nested lines
    resp = api.post(
        "/api/v1/purchase-orders/",
        {
            "supplier_id": str(env["supplier"].id),
            "notes": "test order",
            "lines": [
                {
                    "product_model_id": str(env["product"].id),
                    "quantity_ordered": "100",
                    "unit_cost": "2.50",
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    po_id = resp.data["id"]
    assert resp.data["status"] == "DRAFT"
    assert resp.data["number"].startswith("PO-")
    line_id = resp.data["lines"][0]["id"]

    # Confirm
    resp = api.post(f"/api/v1/purchase-orders/{po_id}/confirm/")
    assert resp.status_code == 200
    assert resp.data["status"] == "CONFIRMED"

    # Editing a confirmed order is rejected
    resp = api.patch(f"/api/v1/purchase-orders/{po_id}/", {"notes": "nope"}, format="json")
    assert resp.status_code == 400

    # Receive partial
    resp = api.post(
        f"/api/v1/purchase-orders/{po_id}/receive/",
        {
            "location_id": str(env["warehouse"].id),
            "receipts": [{"line_id": line_id, "quantity": "60"}],
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.data["status"] == "PARTIALLY_RECEIVED"
    assert len(resp.data["movement_ids"]) == 1

    # Receive the rest
    resp = api.post(
        f"/api/v1/purchase-orders/{po_id}/receive/",
        {
            "location_id": str(env["warehouse"].id),
            "receipts": [{"line_id": line_id, "quantity": "40"}],
        },
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["status"] == "RECEIVED"

    # Over-receipt via API is blocked
    resp = api.post(
        f"/api/v1/purchase-orders/{po_id}/receive/",
        {
            "location_id": str(env["warehouse"].id),
            "receipts": [{"line_id": line_id, "quantity": "1"}],
        },
        format="json",
    )
    assert resp.status_code == 400


def test_api_cancel_and_delete_rules(env, api):
    po = make_po(env)
    # DRAFT can be cancelled
    resp = api.post(f"/api/v1/purchase-orders/{po.id}/cancel/")
    assert resp.status_code == 200
    assert resp.data["status"] == "CANCELLED"
    # CANCELLED cannot be deleted (only DRAFT)
    resp = api.delete(f"/api/v1/purchase-orders/{po.id}/")
    assert resp.status_code == 400

    po2 = make_po(env, lines=[(make_simple_product(env["company"]), Decimal("1"), None)])
    resp = api.delete(f"/api/v1/purchase-orders/{po2.id}/")
    assert resp.status_code == 204
    assert not PurchaseOrder.objects.filter(id=po2.id).exists()


def test_api_cross_company_isolation(env, api):
    other_company = Company.objects.create(name="Rival", license_code="PO0003")
    other_user = User.objects.create_user(username="rival", password="x", company=other_company)
    po = make_po(env)

    rival = APIClient()
    rival.force_authenticate(user=other_user)
    resp = rival.get(f"/api/v1/purchase-orders/{po.id}/")
    assert resp.status_code == 404
    resp = rival.post(f"/api/v1/purchase-orders/{po.id}/confirm/")
    assert resp.status_code == 404
    resp = rival.get("/api/v1/purchase-orders/")
    assert resp.data["count"] == 0 if "count" in resp.data else len(resp.data) == 0

    # Foreign supplier/product are rejected at validation
    resp = api.post(
        "/api/v1/purchase-orders/",
        {
            "supplier_id": str(Supplier.objects.create(company=other_company, name="Foreign").id),
            "lines": [{"product_model_id": str(env["product"].id), "quantity_ordered": "1"}],
        },
        format="json",
    )
    assert resp.status_code == 400


def test_api_create_rejects_empty_lines(env, api):
    resp = api.post(
        "/api/v1/purchase-orders/",
        {
            "supplier_id": str(env["supplier"].id),
            "lines": [],
        },
        format="json",
    )
    assert resp.status_code == 400
