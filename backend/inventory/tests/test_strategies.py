import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError
from inventory.models import ProductModel, Location, ProductBatch
from inventory.services import LedgerService, StockService
from inventory.exceptions import InsufficientStockError
from core.models import Company
import uuid


@pytest.fixture
def company(db):
    return Company.objects.create(
        name="StrategyCo",
        license_code=uuid.uuid4().hex[:6].upper(),
    )


@pytest.fixture
def product_bucket(db, company):
    return ProductModel.objects.create(
        company=company,
        sku="YOGURT_123",
        name="Yogurt",
        profile="BATCH_TRACKED",
    )


@pytest.fixture
def locations(db, company):
    wh = Location.objects.create(company=company, name="Central Warehouse", type="WAREHOUSE")
    supplier = Location.objects.create(company=company, name="Supplier", type="VIRTUAL")
    return {"warehouse": wh, "supplier": supplier}


@pytest.mark.django_db
class TestBucketLogic:
    def test_receive_new_batch(self, product_bucket, locations):
        """Test receiving a new batch creates a ProductBatch record."""
        user = None  # System/Test user

        # Action: Receive 100 units of Batch A
        batch_data = {"batch_identifier": "LOT-A", "data": {"expiry": "2024-12-31"}}

        movement = LedgerService.transfer_stock(
            product_model=product_bucket,
            from_location=locations["supplier"],
            to_location=locations["warehouse"],
            quantity=Decimal("100"),
            user=user,
            reason="Test Receive",
            batch_data=batch_data,
        )

        assert movement.quantity == 100
        assert movement.batch is not None
        assert movement.batch.batch_identifier == "LOT-A"
        assert movement.batch.quantity == 100

        # Verify StockService aggregates correctly
        stock_total = StockService.get_stock_for_location(product_bucket, locations["warehouse"])
        assert stock_total == 100

    def test_consume_specific_batch(self, product_bucket, locations):
        """Test consuming from a specific batch deducts correctly."""
        # Setup: Create Batch with 50 items
        batch = ProductBatch.objects.create(
            product_model=product_bucket,
            location=locations["warehouse"],
            batch_identifier="LOT-B",
            quantity=Decimal("50"),
        )

        # Action: Consume 10
        movement = LedgerService.transfer_stock(
            product_model=product_bucket,
            from_location=locations["warehouse"],
            to_location=locations["supplier"],  # Act as consumption for test
            quantity=Decimal("10"),
            user=None,
            reason="Test Consume",
            batch_id=str(batch.id),
        )

        batch.refresh_from_db()
        assert batch.quantity == 40
        assert movement.batch == batch

    def test_consume_insufficient_batch(self, product_bucket, locations):
        """Test consuming more than available in a batch raises error."""
        batch = ProductBatch.objects.create(
            product_model=product_bucket,
            location=locations["warehouse"],
            batch_identifier="LOT-C",
            quantity=Decimal("10"),
        )

        with pytest.raises(InsufficientStockError) as exc:
            LedgerService.transfer_stock(
                product_model=product_bucket,
                from_location=locations["warehouse"],
                to_location=locations["supplier"],
                quantity=Decimal("15"),
                user=None,
                reason="Overdraw",
                batch_id=str(batch.id),
            )
        assert "Insufficient available stock in Batch" in str(exc.value)

    def test_inbound_without_batch_data_auto_generates_identifier(self, product_bucket, locations):
        """A fresh BATCH_TRACKED product can receive inbound stock from VIRTUAL
        with no batch_id / batch_data — BatchBehavior synthesizes an
        AUTO-YYYYMMDD-XXXXXX identifier so users aren't forced into a Catch-22
        (PRESET-LOGIC-07)."""
        movement = LedgerService.transfer_stock(
            product_model=product_bucket,
            from_location=locations["supplier"],
            to_location=locations["warehouse"],
            quantity=Decimal("25"),
            user=None,
            reason="First inbound",
        )

        assert movement.batch is not None
        assert movement.batch.batch_identifier.startswith("AUTO-")
        assert movement.batch.quantity == 25
        assert StockService.get_stock_for_location(product_bucket, locations["warehouse"]) == 25

    def test_consume_bucket_without_batch_id_fails(self, product_bucket, locations):
        """BUCKET strategy requires batch_id for consumption."""
        with pytest.raises(ValidationError) as exc:
            LedgerService.transfer_stock(
                product_model=product_bucket,
                from_location=locations["warehouse"],
                to_location=locations["supplier"],
                quantity=Decimal("5"),
                user=None,
                reason="Oops",
                batch_id=None,
            )
        assert "Batch ID is required" in str(exc.value)
