"""Atomicity regressions for two widget write paths (H2, M1).

Both tests run with ``transaction=True`` (TransactionTestCase semantics): there
is NO enclosing test transaction, so a write that is not wrapped in the view's
own ``transaction.atomic()`` commits immediately and survives a later failure.
That is exactly the orphan these fixes prevent — under the rollback-per-test
``django_db`` fixture the bug would be masked, so transactional mode is required
to make the assertions meaningful.

* H2 — ``configure_qr`` legacy branch: get_or_create(PhysicalProduct) then
  qr.save(). A failure on qr.save() must roll back the item.
* M1 — ``process_transaction`` produce_kit-on-a-ProductModel branch:
  WorkOrder.objects.create() then BatchManagerService.handle_batch_manager_
  transaction(); if the latter raises, the WorkOrder must roll back.
"""

import uuid
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework.test import APIClient, APIRequestFactory

from core.models import ApiKey, Company, User
from inventory.api.public.viewsets.qr import QRCodeWidgetViewSet
from inventory.models import (
    DynamicQRCode,
    Location,
    PhysicalProduct,
    ProductComponent,
    ProductModel,
    WorkOrder,
)


def _make_env(suffix):
    company = Company.objects.create(
        name=f"Atomic {suffix}", license_code=uuid.uuid4().hex[:6].upper()
    )
    User.objects.create_user(username=f"atomic_{suffix}", password="pw", company=company)
    api_key = ApiKey.objects.create(
        company=company, label=f"Key {suffix}", key=f"key-{uuid.uuid4().hex[:12]}"
    )
    warehouse = Location.objects.create(company=company, name=f"WH-{suffix}", type="WAREHOUSE")
    return company, api_key, warehouse


@pytest.mark.django_db(transaction=True)
def test_configure_qr_legacy_item_rolls_back_on_failure():
    """H2: a qr.save() failure must roll back the get_or_create'd item.

    The action is invoked directly (APIRequestFactory) rather than through the
    full middleware stack so the only transaction boundary in play is the
    action's own ``transaction.atomic()`` — making the rollback assertion
    unambiguous. Without that wrapper the get_or_create commits in autocommit
    and the orphan survives the qr.save() failure.
    """
    company, api_key, warehouse = _make_env("QR")
    # SERIALIZED → tracking_mode INDIVIDUAL, so the legacy branch may actually
    # get_or_create a PhysicalProduct (a BULK model would reject it up front and
    # never reach the qr.save() we want to fail on).
    product = ProductModel.objects.create(
        company=company, sku="ATOMIC-QR", name="QR Product", profile="SERIALIZED"
    )
    qr = DynamicQRCode.objects.create(company=company)
    ident = f"ORPHAN-{uuid.uuid4().hex[:8]}"
    assert not PhysicalProduct.objects.filter(identifier=ident).exists()

    factory = APIRequestFactory()
    request = factory.post(
        f"{reverse('widget-configure-qr')}?api_key={api_key.key}",
        {
            "code": qr.code,
            "product_model_id": str(product.id),
            "physical_identifier": ident,
            "location_id": str(warehouse.id),
        },
        format="json",
    )
    view = QRCodeWidgetViewSet.as_view({"post": "configure_qr"})

    # Force the QR save (the LAST write in the action body, AFTER the
    # get_or_create) to blow up. DRF converts the unhandled error to a 500
    # Response; the action's atomic() must still roll back the new item.
    with patch.object(DynamicQRCode, "save", side_effect=RuntimeError("boom on qr.save")):
        resp = view(request)
    assert resp.status_code == 500

    assert not PhysicalProduct.objects.filter(identifier=ident).exists(), (
        "configure_qr is not atomic: the get_or_create'd PhysicalProduct leaked "
        "when qr.save() failed"
    )


@pytest.mark.django_db(transaction=True)
def test_produce_kit_on_product_model_rolls_back_wo_on_failure():
    """M1: if handle_batch_manager_transaction raises, the just-created WorkOrder
    must not survive as an orphan."""
    company, api_key, warehouse = _make_env("KIT")

    kit = ProductModel.objects.create(
        company=company, sku="ATOMIC-KIT", name="Kit", profile="ASSEMBLED"
    )
    comp = ProductModel.objects.create(company=company, sku="ATOMIC-COMP", name="Component")
    ProductComponent.objects.create(parent=kit, child=comp, quantity=2)

    wo_count_before = WorkOrder.objects.filter(company=company).count()

    client = APIClient()
    url = reverse("widget-transaction", kwargs={"pk": kit.id})

    # Make the batch-manager step (called AFTER WorkOrder.objects.create) fail.
    with patch(
        "inventory.services.widget_transaction.BatchManagerService.handle_batch_manager_transaction",
        side_effect=RuntimeError("boom in batch manager"),
    ):
        resp = client.post(
            f"{url}?api_key={api_key.key}",
            {"operation": "produce_kit", "delta": 1},
            format="json",
        )

    # The request fails (the error is wrapped into an InventoryError → non-2xx).
    assert resp.status_code != 200, resp.content

    assert WorkOrder.objects.filter(company=company).count() == wo_count_before, (
        "produce_kit is not atomic: an orphan WorkOrder survived a batch-manager failure"
    )
