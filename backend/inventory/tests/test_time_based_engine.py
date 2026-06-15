import pytest
import uuid
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

from core.models import Company
from inventory.models import (
    ProductModel, Location, ProductBatch, MonitoringRule,
)
from inventory.engines import TimeBasedEngine, EngineFactory


@pytest.fixture
def company(db):
    unique_code = uuid.uuid4().hex[:6].upper()
    return Company.objects.create(name="TestCo", license_code=unique_code)


@pytest.fixture
def locations(db, company):
    wh = Location.objects.create(company=company, name="Warehouse", type="WAREHOUSE")
    sup = Location.objects.create(company=company, name="Supplier", type="VIRTUAL")
    return {"warehouse": wh, "supplier": sup}


@pytest.fixture
def time_product(db, company):
    return ProductModel.objects.create(
        company=company,
        sku="MILK-001",
        name="Whole Milk",
        profile="PERISHABLE",
        engine_config={
            "time_unit": "days",
            "expiry_tracking": True,
            "auto_decrement": False,
        },
    )


@pytest.fixture
def product_no_expiry(db, company):
    return ProductModel.objects.create(
        company=company,
        sku="RENTAL-001",
        name="Rental Equipment",
        profile="PERISHABLE",
        engine_config={
            "time_unit": "hours",
            "expiry_tracking": False,
            "auto_decrement": False,
        },
    )


class FakeAdapter:
    """Mimics product adapter for engine instantiation."""
    def __init__(self, product):
        self.model = product
        self.engine_type = product.engine_type
        self.engine_config = product.engine_config


# --- Unit tests (no DB) ---

class TestTimeBasedEngineUI:
    def test_get_ui_config_with_expiry(self):
        adapter = type('P', (), {
            'engine_type': 'time_based',
            'engine_config': {"time_unit": "days", "expiry_tracking": True},
        })()
        engine = TimeBasedEngine(adapter, adapter.engine_config)
        ui = engine.get_ui_config()

        assert ui["input_type"] == "time_based"
        assert ui["time_unit"] == "days"
        assert ui["expiry_tracking"] is True
        # Phase 03: scaffolding namespaced under engine_defaults to avoid
        # being mistaken for user-configured fields.
        field_names = [f["name"] for f in ui["engine_defaults"]["fields"]]
        assert "quantity" in field_names
        assert "expiry_date" in field_names
        assert "batch_ref" in field_names
        assert "fields" not in ui

    def test_get_ui_config_no_expiry(self):
        adapter = type('P', (), {
            'engine_type': 'time_based',
            'engine_config': {"time_unit": "hours", "expiry_tracking": False},
        })()
        engine = TimeBasedEngine(adapter, adapter.engine_config)
        ui = engine.get_ui_config()

        field_names = [f["name"] for f in ui["engine_defaults"]["fields"]]
        assert "expiry_date" not in field_names
        assert "quantity" in field_names


class TestTimeBasedEngineDelta:
    def _make_engine(self, config=None):
        config = config or {"time_unit": "days", "expiry_tracking": True}
        adapter = type('P', (), {
            'engine_type': 'time_based',
            'engine_config': config,
        })()
        return TimeBasedEngine(adapter, config)

    def test_calculate_delta_add(self):
        engine = self._make_engine()
        result = engine.calculate_delta({
            "quantity": 50,
            "operation": "add",
            "expiry_date": "2026-05-01",
        })
        assert result["delta"] == 50.0
        assert result["expiry_date"] == "2026-05-01"

    def test_calculate_delta_subtract(self):
        engine = self._make_engine()
        result = engine.calculate_delta({
            "quantity": 20,
            "operation": "subtract",
        })
        assert result["delta"] == -20.0
        assert "expiry_date" not in result

    def test_calculate_delta_unknown_operation(self):
        engine = self._make_engine()
        with pytest.raises(ValueError, match="Unknown operation"):
            engine.calculate_delta({"quantity": 10, "operation": "transfer"})

    def test_calculate_delta_batch_ref(self):
        engine = self._make_engine()
        result = engine.calculate_delta({
            "quantity": 10,
            "operation": "add",
            "batch_ref": "LOT-ABC",
        })
        assert result["batch_ref"] == "LOT-ABC"

    def test_calculate_delta_no_expiry_when_tracking_off(self):
        engine = self._make_engine({"time_unit": "days", "expiry_tracking": False})
        result = engine.calculate_delta({
            "quantity": 10,
            "operation": "add",
            "expiry_date": "2026-05-01",
        })
        assert "expiry_date" not in result


