import pytest
import uuid
from decimal import Decimal

from core.models import Company
from inventory.models import ProductModel, Location, PhysicalProduct
from inventory.engines import TrackerEngine, EngineFactory
from inventory.strategies import TrackerStatusBehavior


@pytest.fixture
def company(db):
    return Company.objects.create(name="TestCo", license_code=uuid.uuid4().hex[:6].upper())


@pytest.fixture
def locations(db, company):
    wh = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    ext = Location.objects.create(company=company, name="External", type="VIRTUAL")
    return {"warehouse": wh, "external": ext}


@pytest.fixture
def tracker_product(db, company):
    return ProductModel.objects.create(
        company=company,
        sku="LAPTOP-001",
        name="Laptop",
        profile="SERIALIZED",
        engine_config={},
    )


@pytest.fixture
def physical_items(db, tracker_product, locations):
    items = []
    for i in range(5):
        items.append(PhysicalProduct.objects.create(
            product_model=tracker_product,
            identifier=f"SN-{i:04d}",
            status="ACTIVE",
            location=locations["warehouse"],
        ))
    return items


@pytest.fixture
def engine(tracker_product):
    """Create TrackerEngine with product adapter-like object."""
    class FakeAdapter:
        def __init__(self, product):
            self.model = product
            self.engine_type = "tracker"
            self.engine_config = product.engine_config
            self.attributes = product.attributes
    adapter = FakeAdapter(tracker_product)
    return TrackerEngine(adapter, adapter.engine_config)


@pytest.mark.django_db
class TestTrackerEngineUIConfig:
    """Phase 03 contract: intrinsic-only output. No engine-default leakage."""

    def test_get_ui_config_intrinsic_only_when_unconfigured(self, engine):
        """No engine_config, no attributes.fields → only input_type."""
        config = engine.get_ui_config()
        assert config == {"input_type": "tracker"}
        assert "fields" not in config
        assert "status_transitions" not in config

    def test_custom_transitions_from_config(self, tracker_product):
        custom = {"ACTIVE": ["DISPOSED"], "DISPOSED": []}
        tracker_product.engine_config = {"status_transitions": custom}
        tracker_product.save()

        class FakeAdapter:
            def __init__(self, p):
                self.model = p
                self.engine_type = "tracker"
                self.engine_config = p.engine_config
                self.attributes = p.attributes

        eng = TrackerEngine(FakeAdapter(tracker_product), tracker_product.engine_config)
        config = eng.get_ui_config()
        assert config["status_transitions"] == custom
        assert "fields" not in config

    def test_fields_only_when_attributes_set(self, tracker_product):
        """`fields` surfaces only from product `attributes.fields`."""
        custom_fields = [{"name": "warranty_id", "type": "text", "label": "Warranty"}]
        tracker_product.attributes = {"fields": custom_fields}
        tracker_product.save()

        class FakeAdapter:
            def __init__(self, p):
                self.model = p
                self.engine_type = "tracker"
                self.engine_config = p.engine_config
                self.attributes = p.attributes

        eng = TrackerEngine(FakeAdapter(tracker_product), tracker_product.engine_config)
        config = eng.get_ui_config()
        assert config["fields"] == custom_fields


@pytest.mark.django_db
class TestTrackerEngineDelta:
    def test_calculate_delta_returns_metadata(self, engine, physical_items):
        item = physical_items[0]
        delta = engine.calculate_delta({
            "physical_product_id": str(item.id),
            "new_status": "IN_USE",
            "notes": "Assigned to dev team",
        })
        assert delta["type"] == "status_change"
        assert delta["new_status"] == "IN_USE"
        assert delta["notes"] == "Assigned to dev team"

    def test_calculate_delta_rejects_invalid_status(self, engine):
        with pytest.raises(ValueError, match="Invalid status"):
            engine.calculate_delta({
                "physical_product_id": "fake-id",
                "new_status": "NONEXISTENT",
            })


