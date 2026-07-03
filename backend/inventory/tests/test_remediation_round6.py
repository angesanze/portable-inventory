"""Regression tests for the 6th-round remediation fixes that lacked coverage.

Each test pins the concrete failure the fix addresses so the class can't silently
come back: OPS-01 (delete_company crash), SEC-07 (cross-tenant QR api_key),
COR-13 (BATCH reservation not protected), COR-11 (unvalidated WO quantity).
"""

from decimal import Decimal

import pytest
from django.core.management import call_command
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers as drf_serializers
from rest_framework.test import APIClient

from core.models import Company, ApiKey, User
from core.scope import ACTING_COMPANY_HEADER
from inventory.models import Location, DynamicQRCode, ProductBatch
from inventory.services.ledger import LedgerService
from inventory.services.reservations import ReservationService
from inventory.services.work_order import WorkOrderService
from inventory.exceptions import InsufficientStockError
from .helpers import make_company_full, make_simple_product, make_batch_product


@pytest.mark.django_db
def test_ops01_delete_company_with_movements_succeeds():
    """delete_company --confirm must not ProtectedError once the tenant has a
    Movement (Movements PROTECT the cascade's locations but are not cascaded)."""
    company, user, _ = make_company_full("DEL")
    product = make_simple_product(company)
    wh = Location.objects.get(company=company, name="Main Warehouse")
    ext = Location.objects.get(company=company, name="External Vendor")
    LedgerService.transfer_stock(
        product_model=product,
        from_location=ext,
        to_location=wh,
        quantity=Decimal("5"),
        user=user,
        reason="seed",
    )
    cid = company.id
    call_command("delete_company", str(cid), "--confirm")
    assert not Company.objects.filter(id=cid).exists()


@pytest.mark.django_db
def test_sec07_qr_rejects_foreign_api_key():
    """A QR code cannot be bound to another tenant's ApiKey (the /go/ token sink)."""
    company_a, _, _ = make_company_full("QA")
    _, _, key_b = make_company_full("QB")
    qr = DynamicQRCode(company=company_a, api_key=ApiKey.objects.get(id=key_b.id))
    with pytest.raises(DjangoValidationError):
        qr.save()


@pytest.mark.django_db
def test_cor13_batch_reservation_blocks_overwithdrawal():
    """A batchless reservation on a BATCH product must hold back batch stock."""
    company, user, _ = make_company_full("RES")
    product = make_batch_product(company)
    wh = Location.objects.get(company=company, name="Main Warehouse")
    ext = Location.objects.get(company=company, name="External Vendor")
    LedgerService.transfer_stock(
        product_model=product,
        from_location=ext,
        to_location=wh,
        quantity=Decimal("10"),
        user=user,
        reason="receive",
        batch_data={"batch_identifier": "LOT-1", "data": {}},
    )
    batch = ProductBatch.objects.get(product_model=product, location=wh, batch_identifier="LOT-1")
    # Reserve the whole lot batchless (the sales flow shape).
    ReservationService.reserve(product, Decimal("10"), user, location=wh, reference="SO-1")

    with pytest.raises(InsufficientStockError):
        LedgerService.transfer_stock(
            product_model=product,
            from_location=wh,
            to_location=ext,
            quantity=Decimal("10"),
            user=user,
            reason="consume",
            batch_id=str(batch.id),
        )


@pytest.mark.django_db
def test_fe04_developer_acting_as_tenant_scopes_widget_move_to_acting_company():
    """A developer 'entering' a child tenant must run an inline widget-backed
    adjustment against the CHILD's product — the widget JWT fallback now scopes
    to the acting company, not the developer's own (FE-04)."""
    developer = Company.objects.create(
        name="Dev FE04", account_type=Company.AccountType.DEVELOPER, license_code="DEVF04"
    )
    child = Company.objects.create(name="Child FE04", parent=developer, license_code="CHLF04")
    dev_user = User.objects.create_user(username="dev_fe04", password="x", company=developer)

    product = make_simple_product(child)
    wh = Location.objects.create(company=child, name="WH", type="WAREHOUSE")

    client = APIClient()
    client.force_authenticate(user=dev_user)
    body = {
        "product_id": str(product.id),
        "quantity": 5,
        "location_id": str(wh.id),
        "counterparty": "ADJUSTMENT",
    }

    # No acting header → resolves to the developer's own company → 404.
    resp_no_header = client.post("/api/v1/widget/move/", body, format="json")
    assert resp_no_header.status_code == 404, resp_no_header.data

    # Acting header → resolves to the child → succeeds.
    resp = client.post(
        "/api/v1/widget/move/",
        body,
        format="json",
        **{ACTING_COMPANY_HEADER: str(child.id)},
    )
    assert resp.status_code == 200, resp.data


@pytest.mark.django_db
def test_location_cycle_raises_validationerror_not_nameerror():
    """Location.clean()'s cycle guard referenced an unimported ValidationError, so
    a real hierarchy cycle raised NameError. It must raise ValidationError now."""
    company, _, _ = make_company_full("LOCCYC")
    a = Location.objects.create(company=company, name="Loc A", type="WAREHOUSE")
    b = Location.objects.create(company=company, name="Loc B", type="WAREHOUSE", parent=a)
    a.parent = b  # A → B → A cycle
    with pytest.raises(DjangoValidationError):
        a.save()


@pytest.mark.django_db
def test_cor11_work_order_rejects_negative_quantity():
    """WorkOrder item quantity must be positive — a negative would inject
    negative BATCH stock outside the ledger."""
    company, _, _ = make_company_full("WOQ")
    product = make_batch_product(company)
    with pytest.raises(drf_serializers.ValidationError):
        WorkOrderService.create_with_items(
            {"company": company, "name": "WO-NEG"},
            [{"product_model_id": product.id, "quantity": Decimal("-100")}],
        )
