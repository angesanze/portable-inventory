import pytest
import uuid

from core.models import Company
from inventory.models import ProductModel, Location, CalculatorTemplate
from inventory.engines import (
    BaseEngine, EngineFactory, CounterEngine, ConverterEngine,
    BucketEngine, DimensionEngine, TimeBasedEngine, TrackerEngine,
)
from inventory.serializers import ProductModelSerializer, CalculatorTemplateSerializer


@pytest.fixture
def company(db):
    unique_code = uuid.uuid4().hex[:6].upper()
    return Company.objects.create(name="TestCo", license_code=unique_code)


# --- Engine CONFIG_SCHEMA validation tests ---

class TestEngineConfigValidation:
    """Test CONFIG_SCHEMA validation on engine classes."""

    def test_counter_valid_config(self):
        errors = CounterEngine.validate_config({"allow_negative": True, "step": 5})
        assert errors == []

    def test_counter_invalid_type(self):
        errors = CounterEngine.validate_config({"allow_negative": "yes"})
        assert len(errors) == 1
        assert "allow_negative" in errors[0]

    def test_dimension_valid_config(self):
        config = {"dimensions": ["length", "width"], "unit": "m", "formula": "length * width"}
        errors = DimensionEngine.validate_config(config)
        assert errors == []

    def test_dimension_missing_required(self):
        errors = DimensionEngine.validate_config({"unit": "m"})
        assert any("dimensions" in e for e in errors)
        assert any("formula" in e for e in errors)

    def test_dimension_wrong_type(self):
        config = {"dimensions": "not_a_list", "unit": "m", "formula": "x"}
        errors = DimensionEngine.validate_config(config)
        assert any("dimensions" in e and "array" in e for e in errors)

    def test_time_based_valid_config(self):
        config = {"time_unit": "days", "expiry_tracking": True}
        errors = TimeBasedEngine.validate_config(config)
        assert errors == []

    def test_time_based_missing_required(self):
        errors = TimeBasedEngine.validate_config({})
        assert any("time_unit" in e for e in errors)

    def test_time_based_invalid_enum(self):
        errors = TimeBasedEngine.validate_config({"time_unit": "seconds"})
        assert any("time_unit" in e and "seconds" in e for e in errors)

    def test_tracker_valid_config(self):
        config = {"status_transitions": {"ACTIVE": ["IN_USE"]}}
        errors = TrackerEngine.validate_config(config)
        assert errors == []

    def test_tracker_wrong_type(self):
        errors = TrackerEngine.validate_config({"status_transitions": "not_a_dict"})
        assert any("status_transitions" in e for e in errors)


class TestReturnsNumericDelta:
    """Test returns_numeric_delta class attribute on all engines."""

    def test_numeric_engines_return_true(self):
        for cls in (CounterEngine, ConverterEngine, BucketEngine, DimensionEngine):
            assert cls.returns_numeric_delta is True, f"{cls.__name__} should have returns_numeric_delta=True"

    def test_non_numeric_engines_return_false(self):
        for cls in (TrackerEngine, TimeBasedEngine):
            assert cls.returns_numeric_delta is False, f"{cls.__name__} should have returns_numeric_delta=False"

    def test_base_engine_default_is_true(self):
        assert BaseEngine.returns_numeric_delta is True

    def test_factory_engines_have_attribute(self):
        """Every engine registered in EngineFactory has returns_numeric_delta."""
        for engine_type, engine_cls in EngineFactory._engines.items():
            assert hasattr(engine_cls, 'returns_numeric_delta'), (
                f"Engine '{engine_type}' ({engine_cls.__name__}) missing returns_numeric_delta"
            )


class TestEngineFactoryValidation:
    """Test EngineFactory.validate_config dispatch."""

    def test_factory_routes_to_engine(self):
        errors = EngineFactory.validate_config("dimension", {"dimensions": ["l"], "unit": "m", "formula": "l"})
        assert errors == []

    def test_factory_unknown_engine(self):
        errors = EngineFactory.validate_config("nonexistent", {})
        assert len(errors) == 1
        assert "Unknown engine type" in errors[0]

    def test_factory_returns_errors(self):
        errors = EngineFactory.validate_config("time_based", {"time_unit": "milliseconds"})
        assert len(errors) > 0