@pytest.mark.django_db
class TestTrackerEngineTransactions:
    """Tests for pure TrackerEngine.process_transaction() — no DB access."""

    def test_valid_transition_active_to_in_use(self, engine, physical_items):
        item = physical_items[0]
        result = engine.process_transaction(
            {"current_status": "ACTIVE"},
            {"physical_product_id": str(item.id), "new_status": "IN_USE"},
        )
        assert result["old_status"] == "ACTIVE"
        assert result["new_status"] == "IN_USE"
        assert result["physical_product_id"] == str(item.id)

    def test_valid_transition_in_use_to_returned(self, engine, physical_items):
        item = physical_items[0]
        result = engine.process_transaction(
            {"current_status": "IN_USE"},
            {"physical_product_id": str(item.id), "new_status": "RETURNED"},
        )
        assert result["new_status"] == "RETURNED"

    def test_valid_transition_returned_to_active(self, engine, physical_items):
        item = physical_items[0]
        result = engine.process_transaction(
            {"current_status": "RETURNED"},
            {"physical_product_id": str(item.id), "new_status": "ACTIVE"},
        )
        assert result["new_status"] == "ACTIVE"

    def test_invalid_transition_active_to_returned(self, engine, physical_items):
        item = physical_items[0]
        with pytest.raises(ValueError, match="Cannot transition"):
            engine.process_transaction(
                {"current_status": "ACTIVE"},
                {"physical_product_id": str(item.id), "new_status": "RETURNED"},
            )

    def test_invalid_transition_disposed_to_active(self, engine, physical_items):
        item = physical_items[0]
        with pytest.raises(ValueError, match="Cannot transition"):
            engine.process_transaction(
                {"current_status": "DISPOSED"},
                {"physical_product_id": str(item.id), "new_status": "ACTIVE"},
            )

    def test_invalid_transition_expired_to_active(self, engine, physical_items):
        item = physical_items[0]
        with pytest.raises(ValueError, match="Cannot transition"):
            engine.process_transaction(
                {"current_status": "EXPIRED"},
                {"physical_product_id": str(item.id), "new_status": "ACTIVE"},
            )

    def test_missing_physical_product_id(self, engine):
        with pytest.raises(ValueError, match="physical_product_id is required"):
            engine.process_transaction(
                {"current_status": "ACTIVE"},
                {"new_status": "IN_USE"},
            )

    def test_missing_current_status(self, engine, physical_items):
        item = physical_items[0]
        with pytest.raises(ValueError, match="current_stock must be a dict"):
            engine.process_transaction(
                {},
                {"physical_product_id": str(item.id), "new_status": "IN_USE"},
            )


@pytest.mark.django_db
class TestTrackerStatusBehavior:
    """Integration tests: TrackerStatusBehavior orchestrates DB + engine."""

    def test_execute_status_change_updates_db(self, engine, physical_items):
        item = physical_items[0]
        result = TrackerStatusBehavior.execute_status_change(engine, {
            "physical_product_id": str(item.id),
            "new_status": "IN_USE",
        })
        item.refresh_from_db()
        assert item.status == "IN_USE"
        assert isinstance(result, dict)

    def test_execute_status_change_returns_counts(self, engine, physical_items):
        """After transitioning one item, counts reflect the change."""
        item = physical_items[0]
        result = TrackerStatusBehavior.execute_status_change(engine, {
            "physical_product_id": str(item.id),
            "new_status": "IN_USE",
        })
        # 5 items total: 4 ACTIVE, 1 IN_USE
        assert result.get("ACTIVE", 0) == 4
        assert result.get("IN_USE", 0) == 1

    def test_nonexistent_physical_product(self, engine):
        from inventory.exceptions import ItemNotFoundError
        with pytest.raises(ItemNotFoundError, match="Physical product not found"):
            TrackerStatusBehavior.execute_status_change(engine, {
                "physical_product_id": str(uuid.uuid4()),
                "new_status": "IN_USE",
            })

    def test_invalid_transition_via_strategy(self, engine, physical_items):
        item = physical_items[0]
        with pytest.raises(ValueError, match="Cannot transition"):
            TrackerStatusBehavior.execute_status_change(engine, {
                "physical_product_id": str(item.id),
                "new_status": "RETURNED",
            })


@pytest.mark.django_db
class TestTrackerEngineDisplay:
    def test_format_stock_display_dict(self, engine):
        stock = {"ACTIVE": 12, "IN_USE": 3, "EXPIRED": 1}
        display = engine.format_stock_display(stock)
        assert "12 active" in display
        assert "3 in-use" in display
        assert "1 expired" in display

    def test_format_stock_display_empty(self, engine):
        assert engine.format_stock_display({}) == "0 items"

    def test_format_stock_display_numeric_fallback(self, engine):
        """Numeric input renders as plain count (no DB query)."""
        display = engine.format_stock_display(5)
        assert display == "5 items"

    def test_format_stock_display_zero(self, engine):
        assert engine.format_stock_display(0) == "0 items"

    def test_format_stock_display_skips_zero_counts(self, engine):
        stock = {"ACTIVE": 5, "IN_USE": 0, "EXPIRED": 0}
        display = engine.format_stock_display(stock)
        assert "5 active" in display
        assert "in-use" not in display
        assert "expired" not in display


@pytest.mark.django_db
class TestTrackerStatusCountsIntegration:
    """Integration: StockService computes status counts, engine formats them."""

    def test_get_tracker_status_counts(self, engine, physical_items):
        from inventory.services.stock import StockService
        product_model = physical_items[0].product_model
        counts = StockService.get_tracker_status_counts(product_model)
        assert counts.get('ACTIVE', 0) == 5

        display = engine.format_stock_display(counts)
        assert "5 active" in display

    def test_get_tracker_status_counts_empty(self, tracker_product):
        from inventory.services.stock import StockService
        counts = StockService.get_tracker_status_counts(tracker_product)
        assert counts == {}


@pytest.mark.django_db
class TestEngineFactoryTracker:
    def test_factory_returns_tracker_engine(self, tracker_product):
        engine = EngineFactory.get_engine_for_profile(tracker_product)
        assert isinstance(engine, TrackerEngine)
