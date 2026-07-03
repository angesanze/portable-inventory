"""Customer registry (SALES-ORDERS-04): company-scoped CRUD + VAT + bulk delete."""

import pytest
from decimal import Decimal

from rest_framework.test import APIClient

from core.models import Company, User
from inventory.models import Customer, Location
from inventory.services import LedgerService
from .helpers import make_simple_product


@pytest.fixture
def env(db):
    company = Company.objects.create(name="Cust Corp", license_code="CU0001")
    user = User.objects.create_user(username="cu_user", password="x", company=company)
    return {"company": company, "user": user}


@pytest.fixture
def api(env):
    client = APIClient()
    client.force_authenticate(user=env["user"])
    return client


def test_create_and_list(env, api):
    resp = api.post(
        "/api/v1/customers/",
        {
            "name": "Beta Retail",
            "email": "ops@beta.test",
            "phone": "+39 02 1234",
            "address": "Via Roma 1",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    resp = api.get("/api/v1/customers/")
    assert (resp.data["count"] if "count" in resp.data else len(resp.data)) == 1


def test_valid_vat_accepted_invalid_rejected(env, api):
    # 07643520567 is a valid mod-10 partita IVA
    resp = api.post(
        "/api/v1/customers/", {"name": "Valid VAT", "vat_number": "07643520567"}, format="json"
    )
    assert resp.status_code == 201, resp.content
    resp = api.post(
        "/api/v1/customers/", {"name": "Bad VAT", "vat_number": "12345678901"}, format="json"
    )
    assert resp.status_code == 400


def test_duplicate_name_rejected(env, api):
    api.post("/api/v1/customers/", {"name": "Dup"}, format="json")
    resp = api.post("/api/v1/customers/", {"name": "Dup"}, format="json")
    assert resp.status_code == 400


def test_cross_company_isolation(env, api):
    other = Company.objects.create(name="Other", license_code="CU0002")
    other_cust = Customer.objects.create(company=other, name="Foreign")
    resp = api.get(f"/api/v1/customers/{other_cust.id}/")
    assert resp.status_code == 404


def test_bulk_delete_preserves_movements(env, api):
    warehouse = Location.objects.create(company=env["company"], name="WH", type="WAREHOUSE")
    external = Location.objects.create(company=env["company"], name="External", type="VIRTUAL")
    product = make_simple_product(env["company"])
    customer = Customer.objects.create(company=env["company"], name="Shipped To")
    LedgerService.transfer_stock(product, external, warehouse, Decimal("5"), env["user"], "Seed")
    m = LedgerService.transfer_stock(
        product,
        warehouse,
        external,
        Decimal("1"),
        env["user"],
        "Ship",
        customer=customer,
    )
    assert m.customer == customer

    resp = api.post(
        "/api/v1/customers/bulk-delete/",
        {
            "ids": [str(customer.id)],
            "preserve_movements": True,
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    m.refresh_from_db()
    assert m.customer is None
    assert not Customer.objects.filter(id=customer.id).exists()
