"""Regression test for `select_for_update cannot be used outside of a transaction`.

The widget `transaction` endpoint routes tracker status changes through
`TrackerStatusBehavior.execute_status_change`, which acquires a row-level
lock with `select_for_update`. Without an enclosing `transaction.atomic`
block, PostgreSQL rejects the lock with the error above.

`@pytest.mark.django_db(transaction=True)` uses real (non-wrapped) DB
transactions, so the bug surfaces if the strategy ever loses its own
atomic block. Default `@pytest.mark.django_db` wraps each test in an
outer transaction, which masks the issue.
"""

import uuid

import pytest
from rest_framework.test import APIClient

from core.models import Company, ApiKey
from inventory.models import Location, PhysicalProduct, ProductModel


@pytest.fixture
def setup(transactional_db):
    company = Company.objects.create(
        name="StatusChange Co",
        license_code=uuid.uuid4().hex[:6].upper(),
    )
    api_key = ApiKey.objects.create(
        company=company,
        label="Widget Key",
        key=f"key-{uuid.uuid4().hex[:12]}",
    )
    warehouse = Location.objects.create(company=company, name="WH", type="WAREHOUSE")
    transitions = {
        "ACTIVE": ["IN_USE"],
        "IN_USE": ["RETURNED"],
        "RETURNED": ["ACTIVE"],
    }
    product = ProductModel.objects.create(
        company=company,
        sku=f"SER-{uuid.uuid4().hex[:8]}",
        name="Macbook 13",
        profile="SERIALIZED",
        engine_config={"status_transitions": transitions},
    )
    pp = PhysicalProduct.objects.create(
        product_model=product,
        identifier=f"SN-{uuid.uuid4().hex[:8]}",
        location=warehouse,
        status="ACTIVE",
    )
    return {
        "company": company,
        "api_key": api_key,
        "product": product,
        "physical_product": pp,
    }


@pytest.mark.django_db(transaction=True)
def test_widget_tracker_status_change_succeeds_without_outer_transaction(setup):
    """End-to-end: status_change on a tracker product must work when the
    test (and therefore the request) runs without an outer Django-managed
    transaction. This is the exact condition that produced the
    `select_for_update cannot be used outside of a transaction` crash on
    2026-05-26.
    """
    product = setup["product"]
    pp = setup["physical_product"]
    api_key = setup["api_key"]

    client = APIClient()
    url = f"/api/v1/widget/{product.id}/transaction/?api_key={api_key.key}"
    payload = {
        "operation": "status_change",
        "physical_identifier": pp.identifier,
        "new_status": "IN_USE",
    }
    res = client.post(url, payload, format="json")

    assert res.status_code == 200, res.content
    pp.refresh_from_db()
    assert pp.status == "IN_USE"
