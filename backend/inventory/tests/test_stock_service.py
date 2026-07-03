import pytest
import uuid
from decimal import Decimal
from inventory.models import ProductModel, Location, ProductBatch, PhysicalProduct, Movement
from inventory.services import StockService, LedgerService
from core.models import Company


@pytest.fixture
def setup_stock_data(db):
    company = Company.objects.create(
        name="StockCo", license_code=f"STK{uuid.uuid4().hex[:4].upper()}"
    )

    prod = ProductModel.objects.create(
        company=company, sku="WIDGET-B", name="Bucket Widget", profile="BATCH_TRACKED"
    )

    loc = Location.objects.create(company=company, name="Store", type="STORE")

    return {"company": company, "product": prod, "location": loc}


@pytest.mark.django_db
def test_stock_service_sums_batches(setup_stock_data):
    prod = setup_stock_data["product"]
    loc = setup_stock_data["location"]

    # Create manual batches
    ProductBatch.objects.create(
        product_model=prod, location=loc, batch_identifier="B1", quantity=10
    )
    ProductBatch.objects.create(product_model=prod, location=loc, batch_identifier="B2", quantity=5)
    ProductBatch.objects.create(
        product_model=prod, location=loc, batch_identifier="B3", quantity=2.5
    )

    # Check Verification
    total = StockService.get_stock_for_location(prod, loc)
    assert total == Decimal("17.5")


@pytest.mark.django_db
def test_stock_service_with_movements(setup_stock_data):
    # Verify interaction with LedgerService
    prod = setup_stock_data["product"]
    loc = setup_stock_data["location"]

    supplier = Location.objects.create(
        company=setup_stock_data["company"], name="Supplier", type="VIRTUAL"
    )

    # Receive 20 into Batch A
    LedgerService.transfer_stock(
        product_model=prod,
        from_location=supplier,
        to_location=loc,
        quantity=Decimal("20"),
        user=None,
        reason="Test Receive",
        batch_data={"batch_identifier": "BATCH-A"},
    )

    assert StockService.get_stock_for_location(prod, loc) == Decimal("20")

    # Consume 5 from Batch A
    batch_a = ProductBatch.objects.get(batch_identifier="BATCH-A")
    LedgerService.transfer_stock(
        product_model=prod,
        from_location=loc,
        to_location=supplier,
        quantity=Decimal("5"),
        user=None,
        reason="Test Consume",
        batch_id=str(batch_a.id),
    )

    assert StockService.get_stock_for_location(prod, loc) == Decimal("15")


@pytest.mark.django_db
def test_get_stock_for_model_performance(db, django_assert_num_queries):
    """
    Test that query count is low and constant regardless of number of locations.
    """
    # Setup: 1 Product, 50 Locations, 1 Batch per location
    company = Company.objects.create(
        name="PerfCo", license_code=f"PRF{uuid.uuid4().hex[:4].upper()}"
    )
    product = ProductModel.objects.create(
        company=company, sku="PERF-001", name="Perf Item", profile="BATCH_TRACKED"
    )

    locations = []
    for i in range(50):
        loc = Location.objects.create(company=company, name=f"Loc-{i}", type="WAREHOUSE")
        locations.append(loc)
        ProductBatch.objects.create(
            product_model=product, location=loc, batch_identifier=f"B-{i}", quantity=10
        )

    # Execution
    # Expected Queries:
    # 1. Fetch Locations (filter exclude)
    # 2. Fetch Aggregated Batches (values.annotate)
    # Total: 1 query for Bucket Strategy (aggregation on ProductBatch)
    with django_assert_num_queries(1):
        result = StockService.get_stock_for_model(product)

    assert result["total"] == 50 * 10
    assert len(result["breakdown"]) == 50


@pytest.mark.django_db
def test_get_location_contents_performance(db, django_assert_num_queries):
    """
    Test that get_location_contents is efficient.
    """
    import uuid  # Import locally if needed or rely on top level

    company = Company.objects.create(
        name="LocCo", license_code=f"LOC{uuid.uuid4().hex[:4].upper()}"
    )
    loc = Location.objects.create(company=company, name="Big Warehouse", type="WAREHOUSE")

    supplier = Location.objects.create(company=company, name="Supplier", type="VIRTUAL")

    # Create 50 Bulk products with movements
    for i in range(50):
        p = ProductModel.objects.create(
            company=company, sku=f"BULK-{i}", name=f"Bulk Item {i}", profile="SIMPLE_COUNT"
        )
        Movement.objects.create(
            product_model=p,
            from_location=supplier,
            to_location=loc,
            quantity=10,
            performed_by=None,
            reason="Init",
            occurred_at="2023-01-01T00:00:00Z",
        )

    # Execution
    # Expected:
    # 1. Batches (filter)
    # 2. Physical Items (filter)
    # 3. Incoming Bulk (values.annotate)
    # 4. Outgoing Bulk (values.annotate)
    # Total: 4 queries constant, regardless of 50 products.
    with django_assert_num_queries(4):
        contents = StockService.get_location_contents(loc)

    assert len(contents) == 50
    assert contents[0]["type"] == "BULK"
    assert contents[0]["quantity"] == Decimal("10.00")


