"""Tests for POST /api/v1/<resource>/bulk-delete/ across viewsets."""

import uuid
from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from inventory.models import (
    CalculatorTemplate,
    Location,
    Movement,
    PhysicalProduct,
    ProductBatch,
    ProductModel,
    Supplier,
    WorkOrder,
)
from inventory.services import LedgerService
from inventory.tests.helpers import make_company_full


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def env(db):
    company, user, _ = make_company_full("BulkA")
    client = APIClient()
    client.force_authenticate(user=user)
    return {
        "company": company,
        "user": user,
        "client": client,
        "warehouse": Location.objects.get(company=company, name="Main Warehouse"),
        "vendor": Location.objects.get(company=company, name="External Vendor"),
    }


@pytest.fixture
def other_env(db):
    company, user, _ = make_company_full("BulkB")
    client = APIClient()
    client.force_authenticate(user=user)
    return {
        "company": company,
        "user": user,
        "client": client,
        "warehouse": Location.objects.get(company=company, name="Main Warehouse"),
        "vendor": Location.objects.get(company=company, name="External Vendor"),
    }


def _make_simple_product(company, sku):
    return ProductModel.objects.create(company=company, sku=sku, name=f"P-{sku}")


def _seed_movement(env, product):
    LedgerService.transfer_stock(
        product_model=product,
        from_location=env["vendor"],
        to_location=env["warehouse"],
        quantity=Decimal("3"),
        user=env["user"],
        reason="seed",
    )


# ── Payload validation ────────────────────────────────────────────────


def test_bulk_delete_missing_ids_returns_409(env):
    resp = env["client"].post("/api/v1/product-models/bulk-delete/", {}, format="json")
    assert resp.status_code == status.HTTP_409_CONFLICT
    assert "ids" in resp.json()["detail"].lower()


def test_bulk_delete_empty_ids_returns_409(env):
    resp = env["client"].post("/api/v1/product-models/bulk-delete/", {"ids": []}, format="json")
    assert resp.status_code == status.HTTP_409_CONFLICT


def test_bulk_delete_too_many_ids_returns_409(env):
    big = [str(uuid.uuid4()) for _ in range(501)]
    resp = env["client"].post("/api/v1/product-models/bulk-delete/", {"ids": big}, format="json")
    assert resp.status_code == status.HTTP_409_CONFLICT
    assert "500" in resp.json()["detail"]


def test_bulk_delete_invalid_uuid_returns_409(env):
    resp = env["client"].post(
        "/api/v1/product-models/bulk-delete/",
        {"ids": ["not-a-uuid"]},
        format="json",
    )
    assert resp.status_code == status.HTTP_409_CONFLICT


# ── ProductModel ──────────────────────────────────────────────────────


