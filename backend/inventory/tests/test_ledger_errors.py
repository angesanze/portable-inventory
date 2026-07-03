import pytest
from django.core.exceptions import ValidationError
from inventory.models import ProductModel, Location, ProductBatch
from inventory.services import LedgerService
from inventory.exceptions import InsufficientStockError
from core.models import Company


@pytest.fixture
def setup_ledger_data(db):
    company = Company.objects.create(name="Ledger Err Co", license_code="LDGERR")

    prod = ProductModel.objects.create(
        company=company, sku="WIDGET-Err", name="Error Widget", profile="BATCH_TRACKED"
    )

    loc = Location.objects.create(company=company, name="Store", type="STORE")
    supplier = Location.objects.create(company=company, name="Supplier", type="VIRTUAL")
    loss, _ = Location.objects.get_or_create(
        company=company, name="Loss", defaults={"type": "LOSS"}
    )

    return {
        "company": company,
        "product": prod,
        "location": loc,
        "supplier": supplier,
        "loss": loss,
    }


@pytest.mark.django_db
def test_consume_bucket_requires_batch_id(setup_ledger_data):
    prod = setup_ledger_data["product"]
    loc = setup_ledger_data["location"]
    loss = setup_ledger_data["loss"]

    # Try to consume without batch_id
    with pytest.raises(ValidationError) as e:
        LedgerService.transfer_stock(
            product_model=prod,
            from_location=loc,
            to_location=loss,
            quantity=1,
            user=None,
            reason="Fail",
        )
    assert "Batch ID is required" in str(e.value)


@pytest.mark.django_db
def test_consume_insufficient_stock_in_batch(setup_ledger_data):
    prod = setup_ledger_data["product"]
    loc = setup_ledger_data["location"]
    loss = setup_ledger_data["loss"]

    batch = ProductBatch.objects.create(
        product_model=prod, location=loc, batch_identifier="LOW-STOCK", quantity=5
    )

    with pytest.raises(InsufficientStockError) as e:
        LedgerService.transfer_stock(
            product_model=prod,
            from_location=loc,
            to_location=loss,
            quantity=10,  # More than 5
            user=None,
            reason="Fail",
            batch_id=str(batch.id),
        )
    assert "Insufficient available stock" in str(e.value)


@pytest.mark.django_db
def test_consume_non_existent_batch(setup_ledger_data):
    prod = setup_ledger_data["product"]
    loc = setup_ledger_data["location"]
    loss = setup_ledger_data["loss"]

    import uuid

    fake_id = uuid.uuid4()

    from inventory.exceptions import ItemNotFoundError

    with pytest.raises(ItemNotFoundError) as e:
        LedgerService.transfer_stock(
            product_model=prod,
            from_location=loc,
            to_location=loss,
            quantity=1,
            user=None,
            reason="Fail",
            batch_id=str(fake_id),
        )
    assert "Specified Batch not found" in str(e.value)