# ---------------------------------------------------------------------------
# Tests for tracking_mode-based stock calculation (all 3 paths)
# ---------------------------------------------------------------------------


@pytest.fixture
def stock_company(db):
    """Company + two locations for stock tests."""
    company = Company.objects.create(name="StkCo", license_code=f"SK{uuid.uuid4().hex[:4].upper()}")
    warehouse = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    supplier = Location.objects.create(company=company, name="Supplier", type="VIRTUAL")
    return company, warehouse, supplier


# -- BATCH tracking mode --------------------------------------------------


@pytest.mark.django_db
def test_get_stock_for_location_batch(stock_company):
    """BATCH products derive stock from ProductBatch SUM."""
    company, warehouse, _ = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="BATCH-1",
        name="Batch Product",
        profile="BATCH_TRACKED",
    )
    ProductBatch.objects.create(
        product_model=prod, location=warehouse, batch_identifier="L1", quantity=10
    )
    ProductBatch.objects.create(
        product_model=prod, location=warehouse, batch_identifier="L2", quantity=7
    )

    assert StockService.get_stock_for_location(prod, warehouse) == Decimal("17")


@pytest.mark.django_db
def test_get_stock_for_location_batch_empty(stock_company):
    """BATCH product with no batches returns 0."""
    company, warehouse, _ = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="BATCH-E",
        name="Empty Batch",
        profile="BATCH_TRACKED",
    )
    assert StockService.get_stock_for_location(prod, warehouse) == Decimal("0")


# -- INDIVIDUAL tracking mode ----------------------------------------------


@pytest.mark.django_db
def test_get_stock_for_location_individual(stock_company):
    """INDIVIDUAL products derive stock from COUNT of active PhysicalProducts."""
    company, warehouse, _ = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="SER-1",
        name="Serialized Item",
        profile="SERIALIZED",
    )
    # 3 active items
    for i in range(3):
        PhysicalProduct.objects.create(
            product_model=prod,
            location=warehouse,
            identifier=f"SN-{i}",
            status="ACTIVE",
        )
    # 1 disposed item (should not count)
    PhysicalProduct.objects.create(
        product_model=prod,
        location=warehouse,
        identifier="SN-GONE",
        status="DISPOSED",
    )

    assert StockService.get_stock_for_location(prod, warehouse) == Decimal("3")


@pytest.mark.django_db
def test_get_stock_for_location_individual_empty(stock_company):
    """INDIVIDUAL product with no items returns 0."""
    company, warehouse, _ = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="SER-E",
        name="Empty Serialized",
        profile="SERIALIZED",
    )
    assert StockService.get_stock_for_location(prod, warehouse) == Decimal("0")


# -- BULK tracking mode ----------------------------------------------------


@pytest.mark.django_db
def test_get_stock_for_location_bulk(stock_company):
    """BULK products derive stock from movement ledger aggregation."""
    company, warehouse, supplier = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="BULK-1",
        name="Bulk Item",
        profile="SIMPLE_COUNT",
    )
    Movement.objects.create(
        product_model=prod,
        from_location=supplier,
        to_location=warehouse,
        quantity=100,
        performed_by=None,
        reason="Receive",
        occurred_at="2023-01-01T00:00:00Z",
    )
    Movement.objects.create(
        product_model=prod,
        from_location=warehouse,
        to_location=supplier,
        quantity=30,
        performed_by=None,
        reason="Ship",
        occurred_at="2023-01-02T00:00:00Z",
    )

    assert StockService.get_stock_for_location(prod, warehouse) == Decimal("70")


@pytest.mark.django_db
def test_get_stock_for_location_bulk_empty(stock_company):
    """BULK product with no movements returns 0."""
    company, warehouse, _ = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="BULK-E",
        name="Empty Bulk",
        profile="SIMPLE_COUNT",
    )
    assert StockService.get_stock_for_location(prod, warehouse) == Decimal("0")


# -- get_stock_for_model with INDIVIDUAL -----------------------------------