def test_bulk_delete_products_preserves_movements(env):
    p1 = _make_simple_product(env["company"], "SKU-1")
    p2 = _make_simple_product(env["company"], "SKU-2")
    _seed_movement(env, p1)
    _seed_movement(env, p2)

    assert Movement.objects.filter(product_model__in=[p1, p2]).count() == 2

    resp = env["client"].post(
        "/api/v1/product-models/bulk-delete/",
        {"ids": [str(p1.id), str(p2.id)], "preserve_movements": True},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["deleted"] == 2
    assert body["preserved_movements"] == 2

    assert not ProductModel.objects.filter(id__in=[p1.id, p2.id]).exists()
    assert Movement.objects.filter(product_model__isnull=True).count() == 2


def test_bulk_delete_products_no_preserve_drops_movements(env):
    p = _make_simple_product(env["company"], "SKU-X")
    _seed_movement(env, p)

    resp = env["client"].post(
        "/api/v1/product-models/bulk-delete/",
        {"ids": [str(p.id)], "preserve_movements": False},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["deleted"] == 1
    assert body["preserved_movements"] == 0
    assert Movement.objects.count() == 0


def test_bulk_delete_products_tenant_isolation(env, other_env):
    mine = _make_simple_product(env["company"], "SKU-MINE")
    theirs = _make_simple_product(other_env["company"], "SKU-THEIRS")

    resp = env["client"].post(
        "/api/v1/product-models/bulk-delete/",
        {"ids": [str(mine.id), str(theirs.id)]},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["deleted"] == 1  # only mine
    assert not ProductModel.objects.filter(id=mine.id).exists()
    assert ProductModel.objects.filter(id=theirs.id).exists()


def test_bulk_delete_products_response_shape(env):
    p = _make_simple_product(env["company"], "SKU-SHAPE")
    resp = env["client"].post(
        "/api/v1/product-models/bulk-delete/",
        {"ids": [str(p.id)]},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert set(body.keys()) == {"deleted", "preserved_movements"}


# ── PhysicalProduct ──────────────────────────────────────────────────


def _make_serialized_product_with_item(env, identifier="ASSET-1"):
    from inventory.constants import PROFILE_SERIALIZED

    product = ProductModel.objects.create(
        company=env["company"],
        profile=PROFILE_SERIALIZED,
        sku=f"SER-{identifier}",
        name=f"S-{identifier}",
    )
    item = PhysicalProduct.objects.create(
        product_model=product,
        identifier=identifier,
        location=env["warehouse"],
    )
    Movement.objects.create(
        product_model=product,
        physical_product=item,
        from_location=env["vendor"],
        to_location=env["warehouse"],
        quantity=Decimal("1"),
        performed_by=env["user"],
        reason="seed serial",
    )
    return product, item


def test_bulk_delete_physical_products_preserves_movements(env):
    _, item = _make_serialized_product_with_item(env)
    assert Movement.objects.filter(physical_product=item).count() == 1

    resp = env["client"].post(
        "/api/v1/physical-products/bulk-delete/",
        {"ids": [str(item.id)]},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["deleted"] == 1
    assert body["preserved_movements"] == 1
    assert not PhysicalProduct.objects.filter(id=item.id).exists()
    assert Movement.objects.filter(physical_product__isnull=True).count() == 1


def test_bulk_delete_physical_products_tenant_isolation(env, other_env):
    _, mine = _make_serialized_product_with_item(env, "MINE")
    _, theirs = _make_serialized_product_with_item(other_env, "THEIRS")

    resp = env["client"].post(
        "/api/v1/physical-products/bulk-delete/",
        {"ids": [str(mine.id), str(theirs.id)]},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 1
    assert not PhysicalProduct.objects.filter(id=mine.id).exists()
    assert PhysicalProduct.objects.filter(id=theirs.id).exists()


# ── Supplier ─────────────────────────────────────────────────────────


def _make_supplier_with_movement(env, name):
    supplier = Supplier.objects.create(company=env["company"], name=name)
    product = _make_simple_product(env["company"], f"SUP-{name}")
    Movement.objects.create(
        product_model=product,
        from_location=env["vendor"],
        to_location=env["warehouse"],
        quantity=Decimal("2"),
        performed_by=env["user"],
        supplier=supplier,
        reason="receipt",
    )
    return supplier


def test_bulk_delete_suppliers_preserves_movements(env):
    s = _make_supplier_with_movement(env, "Acme Supplies")

    resp = env["client"].post(
        "/api/v1/suppliers/bulk-delete/",
        {"ids": [str(s.id)]},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["deleted"] == 1
    assert body["preserved_movements"] == 1
    assert not Supplier.objects.filter(id=s.id).exists()
    assert Movement.objects.filter(supplier__isnull=True).count() == 1


def test_bulk_delete_suppliers_tenant_isolation(env, other_env):
    mine = _make_supplier_with_movement(env, "Mine Co")
    theirs = _make_supplier_with_movement(other_env, "Their Co")

    resp = env["client"].post(
        "/api/v1/suppliers/bulk-delete/",
        {"ids": [str(mine.id), str(theirs.id)]},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 1
    assert Supplier.objects.filter(id=theirs.id).exists()


# ── Location ─────────────────────────────────────────────────────────


def test_bulk_delete_location_with_movements_rejects_when_preserve(env):
    p = _make_simple_product(env["company"], "LOC-USED")
    _seed_movement(env, p)
    loc = env["warehouse"]

    resp = env["client"].post(
        "/api/v1/locations/bulk-delete/",
        {"ids": [str(loc.id)], "preserve_movements": True},
        format="json",
    )

    assert resp.status_code == status.HTTP_409_CONFLICT
    body = resp.json()
    assert body["movement_count"] == 1
    # Nothing was deleted.
    assert Location.objects.filter(id=loc.id).exists()


def test_bulk_delete_location_no_preserve_cascades_movements(env):
    p = _make_simple_product(env["company"], "LOC-WIPE")
    _seed_movement(env, p)
    loc = env["warehouse"]

    resp = env["client"].post(
        "/api/v1/locations/bulk-delete/",
        {"ids": [str(loc.id)], "preserve_movements": False},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 1
    assert not Location.objects.filter(id=loc.id).exists()
    assert Movement.objects.count() == 0


def test_bulk_delete_location_tenant_isolation(env, other_env):
    foreign_loc = other_env["warehouse"]
    # Adding it to a delete attempt from env's client must do nothing to it.
    resp = env["client"].post(
        "/api/v1/locations/bulk-delete/",
        {"ids": [str(foreign_loc.id)]},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 0
    assert Location.objects.filter(id=foreign_loc.id).exists()


# ── WorkOrder ────────────────────────────────────────────────────────


def _make_wo_with_children(env, name):
    from inventory.constants import PROFILE_SERIALIZED, PROFILE_BATCH_TRACKED

    wo = WorkOrder.objects.create(company=env["company"], name=name)
    batched = ProductModel.objects.create(
        company=env["company"],
        profile=PROFILE_BATCH_TRACKED,
        sku=f"BAT-{name}",
        name=f"BAT-{name}",
    )
    serial = ProductModel.objects.create(
        company=env["company"],
        profile=PROFILE_SERIALIZED,
        sku=f"SER-{name}",
        name=f"SER-{name}",
    )
    batch = ProductBatch.objects.create(
        product_model=batched,
        location=env["warehouse"],
        batch_identifier=f"B-{name}",
        work_order=wo,
        quantity=Decimal("5"),
    )
    pp = PhysicalProduct.objects.create(
        product_model=serial,
        identifier=f"I-{name}",
        location=env["warehouse"],
        work_order=wo,
    )
    return wo, batch, pp


def test_bulk_delete_workorder_default_keeps_children(env):
    """Default (no cascade): WO row deleted; SET_NULL preserves children."""
    wo, batch, pp = _make_wo_with_children(env, "WO-NOCAS")

    resp = env["client"].post(
        "/api/v1/work-orders/bulk-delete/",
        {"ids": [str(wo.id)]},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["deleted"] == 1
    assert body["preserved_movements"] == 0
    assert not WorkOrder.objects.filter(id=wo.id).exists()
    # Children survive — SET_NULL on work_order FK.
    batch.refresh_from_db()
    pp.refresh_from_db()
    assert batch.work_order_id is None
    assert pp.work_order_id is None


def test_bulk_delete_workorder_cascade_deletes_children(env):
    """cascade=True: assigned Batches + PhysicalProducts are wiped too."""
    wo, batch, pp = _make_wo_with_children(env, "WO-CAS")

    resp = env["client"].post(
        "/api/v1/work-orders/bulk-delete/",
        {"ids": [str(wo.id)], "cascade": True},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 1
    assert not WorkOrder.objects.filter(id=wo.id).exists()
    assert not ProductBatch.objects.filter(id=batch.id).exists()
    assert not PhysicalProduct.objects.filter(id=pp.id).exists()


def test_bulk_delete_workorder_cascade_no_preserve_drops_movements(env):
    """cascade=True + preserve_movements=False wipes child-pointed movements."""
    wo, batch, pp = _make_wo_with_children(env, "WO-CAS-NOPRES")
    Movement.objects.create(
        product_model=pp.product_model,
        physical_product=pp,
        from_location=env["vendor"],
        to_location=env["warehouse"],
        quantity=Decimal("1"),
        performed_by=env["user"],
        reason="seed serial",
    )
    Movement.objects.create(
        product_model=batch.product_model,
        batch=batch,
        from_location=env["vendor"],
        to_location=env["warehouse"],
        quantity=Decimal("3"),
        performed_by=env["user"],
        reason="seed batch",
    )

    resp = env["client"].post(
        "/api/v1/work-orders/bulk-delete/",
        {"ids": [str(wo.id)], "cascade": True, "preserve_movements": False},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["deleted"] == 1
    assert body["preserved_movements"] == 0
    assert Movement.objects.count() == 0


def test_bulk_delete_workorder_tenant_isolation(env, other_env):
    wo_other, _, _ = _make_wo_with_children(other_env, "WO-OTHER")

    resp = env["client"].post(
        "/api/v1/work-orders/bulk-delete/",
        {"ids": [str(wo_other.id)]},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 0
    assert WorkOrder.objects.filter(id=wo_other.id).exists()


# ── CalculatorTemplate ──────────────────────────────────────────────


def test_bulk_delete_calculator_template_rejects_when_assigned(env):
    tpl = CalculatorTemplate.objects.create(
        company=env["company"],
        name="Pharma",
        engine_type="bucket",
    )
    ProductModel.objects.create(
        company=env["company"],
        sku="USES-TPL",
        name="USES-TPL",
        default_calculator=tpl,
    )

    resp = env["client"].post(
        "/api/v1/calculator-templates/bulk-delete/",
        {"ids": [str(tpl.id)]},
        format="json",
    )

    assert resp.status_code == status.HTTP_409_CONFLICT
    assert resp.json()["assigned_count"] == 1
    assert CalculatorTemplate.objects.filter(id=tpl.id).exists()


def test_bulk_delete_calculator_template_force_detaches(env):
    tpl = CalculatorTemplate.objects.create(
        company=env["company"],
        name="Pharma",
        engine_type="bucket",
    )
    user_product = ProductModel.objects.create(
        company=env["company"],
        sku="FORCE-TPL",
        name="FORCE-TPL",
        default_calculator=tpl,
    )

    resp = env["client"].post(
        "/api/v1/calculator-templates/bulk-delete/",
        {"ids": [str(tpl.id)], "force": True},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 1
    assert not CalculatorTemplate.objects.filter(id=tpl.id).exists()
    user_product.refresh_from_db()
    assert user_product.default_calculator_id is None


def test_bulk_delete_calculator_template_tenant_isolation(env, other_env):
    foreign = CalculatorTemplate.objects.create(
        company=other_env["company"],
        name="ForeignTpl",
        engine_type="counter",
    )

    resp = env["client"].post(
        "/api/v1/calculator-templates/bulk-delete/",
        {"ids": [str(foreign.id)]},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 0
    assert CalculatorTemplate.objects.filter(id=foreign.id).exists()


# ── Movement ─────────────────────────────────────────────────────────


def test_bulk_delete_movement_terminal(env):
    p = _make_simple_product(env["company"], "MOV-SKU")
    _seed_movement(env, p)
    m = Movement.objects.first()

    resp = env["client"].post(
        "/api/v1/movements/bulk-delete/",
        {"ids": [str(m.id)]},
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["deleted"] == 1
    assert body["preserved_movements"] == 0
    assert Movement.objects.count() == 0


def test_bulk_delete_movement_tenant_isolation(env, other_env):
    p_other = _make_simple_product(other_env["company"], "MOV-OTHER")
    _seed_movement(other_env, p_other)
    foreign_mv = Movement.objects.filter(product_model=p_other).first()

    resp = env["client"].post(
        "/api/v1/movements/bulk-delete/",
        {"ids": [str(foreign_mv.id)]},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["deleted"] == 0
    assert Movement.objects.filter(id=foreign_mv.id).exists()


# ── Phase-05 regression: full 3-product / 15-movement fixture ──────────


def _seed_mixed_movements(env, product, count=5):
    """Create `count` Movements alternating inbound (vendor→warehouse) and
    outbound (warehouse→vendor) directions, bypassing LedgerService so the
    test only exercises the bulk-delete contract."""
    for i in range(count):
        if i % 2 == 0:
            from_loc, to_loc = env["vendor"], env["warehouse"]
        else:
            from_loc, to_loc = env["warehouse"], env["vendor"]
        Movement.objects.create(
            product_model=product,
            from_location=from_loc,
            to_location=to_loc,
            quantity=Decimal("1"),
            performed_by=env["user"],
            reason=f"seed-{i}",
        )


class TestProductModelBulkDelete:
    """End-to-end regression for the /products list bulk-delete flow.

    Three ProductModels, 5 mixed-direction Movements each (15 total). Covers
    preserve_movements toggle + foreign-tenant noop.
    """

    def test_preserve_movements_nulls_product_fk(self, env):
        pm1 = _make_simple_product(env["company"], "PM-1")
        pm2 = _make_simple_product(env["company"], "PM-2")
        pm3 = _make_simple_product(env["company"], "PM-3")
        for pm in (pm1, pm2, pm3):
            _seed_mixed_movements(env, pm, count=5)

        assert Movement.objects.count() == 15

        resp = env["client"].post(
            "/api/v1/product-models/bulk-delete/",
            {"ids": [str(pm1.id), str(pm2.id)], "preserve_movements": True},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 2
        assert body["preserved_movements"] == 10

        assert not ProductModel.objects.filter(id__in=[pm1.id, pm2.id]).exists()
        assert ProductModel.objects.filter(id=pm3.id).exists()
        # All 10 movements for the deleted products survive with FK nulled.
        assert Movement.objects.filter(product_model__isnull=True).count() == 10
        # pm3's 5 movements are untouched.
        assert Movement.objects.filter(product_model=pm3).count() == 5

    def test_no_preserve_cascades_movements(self, env):
        pm1 = _make_simple_product(env["company"], "PM-A")
        pm2 = _make_simple_product(env["company"], "PM-B")
        pm3 = _make_simple_product(env["company"], "PM-C")
        for pm in (pm1, pm2, pm3):
            _seed_mixed_movements(env, pm, count=5)

        resp = env["client"].post(
            "/api/v1/product-models/bulk-delete/",
            {"ids": [str(pm3.id)], "preserve_movements": False},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 1
        assert body["preserved_movements"] == 0

        assert not ProductModel.objects.filter(id=pm3.id).exists()
        # pm3's 5 movements deleted; pm1 + pm2 still have 5 each = 10 remain.
        assert Movement.objects.count() == 10
        assert not Movement.objects.filter(product_model=pm3).exists()

    def test_foreign_company_id_is_silently_ignored(self, env, other_env):
        foreign = _make_simple_product(other_env["company"], "PM-FOREIGN")
        _seed_mixed_movements(other_env, foreign, count=5)

        resp = env["client"].post(
            "/api/v1/product-models/bulk-delete/",
            {"ids": [str(foreign.id)], "preserve_movements": True},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 0
        assert body["preserved_movements"] == 0
        # Foreign product + its movements untouched.
        assert ProductModel.objects.filter(id=foreign.id).exists()
        assert Movement.objects.filter(product_model=foreign).count() == 5


# ── Phase-06 regression: PhysicalProduct bulk-delete with audit rows ───


def _make_serialized_item_with_history(env, identifier, transfer_count=2, audit_count=2):
    """Create a SERIALIZED item plus `transfer_count` transfer Movements and
    `audit_count` status-change audit rows (quantity=0 self-loops).

    Returns (product_model, physical_product).
    """
    from inventory.constants import PROFILE_SERIALIZED

    product = ProductModel.objects.create(
        company=env["company"],
        profile=PROFILE_SERIALIZED,
        sku=f"SER-{identifier}",
        name=f"S-{identifier}",
    )
    item = PhysicalProduct.objects.create(
        product_model=product,
        identifier=identifier,
        location=env["warehouse"],
    )
    for i in range(transfer_count):
        if i % 2 == 0:
            from_loc, to_loc = env["vendor"], env["warehouse"]
        else:
            from_loc, to_loc = env["warehouse"], env["vendor"]
        Movement.objects.create(
            product_model=product,
            physical_product=item,
            from_location=from_loc,
            to_location=to_loc,
            quantity=Decimal("1"),
            performed_by=env["user"],
            reason=f"transfer-{i}",
        )
    for i in range(audit_count):
        # Status-change audit: self-loop at quantity 0.
        Movement.objects.create(
            product_model=product,
            physical_product=item,
            from_location=env["warehouse"],
            to_location=env["warehouse"],
            quantity=Decimal("0"),
            performed_by=env["user"],
            reason=f"status-change-{i}",
        )
    return product, item


class TestPhysicalProductBulkDelete:
    """End-to-end regression for the /stock list bulk-delete flow.

    Three SERIALIZED PhysicalProducts, each with 2 transfer Movements +
    2 status-change audit rows (4 each, 12 total). Covers preserve_movements
    toggle so audit history survives item deletion when desired.
    """

    def test_preserve_movements_keeps_audit_rows(self, env):
        _, i1 = _make_serialized_item_with_history(env, "PP-1")
        _, i2 = _make_serialized_item_with_history(env, "PP-2")
        _, i3 = _make_serialized_item_with_history(env, "PP-3")

        assert Movement.objects.count() == 12
        assert Movement.objects.filter(quantity=0).count() == 6

        resp = env["client"].post(
            "/api/v1/physical-products/bulk-delete/",
            {"ids": [str(i1.id), str(i2.id)], "preserve_movements": True},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 2
        assert body["preserved_movements"] == 8

        assert not PhysicalProduct.objects.filter(id__in=[i1.id, i2.id]).exists()
        assert PhysicalProduct.objects.filter(id=i3.id).exists()

        # 8 movements (4 per deleted item) survive with physical_product nulled,
        # including the 4 status-change audit rows (quantity=0).
        assert Movement.objects.filter(physical_product__isnull=True).count() == 8
        assert (
            Movement.objects.filter(
                physical_product__isnull=True,
                quantity=0,
            ).count()
            == 4
        )
        # i3's 4 movements are untouched.
        assert Movement.objects.filter(physical_product=i3).count() == 4

    def test_no_preserve_cascades_movements(self, env):
        _, i1 = _make_serialized_item_with_history(env, "PP-A")
        _, i2 = _make_serialized_item_with_history(env, "PP-B")
        _, i3 = _make_serialized_item_with_history(env, "PP-C")

        resp = env["client"].post(
            "/api/v1/physical-products/bulk-delete/",
            {"ids": [str(i3.id)], "preserve_movements": False},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 1
        assert body["preserved_movements"] == 0

        assert not PhysicalProduct.objects.filter(id=i3.id).exists()
        # i3's 4 movements (transfers + audits) deleted; i1 + i2 keep 4 each = 8.
        assert Movement.objects.count() == 8
        assert not Movement.objects.filter(physical_product=i3).exists()
        assert Movement.objects.filter(physical_product=i1).count() == 4
        assert Movement.objects.filter(physical_product=i2).count() == 4


# ── Phase-07 regression: per-resource bulk-delete classes ─────────────


class TestSupplierBulkDelete:
    """Three Suppliers, each with movement history. Covers preserve toggle
    + tenant isolation under multi-row selection."""

    def test_preserve_movements_nulls_supplier_fk(self, env):
        s1 = _make_supplier_with_movement(env, "Sup-1")
        s2 = _make_supplier_with_movement(env, "Sup-2")
        s3 = _make_supplier_with_movement(env, "Sup-3")

        assert Movement.objects.filter(supplier__isnull=False).count() == 3

        resp = env["client"].post(
            "/api/v1/suppliers/bulk-delete/",
            {"ids": [str(s1.id), str(s2.id)], "preserve_movements": True},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 2
        assert body["preserved_movements"] == 2

        assert not Supplier.objects.filter(id__in=[s1.id, s2.id]).exists()
        assert Supplier.objects.filter(id=s3.id).exists()
        # 2 movements survive with supplier nulled; s3's row untouched.
        assert Movement.objects.filter(supplier__isnull=True).count() == 2
        assert Movement.objects.filter(supplier=s3).count() == 1

    def test_no_preserve_cascades_supplier_movements(self, env):
        s1 = _make_supplier_with_movement(env, "Sup-A")
        s2 = _make_supplier_with_movement(env, "Sup-B")
        s3 = _make_supplier_with_movement(env, "Sup-C")

        resp = env["client"].post(
            "/api/v1/suppliers/bulk-delete/",
            {"ids": [str(s1.id), str(s3.id)], "preserve_movements": False},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 2
        assert body["preserved_movements"] == 0

        assert not Supplier.objects.filter(id__in=[s1.id, s3.id]).exists()
        assert Supplier.objects.filter(id=s2.id).exists()
        # s1 + s3's movements are gone; s2's single movement remains.
        assert Movement.objects.count() == 1
        assert Movement.objects.filter(supplier=s2).count() == 1

    def test_foreign_company_supplier_is_silently_ignored(self, env, other_env):
        mine = _make_supplier_with_movement(env, "Mine")
        theirs = _make_supplier_with_movement(other_env, "Theirs")

        resp = env["client"].post(
            "/api/v1/suppliers/bulk-delete/",
            {"ids": [str(mine.id), str(theirs.id)], "preserve_movements": True},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 1
        assert body["preserved_movements"] == 1
        # Only mine deleted; foreign supplier + its movement untouched.
        assert not Supplier.objects.filter(id=mine.id).exists()
        assert Supplier.objects.filter(id=theirs.id).exists()
        assert Movement.objects.filter(supplier=theirs).count() == 1


def _make_aux_location(env, name):
    """Spin up a non-warehouse Location row scoped to env's company."""
    return Location.objects.create(
        company=env["company"],
        name=name,
        type="PHYSICAL",
    )


class TestLocationBulkDelete:
    """Multi-location selection. Locations are PROTECT-ed by Movement FKs,
    so preserve_movements=true must 409 if any are in use, and =false must
    cascade. Also covers empty-locations (no movements) deleting cleanly."""

    def test_preserve_rejects_when_any_location_in_use(self, env):
        l_used = env["warehouse"]
        l_empty1 = _make_aux_location(env, "Aisle-Empty-1")
        l_empty2 = _make_aux_location(env, "Aisle-Empty-2")
        p = _make_simple_product(env["company"], "LOC-MIX")
        _seed_movement(env, p)  # touches l_used

        resp = env["client"].post(
            "/api/v1/locations/bulk-delete/",
            {
                "ids": [str(l_used.id), str(l_empty1.id), str(l_empty2.id)],
                "preserve_movements": True,
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_409_CONFLICT
        body = resp.json()
        assert body["movement_count"] == 1
        # Nothing deleted — the empty ones are spared too.
        assert (
            Location.objects.filter(
                id__in=[l_used.id, l_empty1.id, l_empty2.id],
            ).count()
            == 3
        )

    def test_no_preserve_cascades_movements_across_locations(self, env):
        l_used = env["warehouse"]
        l_empty = _make_aux_location(env, "Aisle-Free")
        p = _make_simple_product(env["company"], "LOC-CAS")
        _seed_movement(env, p)

        resp = env["client"].post(
            "/api/v1/locations/bulk-delete/",
            {
                "ids": [str(l_used.id), str(l_empty.id)],
                "preserve_movements": False,
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 2
        assert not Location.objects.filter(
            id__in=[l_used.id, l_empty.id],
        ).exists()
        assert Movement.objects.count() == 0

    def test_preserve_succeeds_when_no_movements_reference(self, env):
        l1 = _make_aux_location(env, "Aisle-A")
        l2 = _make_aux_location(env, "Aisle-B")

        resp = env["client"].post(
            "/api/v1/locations/bulk-delete/",
            {
                "ids": [str(l1.id), str(l2.id)],
                "preserve_movements": True,
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 2
        assert not Location.objects.filter(id__in=[l1.id, l2.id]).exists()

    def test_foreign_location_is_silently_ignored(self, env, other_env):
        mine = _make_aux_location(env, "Mine-Aisle")
        theirs = _make_aux_location(other_env, "Their-Aisle")

        resp = env["client"].post(
            "/api/v1/locations/bulk-delete/",
            {"ids": [str(mine.id), str(theirs.id)]},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 1
        assert not Location.objects.filter(id=mine.id).exists()
        assert Location.objects.filter(id=theirs.id).exists()


class TestWorkOrderBulkDelete:
    """Three WorkOrders each with batch + serial children. Covers the new
    opt-in cascade contract from the wired bulk_delete endpoint."""

    def test_default_keeps_children_across_multiple_wos(self, env):
        wo1, b1, pp1 = _make_wo_with_children(env, "WO-A")
        wo2, b2, pp2 = _make_wo_with_children(env, "WO-B")
        wo3, b3, pp3 = _make_wo_with_children(env, "WO-C")

        resp = env["client"].post(
            "/api/v1/work-orders/bulk-delete/",
            {"ids": [str(wo1.id), str(wo2.id)]},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 2
        assert body["preserved_movements"] == 0

        assert not WorkOrder.objects.filter(id__in=[wo1.id, wo2.id]).exists()
        assert WorkOrder.objects.filter(id=wo3.id).exists()
        # Children of deleted WOs survive — SET_NULL on work_order FK.
        for child in (b1, b2, pp1, pp2):
            child.refresh_from_db()
            assert child.work_order_id is None
        # WO3's children still linked.
        b3.refresh_from_db()
        pp3.refresh_from_db()
        assert b3.work_order_id == wo3.id
        assert pp3.work_order_id == wo3.id

    def test_cascade_wipes_children_across_multiple_wos(self, env):
        wo1, b1, pp1 = _make_wo_with_children(env, "WO-CAS-A")
        wo2, b2, pp2 = _make_wo_with_children(env, "WO-CAS-B")
        wo3, b3, pp3 = _make_wo_with_children(env, "WO-CAS-C")

        resp = env["client"].post(
            "/api/v1/work-orders/bulk-delete/",
            {"ids": [str(wo1.id), str(wo2.id)], "cascade": True},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 2

        assert not WorkOrder.objects.filter(id__in=[wo1.id, wo2.id]).exists()
        assert not ProductBatch.objects.filter(id__in=[b1.id, b2.id]).exists()
        assert not PhysicalProduct.objects.filter(id__in=[pp1.id, pp2.id]).exists()
        # WO3's children survive.
        assert ProductBatch.objects.filter(id=b3.id).exists()
        assert PhysicalProduct.objects.filter(id=pp3.id).exists()

    def test_foreign_workorder_is_silently_ignored(self, env, other_env):
        mine, _, _ = _make_wo_with_children(env, "WO-MINE")
        theirs, _, _ = _make_wo_with_children(other_env, "WO-THEIRS")

        resp = env["client"].post(
            "/api/v1/work-orders/bulk-delete/",
            {"ids": [str(mine.id), str(theirs.id)]},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 1
        assert not WorkOrder.objects.filter(id=mine.id).exists()
        assert WorkOrder.objects.filter(id=theirs.id).exists()


class TestCalculatorTemplateBulkDelete:
    """Three templates, two assigned to ProductModel.default_calculator.
    Covers force-flag contract under multi-row selection + tenant scoping."""

    def _make_tpl_with_users(self, env, name, user_count=0):
        tpl = CalculatorTemplate.objects.create(
            company=env["company"],
            name=name,
            engine_type="counter",
        )
        for i in range(user_count):
            ProductModel.objects.create(
                company=env["company"],
                sku=f"{name}-USER-{i}",
                name=f"{name}-USER-{i}",
                default_calculator=tpl,
            )
        return tpl

    def test_rejects_when_any_template_assigned(self, env):
        t1 = self._make_tpl_with_users(env, "T-USED", user_count=2)
        t2 = self._make_tpl_with_users(env, "T-FREE-1", user_count=0)
        t3 = self._make_tpl_with_users(env, "T-FREE-2", user_count=0)

        resp = env["client"].post(
            "/api/v1/calculator-templates/bulk-delete/",
            {"ids": [str(t1.id), str(t2.id), str(t3.id)]},
            format="json",
        )

        assert resp.status_code == status.HTTP_409_CONFLICT
        assert resp.json()["assigned_count"] == 2
        # No template touched.
        assert (
            CalculatorTemplate.objects.filter(
                id__in=[t1.id, t2.id, t3.id],
            ).count()
            == 3
        )

    def test_force_detaches_all_assignments(self, env):
        t1 = self._make_tpl_with_users(env, "F-USED-1", user_count=2)
        t2 = self._make_tpl_with_users(env, "F-USED-2", user_count=1)
        t3 = self._make_tpl_with_users(env, "F-FREE", user_count=0)

        resp = env["client"].post(
            "/api/v1/calculator-templates/bulk-delete/",
            {
                "ids": [str(t1.id), str(t2.id), str(t3.id)],
                "force": True,
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 3
        assert not CalculatorTemplate.objects.filter(
            id__in=[t1.id, t2.id, t3.id],
        ).exists()
        # All 3 ProductModels survive with default_calculator nulled.
        assert (
            ProductModel.objects.filter(
                default_calculator__isnull=False,
            ).count()
            == 0
        )
        assert (
            ProductModel.objects.filter(
                sku__in=["F-USED-1-USER-0", "F-USED-1-USER-1", "F-USED-2-USER-0"],
            ).count()
            == 3
        )

    def test_foreign_template_is_silently_ignored(self, env, other_env):
        mine = self._make_tpl_with_users(env, "MINE-TPL", user_count=0)
        theirs = CalculatorTemplate.objects.create(
            company=other_env["company"],
            name="THEIRS-TPL",
            engine_type="counter",
        )

        resp = env["client"].post(
            "/api/v1/calculator-templates/bulk-delete/",
            {"ids": [str(mine.id), str(theirs.id)]},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 1
        assert not CalculatorTemplate.objects.filter(id=mine.id).exists()
        assert CalculatorTemplate.objects.filter(id=theirs.id).exists()


class TestMovementBulkDelete:
    """Multi-movement selection. Movements have NO preserve toggle — they
    ARE the audit history. Covers terminal deletion + tenant isolation +
    partial selection (untouched rows remain)."""

    def test_multi_movement_terminal_delete(self, env):
        p1 = _make_simple_product(env["company"], "MOV-A")
        p2 = _make_simple_product(env["company"], "MOV-B")
        _seed_mixed_movements(env, p1, count=3)
        _seed_mixed_movements(env, p2, count=3)

        assert Movement.objects.count() == 6
        target_ids = list(Movement.objects.filter(product_model=p1).values_list("id", flat=True))

        resp = env["client"].post(
            "/api/v1/movements/bulk-delete/",
            {"ids": [str(i) for i in target_ids]},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["deleted"] == 3
        assert body["preserved_movements"] == 0
        # p1's movements gone; p2's 3 untouched.
        assert Movement.objects.count() == 3
        assert not Movement.objects.filter(product_model=p1).exists()
        assert Movement.objects.filter(product_model=p2).count() == 3

    def test_ignores_preserve_movements_flag(self, env):
        """The endpoint accepts but ignores preserve_movements — there is
        no audit-preservation path for the audit log itself."""
        p = _make_simple_product(env["company"], "MOV-IGN")
        _seed_mixed_movements(env, p, count=2)
        ids = list(Movement.objects.filter(product_model=p).values_list("id", flat=True))

        resp = env["client"].post(
            "/api/v1/movements/bulk-delete/",
            {"ids": [str(i) for i in ids], "preserve_movements": True},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 2
        assert resp.json()["preserved_movements"] == 0
        assert Movement.objects.filter(product_model=p).count() == 0

    def test_foreign_movement_is_silently_ignored(self, env, other_env):
        p_mine = _make_simple_product(env["company"], "MOV-MINE")
        p_other = _make_simple_product(other_env["company"], "MOV-FOREIGN")
        _seed_mixed_movements(env, p_mine, count=2)
        _seed_mixed_movements(other_env, p_other, count=2)

        mine_ids = list(Movement.objects.filter(product_model=p_mine).values_list("id", flat=True))
        foreign_ids = list(
            Movement.objects.filter(product_model=p_other).values_list("id", flat=True)
        )

        resp = env["client"].post(
            "/api/v1/movements/bulk-delete/",
            {"ids": [str(i) for i in mine_ids + foreign_ids]},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["deleted"] == 2  # only mine
        assert not Movement.objects.filter(id__in=mine_ids).exists()
        assert Movement.objects.filter(id__in=foreign_ids).count() == 2