class TestTimeBasedEngineTransaction:
    def _make_engine(self):
        config = {"time_unit": "days", "expiry_tracking": True}
        adapter = type('P', (), {
            'engine_type': 'time_based',
            'engine_config': config,
        })()
        return TimeBasedEngine(adapter, config)

    def test_process_transaction_add(self):
        engine = self._make_engine()
        new_stock = engine.process_transaction(100, {
            "quantity": 50,
            "operation": "add",
            "expiry_date": "2026-06-01",
        })
        assert new_stock == 150.0

    def test_process_transaction_subtract(self):
        engine = self._make_engine()
        new_stock = engine.process_transaction(100, {
            "quantity": 30,
            "operation": "subtract",
        })
        assert new_stock == 70.0

    def test_process_transaction_negative_stock_rejected(self):
        engine = self._make_engine()
        with pytest.raises(ValueError, match="cannot be negative"):
            engine.process_transaction(10, {
                "quantity": 20,
                "operation": "subtract",
            })

    def test_process_transaction_none_stock(self):
        engine = self._make_engine()
        new_stock = engine.process_transaction(None, {
            "quantity": 25,
            "operation": "add",
        })
        assert new_stock == 25.0

    def test_process_transaction_invalid_stock(self):
        engine = self._make_engine()
        new_stock = engine.process_transaction("invalid", {
            "quantity": 10,
            "operation": "add",
        })
        assert new_stock == 10.0


class TestTimeBasedEngineDisplay:
    def _make_engine(self, config=None):
        config = config or {"time_unit": "days", "expiry_tracking": False}
        adapter = type('P', (), {
            'engine_type': 'time_based',
            'engine_config': config,
            'model': None,
        })()
        return TimeBasedEngine(adapter, config)

    def test_format_integer_stock(self):
        engine = self._make_engine()
        assert engine.format_stock_display(100) == "100 units"

    def test_format_decimal_stock(self):
        engine = self._make_engine()
        assert engine.format_stock_display(99.5) == "99.50 units"

    def test_format_none_stock(self):
        engine = self._make_engine()
        assert engine.format_stock_display(None) == "0 units"

    def test_format_invalid_stock(self):
        engine = self._make_engine()
        assert engine.format_stock_display("bad") == "0 units"


# --- DB-dependent tests ---

@pytest.mark.django_db
class TestTimeBasedEngineFactory:
    def test_factory_returns_time_based_engine(self, time_product):
        adapter = FakeAdapter(time_product)
        engine = EngineFactory.get_engine(adapter)
        assert isinstance(engine, TimeBasedEngine)

    def test_product_model_accepts_time_based(self, time_product):
        assert time_product.engine_type == "time_based"
        assert time_product.pk is not None


class TestTimeBasedExpiryDisplay:
    """Tests that format_stock_display is pure — accepts pre-computed expiry data."""

    def _make_engine(self, config=None):
        config = config or {"time_unit": "days", "expiry_tracking": True}
        adapter = type('Adapter', (), {
            'engine_type': 'time_based',
            'engine_config': config,
            'model': None,
        })()
        return TimeBasedEngine(adapter, config)

    def test_format_with_expiring_dict(self):
        engine = self._make_engine()
        display = engine.format_stock_display({"value": 100, "expired": 0, "expiring_soon": 20})
        assert "100 units" in display
        assert "20 expiring in 3 days" in display

    def test_format_with_expired_dict(self):
        engine = self._make_engine()
        display = engine.format_stock_display({"value": 15, "expired": 15, "expiring_soon": 0})
        assert "15 units" in display
        assert "15 expired" in display

    def test_format_with_both_expired_and_expiring(self):
        engine = self._make_engine()
        display = engine.format_stock_display({"value": 50, "expired": 10, "expiring_soon": 5})
        assert "50 units" in display
        assert "10 expired" in display
        assert "5 expiring in 3 days" in display

    def test_format_dict_no_expiry(self):
        engine = self._make_engine()
        display = engine.format_stock_display({"value": 100, "expired": 0, "expiring_soon": 0})
        assert display == "100 units"

    def test_format_numeric_no_expiry_breakdown(self):
        """Numeric input renders without expiry breakdown (pure, no DB query)."""
        engine = self._make_engine()
        display = engine.format_stock_display(100)
        assert display == "100 units"

    def test_format_hours_unit(self):
        engine = self._make_engine({"time_unit": "hours", "expiry_tracking": True})
        display = engine.format_stock_display({"value": 30, "expired": 0, "expiring_soon": 10})
        assert "10 expiring in 72 hours" in display