class TestProfileEngineDispatch:
    """Test EngineFactory.get_engine_for_profile dispatches correctly."""

    def test_all_profiles_resolve(self, company):
        """Every profile in _profile_registry produces an engine instance."""
        for profile, expected_cls in EngineFactory._profile_registry.items():
            pm = ProductModel(
                company=company, sku=f"P-{profile}", name=f"Test {profile}",
                profile=profile, engine_config={},
            )
            engine = EngineFactory.get_engine_for_profile(pm)
            assert isinstance(engine, expected_cls), (
                f"Profile '{profile}' should produce {expected_cls.__name__}, got {type(engine).__name__}"
            )

    def test_model_property_self_reference(self, company):
        """ProductModel.model returns self for adapter compatibility."""
        pm = ProductModel(company=company, sku="S", name="S", profile="SIMPLE_COUNT")
        assert pm.model is pm

    def test_unit_conversion_returns_converter(self, company):
        """UNIT_CONVERSION profile dispatches to ConverterEngine."""
        pm = ProductModel(
            company=company, sku="CONV", name="Converter",
            profile="UNIT_CONVERSION", engine_config={},
        )
        engine = EngineFactory.get_engine_for_profile(pm)
        assert isinstance(engine, ConverterEngine)

    def test_simple_count_returns_counter(self, company):
        pm = ProductModel(company=company, sku="SC", name="SC", profile="SIMPLE_COUNT", engine_config={})
        engine = EngineFactory.get_engine_for_profile(pm)
        assert isinstance(engine, CounterEngine)

    def test_serialized_returns_tracker(self, company):
        pm = ProductModel(company=company, sku="SR", name="SR", profile="SERIALIZED", engine_config={})
        engine = EngineFactory.get_engine_for_profile(pm)
        assert isinstance(engine, TrackerEngine)

    def test_perishable_returns_time_based(self, company):
        pm = ProductModel(company=company, sku="PR", name="PR", profile="PERISHABLE", engine_config={"time_unit": "days"})
        engine = EngineFactory.get_engine_for_profile(pm)
        assert isinstance(engine, TimeBasedEngine)


class TestSerializerEngineConfigValidation:
    """Test serializer-level engine_config validation."""

    def test_product_serializer_rejects_bad_config(self, company):
        data = {
            "sku": "TEST-DIM",
            "name": "Test Dimension Product",
            "profile": "DIMENSIONAL",
            "engine_config": {"unit": "m"},  # missing dimensions and formula
            "company": str(company.id),
        }
        serializer = ProductModelSerializer(data=data)
        assert not serializer.is_valid()
        assert "engine_config" in serializer.errors

    def test_product_serializer_accepts_good_config(self, company):
        data = {
            "sku": "TEST-DIM-OK",
            "name": "Test Dimension Product OK",
            "profile": "DIMENSIONAL",
            "engine_config": {"dimensions": ["l", "w"], "unit": "m", "formula": "l * w"},
            "company": str(company.id),
        }
        serializer = ProductModelSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_product_serializer_accepts_empty_config(self, company):
        data = {
            "sku": "TEST-COUNTER",
            "name": "Test Counter",
            "profile": "SIMPLE_COUNT",
            "engine_config": {},
            "company": str(company.id),
        }
        serializer = ProductModelSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_calculator_serializer_rejects_bad_config(self, company):
        data = {
            "name": "Bad Template",
            "engine_type": "time_based",
            "engine_config": {"time_unit": "centuries"},
            "company": str(company.id),
        }
        serializer = CalculatorTemplateSerializer(data=data)
        assert not serializer.is_valid()
        assert "engine_config" in serializer.errors

    def test_calculator_serializer_accepts_good_config(self, company):
        data = {
            "name": "Good Template",
            "engine_type": "time_based",
            "engine_config": {"time_unit": "hours", "expiry_tracking": True},
            "company": str(company.id),
        }
        serializer = CalculatorTemplateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
