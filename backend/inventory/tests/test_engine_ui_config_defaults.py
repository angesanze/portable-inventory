"""Phase 03 — engine.get_ui_config() must not leak hardcoded defaults.

Each engine's get_ui_config() returns intrinsic keys (input_type, etc.) plus
user-configured values. Hardcoded defaults that look like user data
(TrackerEngine's status_transitions, field lists) must NOT appear unless the
product explicitly opts in.
"""
import uuid
import pytest
from rest_framework.test import APIClient

from core.models import Company, ApiKey
from inventory.models import ProductModel, Location
from inventory.engines import (
    CounterEngine,
    ConverterEngine,
    BucketEngine,
    TrackerEngine,
    DimensionEngine,
    TimeBasedEngine,
)


class FakeProduct:
    def __init__(self, attributes=None):
        self.attributes = attributes or {}


@pytest.fixture
def company(db):
    return Company.objects.create(name="UICfgCo", license_code=uuid.uuid4().hex[:6].upper())


# ---------- TrackerEngine ----------

class TestTrackerEngineDefaults:
    def test_no_config_returns_only_input_type(self):
        engine = TrackerEngine(FakeProduct(), {})
        assert engine.get_ui_config() == {"input_type": "tracker"}

    def test_user_status_transitions_appear(self):
        custom = {"ACTIVE": ["BROKEN"], "BROKEN": []}
        engine = TrackerEngine(FakeProduct(), {"status_transitions": custom})
        ui = engine.get_ui_config()
        assert ui["status_transitions"] == custom
        assert "fields" not in ui

    def test_user_fields_from_attributes_appear(self):
        fields = [{"name": "warranty", "type": "text", "label": "Warranty"}]
        engine = TrackerEngine(FakeProduct(attributes={"fields": fields}), {})
        ui = engine.get_ui_config()
        assert ui["fields"] == fields
        assert "status_transitions" not in ui

    def test_empty_status_transitions_does_not_appear(self):
        engine = TrackerEngine(FakeProduct(), {"status_transitions": {}})
        ui = engine.get_ui_config()
        assert "status_transitions" not in ui

    def test_no_default_fields_leak(self):
        """The canonical [physical_product_id, new_status, notes] triple must
        NOT appear in the engine output. The widget renders that layout itself.
        """
        engine = TrackerEngine(FakeProduct(), {})
        ui = engine.get_ui_config()
        assert "fields" not in ui


# ---------- CounterEngine ----------

class TestCounterEngineDefaults:
    def test_no_config_returns_intrinsic_keys(self):
        engine = CounterEngine(FakeProduct(), {})
        ui = engine.get_ui_config()
        assert ui["input_type"] == "number"
        assert set(ui.keys()) == {"input_type", "allow_negative", "step", "input_label"}

    def test_user_step_appears(self):
        engine = CounterEngine(FakeProduct(), {"step": 5, "input_label": "Pieces"})
        ui = engine.get_ui_config()
        assert ui["step"] == 5.0
        assert ui["input_label"] == "Pieces"


# ---------- ConverterEngine ----------

class TestConverterEngineDefaults:
    def test_no_config_returns_intrinsic_keys(self):
        engine = ConverterEngine(FakeProduct(), {})
        ui = engine.get_ui_config()
        assert ui["input_type"] == "number"
        assert set(ui.keys()) == {"input_type", "input_label", "step"}

    def test_user_values_appear(self):
        engine = ConverterEngine(FakeProduct(), {"input_label": "Liters", "precision": 0.5})
        ui = engine.get_ui_config()
        assert ui["input_label"] == "Liters"
        assert ui["step"] == 0.5


# ---------- BucketEngine ----------

class TestBucketEngineDefaults:
    def test_no_config_returns_intrinsic_keys_with_empty_fields(self):
        engine = BucketEngine(FakeProduct(), {})
        ui = engine.get_ui_config()
        assert ui["input_type"] == "bucket_form"
        assert ui["fields"] == []
        assert ui["allocation_strategy"] == "MANUAL"

    def test_user_fields_appear(self):
        fields = [{"name": "lot", "type": "text", "label": "Lot"}]
        engine = BucketEngine(FakeProduct(), {"fields": fields})
        ui = engine.get_ui_config()
        assert ui["fields"] == fields


# ---------- DimensionEngine ----------

class TestDimensionEngineDefaults:
    def test_no_config_returns_empty_derived_fields(self):
        engine = DimensionEngine(FakeProduct(), {})
        ui = engine.get_ui_config()
        assert ui["input_type"] == "dimension"
        assert ui["fields"] == []
        assert ui["formula"] == ""

    def test_user_dimensions_become_fields(self):
        engine = DimensionEngine(FakeProduct(), {
            "dimensions": ["length", "width"],
            "unit": "m",
            "formula": "length * width",
            "computed_unit": "m^2",
        })
        ui = engine.get_ui_config()
        names = [f["name"] for f in ui["fields"]]
        assert names == ["length", "width"]
        assert ui["formula"] == "length * width"
        assert ui["computed_unit"] == "m^2"


# ---------- TimeBasedEngine ----------

class TestTimeBasedEngineDefaults:
    def test_scaffolding_namespaced_under_engine_defaults(self):
        """Field scaffolding moved under engine_defaults so it's not mistaken
        for user-configured fields."""
        engine = TimeBasedEngine(FakeProduct(), {"time_unit": "days"})
        ui = engine.get_ui_config()
        assert ui["input_type"] == "time_based"
        assert ui["time_unit"] == "days"
        assert "fields" not in ui
        assert "engine_defaults" in ui
        scaffold = ui["engine_defaults"]["fields"]
        names = [f["name"] for f in scaffold]
        assert "quantity" in names
        assert "expiry_date" in names
        assert "batch_ref" in names

    def test_expiry_tracking_disabled_skips_date_field(self):
        engine = TimeBasedEngine(FakeProduct(), {"time_unit": "days", "expiry_tracking": False})
        ui = engine.get_ui_config()
        names = [f["name"] for f in ui["engine_defaults"]["fields"]]
        assert "expiry_date" not in names


# ---------- Integration: widget API ----------

@pytest.mark.django_db
class TestWidgetApiSerializedDefaults:
    """SERIALIZED product with no preset → calc_config.status_transitions is None."""

    def test_no_preset_no_status_transitions_leak(self, company):
        product = ProductModel.objects.create(
            company=company,
            sku="UICFG-001",
            name="Tracker No Preset",
            profile="SERIALIZED",
            engine_config={},
        )
        Location.objects.create(company=company, name="WH", type="WAREHOUSE")
        api_key = ApiKey.objects.create(company=company, label="t", key=uuid.uuid4().hex)

        client = APIClient()
        resp = client.get(f"/api/v1/widget/{product.id}/?api_key={api_key.key}")
        assert resp.status_code == 200
        data = resp.json()

        assert data["calc_config"]["status_transitions"] is None
        ui = data["calc_config"]["ui_config"]
        assert ui["input_type"] == "tracker"
        assert "status_transitions" not in ui
        assert "fields" not in ui