@pytest.mark.django_db
class TestTimeBasedExpiryDisplayIntegration:
    """Integration tests: StockService computes expiry data, engine formats it."""

    def test_get_expiry_display_data_with_batches(self, time_product, locations):
        from inventory.services.stock import StockService
        now = timezone.now()
        ProductBatch.objects.create(
            product_model=time_product,
            location=locations["warehouse"],
            batch_identifier="LOT-SOON",
            quantity=Decimal("20"),
            data={"expiry_date": (now + timedelta(days=2)).isoformat()},
        )
        ProductBatch.objects.create(
            product_model=time_product,
            location=locations["warehouse"],
            batch_identifier="LOT-LATER",
            quantity=Decimal("80"),
            data={"expiry_date": (now + timedelta(days=30)).isoformat()},
        )

        data = StockService.get_expiry_display_data(time_product, {"time_unit": "days"})
        assert data["value"] == 100.0
        assert data["expiring_soon"] == 20
        assert data["expired"] == 0

        adapter = FakeAdapter(time_product)
        engine = TimeBasedEngine(adapter, adapter.engine_config)
        display = engine.format_stock_display(data)
        assert "100 units" in display
        assert "20 expiring in 3 days" in display

    def test_get_expiry_display_data_with_expired(self, time_product, locations):
        from inventory.services.stock import StockService
        now = timezone.now()
        ProductBatch.objects.create(
            product_model=time_product,
            location=locations["warehouse"],
            batch_identifier="LOT-EXPIRED",
            quantity=Decimal("15"),
            data={"expiry_date": (now - timedelta(days=1)).isoformat()},
        )

        data = StockService.get_expiry_display_data(time_product, {"time_unit": "days"})
        assert data["expired"] == 15

        adapter = FakeAdapter(time_product)
        engine = TimeBasedEngine(adapter, adapter.engine_config)
        display = engine.format_stock_display(data)
        assert "15 units" in display
        assert "15 expired" in display


@pytest.mark.django_db
class TestTimeBasedMonitoringRules:
    def test_ensure_monitoring_rules_creates_rule(self, time_product):
        adapter = FakeAdapter(time_product)
        engine = TimeBasedEngine(adapter, adapter.engine_config)
        rule = engine.ensure_monitoring_rules()

        assert rule is not None
        assert rule.trigger_type == "DATE_OFFSET"
        assert rule.severity == "WARNING"
        assert rule.condition_config["field"] == "expiry_date"
        assert rule.condition_config["offset_value"] == 3
        assert rule.product_model == time_product

    def test_ensure_monitoring_rules_idempotent(self, time_product):
        adapter = FakeAdapter(time_product)
        engine = TimeBasedEngine(adapter, adapter.engine_config)
        rule1 = engine.ensure_monitoring_rules()
        rule2 = engine.ensure_monitoring_rules()
        assert rule1.pk == rule2.pk
        assert MonitoringRule.objects.filter(product_model=time_product).count() == 1

    def test_no_rule_when_expiry_off(self, product_no_expiry):
        adapter = FakeAdapter(product_no_expiry)
        engine = TimeBasedEngine(adapter, adapter.engine_config)
        rule = engine.ensure_monitoring_rules()
        assert rule is None

    def test_hours_unit_monitoring_rule(self, company):
        product = ProductModel.objects.create(
            company=company,
            sku="HOURLY-001",
            name="Hourly Rental",
            profile="PERISHABLE",
            engine_config={"time_unit": "hours", "expiry_tracking": True},
        )
        adapter = FakeAdapter(product)
        engine = TimeBasedEngine(adapter, adapter.engine_config)
        rule = engine.ensure_monitoring_rules()
        assert rule.condition_config["offset_value"] == 72
        assert rule.condition_config["offset_unit"] == "hours"
