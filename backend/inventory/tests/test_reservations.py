"""Reservations: available = physical − reserved, enforced on every outbound path."""

import pytest
from decimal import Decimal
from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Company, User
from inventory.models import ProductModel, Location, PhysicalProduct
from inventory.services import LedgerService, StockService
from inventory.services.reservations import ReservationService
from inventory.exceptions import InsufficientStockError, InventoryError


@pytest.fixture
def env(db):
    company = Company.objects.create(name="Res Corp", license_code="RES001")
    user = User.objects.create_user(username="res_user", password="x", company=company)
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    external = Location.objects.create(company=company, name="External", type="VIRTUAL")
    product = ProductModel.objects.create(
        company=company,
        sku="RES-BULK",
        name="Bulk Product",
        profile="SIMPLE_COUNT",
    )
    # Seed 10 units
    LedgerService.transfer_stock(product, external, warehouse, Decimal("10"), user, "Seed")
    return {
        "company": company,
        "user": user,
        "warehouse": warehouse,
        "external": external,
        "product": product,
    }


def test_reserve_within_available(env):
    res = ReservationService.reserve(
        env["product"], 6, env["user"], location=env["warehouse"], reference="SO-1"
    )
    assert res.status == "ACTIVE"
    assert StockService.get_available_for_location(env["product"], env["warehouse"]) == Decimal("4")


def test_reserve_beyond_available_fails(env):
    ReservationService.reserve(env["product"], 6, env["user"], location=env["warehouse"])
    with pytest.raises(InsufficientStockError):
        ReservationService.reserve(env["product"], 5, env["user"], location=env["warehouse"])


def test_outbound_respects_reservation(env):
    ReservationService.reserve(env["product"], 6, env["user"], location=env["warehouse"])
    # 4 available: 7 must fail, 4 must pass
    with pytest.raises(InsufficientStockError):
        LedgerService.transfer_stock(
            env["product"], env["warehouse"], env["external"], Decimal("7"), env["user"], "Out"
        )
    LedgerService.transfer_stock(
        env["product"], env["warehouse"], env["external"], Decimal("4"), env["user"], "Out"
    )


def test_fulfilling_transfer_consumes_reservation(env):
    res = ReservationService.reserve(env["product"], 6, env["user"], location=env["warehouse"])
    LedgerService.transfer_stock(
        env["product"],
        env["warehouse"],
        env["external"],
        Decimal("6"),
        env["user"],
        "Ship SO-1",
        reservation=res,
    )
    res.refresh_from_db()
    assert res.status == "CONSUMED"
    # All remaining 4 are free again
    assert StockService.get_available_for_location(env["product"], env["warehouse"]) == Decimal("4")


def test_release_frees_stock(env):
    res = ReservationService.reserve(env["product"], 6, env["user"], location=env["warehouse"])
    ReservationService.release(res)
    assert StockService.get_available_for_location(env["product"], env["warehouse"]) == Decimal(
        "10"
    )
    with pytest.raises(InventoryError):
        ReservationService.release(res)


def test_expired_reservation_ignored(env):
    ReservationService.reserve(
        env["product"],
        6,
        env["user"],
        location=env["warehouse"],
        expires_at=timezone.now() - timedelta(minutes=1),
    )
    assert StockService.get_available_for_location(env["product"], env["warehouse"]) == Decimal(
        "10"
    )


def test_serialized_reserved_item_blocked(env):
    product = ProductModel.objects.create(
        company=env["company"],
        sku="RES-SER",
        name="Serialized",
        profile="SERIALIZED",
    )
    pp = PhysicalProduct.objects.create(
        product_model=product,
        identifier="SN-1",
        location=env["warehouse"],
        status="ACTIVE",
    )
    res = ReservationService.reserve(
        product, 1, env["user"], location=env["warehouse"], physical_product=pp
    )

    with pytest.raises(InventoryError):
        LedgerService.transfer_stock(
            product,
            env["warehouse"],
            env["external"],
            Decimal("1"),
            env["user"],
            "Out",
            physical_product=pp,
        )
    # Fulfilling transfer passes and consumes
    LedgerService.transfer_stock(
        product,
        env["warehouse"],
        env["external"],
        Decimal("1"),
        env["user"],
        "Ship",
        physical_product=pp,
        reservation=res,
    )
    res.refresh_from_db()
    assert res.status == "CONSUMED"


def test_double_reserve_same_item_fails(env):
    product = ProductModel.objects.create(
        company=env["company"],
        sku="RES-SER2",
        name="Serialized2",
        profile="SERIALIZED",
    )
    pp = PhysicalProduct.objects.create(
        product_model=product,
        identifier="SN-2",
        location=env["warehouse"],
        status="ACTIVE",
    )
    ReservationService.reserve(
        product, 1, env["user"], location=env["warehouse"], physical_product=pp
    )
    with pytest.raises(InventoryError):
        ReservationService.reserve(
            product, 1, env["user"], location=env["warehouse"], physical_product=pp
        )


def test_api_crud_and_release(env):
    client = APIClient()
    client.force_authenticate(user=env["user"])

    resp = client.post(
        "/api/v1/reservations/",
        {
            "product_id": str(env["product"].id),
            "location_id": str(env["warehouse"].id),
            "quantity": "3",
            "reference": "API-1",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    res_id = resp.data["id"]

    resp = client.get("/api/v1/reservations/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1 if "count" in resp.data else len(resp.data) == 1

    resp = client.delete(f"/api/v1/reservations/{res_id}/")
    assert resp.status_code == 405

    resp = client.post(f"/api/v1/reservations/{res_id}/release/")
    assert resp.status_code == 200
    assert resp.data["status"] == "RELEASED"


def test_api_cross_company_isolation(env):
    other_company = Company.objects.create(name="Other", license_code="RES002")
    other_user = User.objects.create_user(username="other_res", password="x", company=other_company)
    res = ReservationService.reserve(env["product"], 2, env["user"], location=env["warehouse"])

    client = APIClient()
    client.force_authenticate(user=other_user)
    resp = client.get(f"/api/v1/reservations/{res.id}/")
    assert resp.status_code == 404
    resp = client.post(
        "/api/v1/reservations/",
        {
            "product_id": str(env["product"].id),
            "quantity": "1",
        },
        format="json",
    )
    assert resp.status_code == 400
