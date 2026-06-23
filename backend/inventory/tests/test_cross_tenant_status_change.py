"""Cross-tenant isolation regression for tracker status changes (SEC, write path).

The widget `transaction` endpoint routes tracker status changes through
`TrackerStatusBehavior.execute_status_change`. When a caller supplies
`physical_product_id` directly (instead of `physical_identifier`), that id used
to be fetched with an UNSCOPED ``PhysicalProduct.objects.get(id=pp_id)`` and then
mutated with a raw ``.update(status=...)`` (which bypasses ``clean()``). A tenant
authorized for product A could therefore flip the status of another tenant's
serialized asset B just by knowing its UUID.

The fix scopes the lookup to the engine's (company-scoped) product model, so the
foreign item is invisible. These tests pin both halves: the attack is rejected
and the foreign item is untouched, while the legitimate same-tenant direct-id
path still works.
"""
import uuid

import pytest
from rest_framework.test import APIClient

from core.models import ApiKey, Company
from inventory.models import Location, PhysicalProduct, ProductModel

TRANSITIONS = {
    "ACTIVE": ["IN_USE"],
    "IN_USE": ["RETURNED"],
    "RETURNED": ["ACTIVE"],
}


def _make_tenant(suffix):
    company = Company.objects.create(
        name=f"Tenant {suffix}",
        license_code=uuid.uuid4().hex[:6].upper(),
    )
    api_key = ApiKey.objects.create(
        company=company, label=f"Key {suffix}", key=f"key-{uuid.uuid4().hex[:12]}"
    )
    warehouse = Location.objects.create(
        company=company, name=f"WH-{suffix}", type="WAREHOUSE"
    )
    product = ProductModel.objects.create(
        company=company,
        sku=f"SER-{uuid.uuid4().hex[:8]}",
        name=f"Asset {suffix}",
        profile="SERIALIZED",
        engine_config={"status_transitions": TRANSITIONS},
    )
    pp = PhysicalProduct.objects.create(
        product_model=product,
        identifier=f"SN-{uuid.uuid4().hex[:8]}",
        location=warehouse,
        status="ACTIVE",
    )
    return {"company": company, "api_key": api_key, "product": product, "pp": pp}


@pytest.fixture
def tenants(transactional_db):
    return {"A": _make_tenant("A"), "B": _make_tenant("B")}


@pytest.mark.django_db(transaction=True)
def test_cross_tenant_physical_product_id_is_rejected(tenants):
    """Tenant A cannot flip tenant B's serialized item via a foreign
    physical_product_id. ACTIVE->IN_USE is a VALID transition for B, so the only
    thing that may stop the write is company/product scoping — not transition
    validation. The foreign item must stay ACTIVE and the request must error.
    """
    attacker = tenants["A"]
    victim = tenants["B"]
    victim_pp = victim["pp"]

    client = APIClient()
    url = f"/api/v1/widget/{attacker['product'].id}/transaction/?api_key={attacker['api_key'].key}"
    payload = {
        "operation": "status_change",
        "physical_product_id": str(victim_pp.id),
        "new_status": "IN_USE",
    }
    res = client.post(url, payload, format="json")

    assert res.status_code != 200, (
        f"cross-tenant status change should be rejected, got 200: {res.content}"
    )
    victim_pp.refresh_from_db()
    assert victim_pp.status == "ACTIVE", "victim item status must be unchanged"


@pytest.mark.django_db(transaction=True)
def test_same_tenant_physical_product_id_still_works(tenants):
    """Positive control: the legitimate same-tenant direct-id path is untouched
    by the scoping fix — A may still drive its own item by physical_product_id.
    """
    owner = tenants["A"]
    pp = owner["pp"]

    client = APIClient()
    url = f"/api/v1/widget/{owner['product'].id}/transaction/?api_key={owner['api_key'].key}"
    payload = {
        "operation": "status_change",
        "physical_product_id": str(pp.id),
        "new_status": "IN_USE",
    }
    res = client.post(url, payload, format="json")

    assert res.status_code == 200, res.content
    pp.refresh_from_db()
    assert pp.status == "IN_USE"


@pytest.mark.django_db(transaction=True)
def test_client_supplied_user_is_ignored_on_widget_status_change(tenants):
    """M3: the public widget path must not let a client forge audit attribution.

    ``strategies.execute_status_change`` writes ``delta_payload['user']`` to
    ``Movement.performed_by``; the widget service strips ``user``/``performed_by``
    from the raw body so a forged actor is dropped. Supply a bogus ``user`` UUID
    and assert the resulting status-change Movement has ``performed_by=None``.
    """
    from inventory.models import Movement

    owner = tenants["A"]
    pp = owner["pp"]
    forged = str(uuid.uuid4())

    client = APIClient()
    url = f"/api/v1/widget/{owner['product'].id}/transaction/?api_key={owner['api_key'].key}"
    payload = {
        "operation": "status_change",
        "physical_product_id": str(pp.id),
        "new_status": "IN_USE",
        "user": forged,            # forged attribution — must be ignored
        "performed_by": forged,    # alternate field name — must also be ignored
    }
    res = client.post(url, payload, format="json")

    assert res.status_code == 200, res.content
    mv = Movement.objects.filter(
        physical_product=pp, reason__startswith="Status:"
    ).latest("occurred_at")
    assert mv.performed_by_id is None, "client-supplied user must not be attributed"