@pytest.mark.django_db
def test_get_stock_for_model_individual(stock_company):
    """get_stock_for_model returns correct breakdown for INDIVIDUAL products."""
    company, warehouse, _ = stock_company
    warehouse2 = Location.objects.create(company=company, name="Store", type="STORE")
    prod = ProductModel.objects.create(
        company=company,
        sku="SER-M",
        name="Serialized Model",
        profile="SERIALIZED",
    )
    for i in range(5):
        PhysicalProduct.objects.create(
            product_model=prod,
            location=warehouse,
            identifier=f"WH-{i}",
            status="ACTIVE",
        )
    for i in range(3):
        PhysicalProduct.objects.create(
            product_model=prod,
            location=warehouse2,
            identifier=f"ST-{i}",
            status="ACTIVE",
        )
    # Disposed should not count
    PhysicalProduct.objects.create(
        product_model=prod,
        location=warehouse,
        identifier="WH-DEAD",
        status="DISPOSED",
    )

    result = StockService.get_stock_for_model(prod)
    assert result["total"] == Decimal("8")
    assert result["breakdown"]["Warehouse"] == Decimal("5")
    assert result["breakdown"]["Store"] == Decimal("3")


# -- get_stock_for_model with BULK ----------------------------------------


@pytest.mark.django_db
def test_get_stock_for_model_bulk(stock_company):
    """get_stock_for_model returns correct breakdown for BULK products."""
    company, warehouse, supplier = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="BULK-M",
        name="Bulk Model",
        profile="SIMPLE_COUNT",
    )
    Movement.objects.create(
        product_model=prod,
        from_location=supplier,
        to_location=warehouse,
        quantity=50,
        performed_by=None,
        reason="Receive",
        occurred_at="2023-01-01T00:00:00Z",
    )
    Movement.objects.create(
        product_model=prod,
        from_location=warehouse,
        to_location=supplier,
        quantity=10,
        performed_by=None,
        reason="Ship",
        occurred_at="2023-01-02T00:00:00Z",
    )

    result = StockService.get_stock_for_model(prod)
    assert result["total"] == Decimal("40")
    assert result["breakdown"]["Warehouse"] == Decimal("40")


# -- SERIALIZED + tracker preset: ALL statuses must count ------------------
#
# Regression guard for the user-reported "stornato" illusion: a SERIALIZED
# product carrying a tracker preset (status_transitions configured, e.g.
# BROKEN→REPAIRED) must NOT vanish from inventory when its only unit moves
# to BROKEN. ACTIVE-only counting was hiding physically-present units.


@pytest.mark.django_db
def test_get_stock_for_model_counts_all_statuses_for_tracker_preset(stock_company):
    """Tracker-preset products count units in ANY status (BROKEN included)."""
    company, warehouse, _ = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="SER-PRESET",
        name="Tracker Preset Item",
        profile="SERIALIZED",
        engine_config={"status_transitions": {"ACTIVE": ["BROKEN"], "BROKEN": ["REPAIRED"]}},
    )
    pp = PhysicalProduct.objects.create(
        product_model=prod,
        location=warehouse,
        identifier="SN-BROKE",
        status="ACTIVE",
    )
    # PhysicalProduct.status choices don't include custom preset states;
    # match strategies.execute_status_change which bypasses full_clean.
    PhysicalProduct.objects.filter(id=pp.id).update(status="BROKEN")

    result = StockService.get_stock_for_model(prod)
    assert result["total"] == Decimal("1")
    assert result["breakdown"]["Warehouse"] == Decimal("1")


@pytest.mark.django_db
def test_get_stock_for_location_counts_all_statuses_for_tracker_preset(stock_company):
    """Same widening for the per-location query path."""
    company, warehouse, _ = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="SER-PRESET-LOC",
        name="Tracker Preset Loc",
        profile="SERIALIZED",
        engine_config={"status_transitions": {"ACTIVE": ["BROKEN"], "BROKEN": ["REPAIRED"]}},
    )
    pp = PhysicalProduct.objects.create(
        product_model=prod,
        location=warehouse,
        identifier="SN-BROKE-LOC",
        status="ACTIVE",
    )
    PhysicalProduct.objects.filter(id=pp.id).update(status="BROKEN")

    assert StockService.get_stock_for_location(prod, warehouse) == Decimal("1")


@pytest.mark.django_db
def test_get_stock_for_model_keeps_active_only_for_legacy_serialized(stock_company):
    """SERIALIZED product WITHOUT a tracker preset keeps the ACTIVE-only
    filter — preserves existing SIMPLE_COUNT-style serial semantics."""
    company, warehouse, _ = stock_company
    prod = ProductModel.objects.create(
        company=company,
        sku="SER-LEGACY",
        name="Legacy Serialized",
        profile="SERIALIZED",
    )
    PhysicalProduct.objects.create(
        product_model=prod,
        location=warehouse,
        identifier="SN-OK",
        status="ACTIVE",
    )
    PhysicalProduct.objects.create(
        product_model=prod,
        location=warehouse,
        identifier="SN-DEAD",
        status="DISPOSED",
    )

    result = StockService.get_stock_for_model(prod)
    assert result["total"] == Decimal("1")
