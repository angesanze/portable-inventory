import pytest
import uuid

from inventory.engines import DimensionEngine, SafeFormulaParser, EngineFactory
from inventory.models import ProductModel
from core.models import Company


# --- Unit tests for SafeFormulaParser (no DB needed) ---


class TestSafeFormulaParser:
    def test_simple_addition(self):
        p = SafeFormulaParser({"a": 2, "b": 3})
        assert p.parse("a + b") == 5.0

    def test_simple_multiplication(self):
        p = SafeFormulaParser({"length": 10, "width": 5})
        assert p.parse("length * width") == 50.0

    def test_mixed_operations(self):
        p = SafeFormulaParser({"l": 4, "w": 3, "h": 2})
        assert p.parse("l * w * h") == 24.0

    def test_parentheses(self):
        p = SafeFormulaParser({"a": 2, "b": 3, "c": 4})
        assert p.parse("(a + b) * c") == 20.0

    def test_division(self):
        p = SafeFormulaParser({"a": 10, "b": 4})
        assert p.parse("a / b") == 2.5

    def test_division_by_zero(self):
        p = SafeFormulaParser({"a": 10, "b": 0})
        with pytest.raises(ValueError, match="Division by zero"):
            p.parse("a / b")

    def test_negation(self):
        p = SafeFormulaParser({"x": 5})
        assert p.parse("-x") == -5.0

    def test_numeric_literal(self):
        p = SafeFormulaParser({"x": 5})
        assert p.parse("x * 2") == 10.0

    def test_complex_formula(self):
        p = SafeFormulaParser({"r": 3})
        # pi approximation: 3.14 * r * r
        assert p.parse("3.14 * r * r") == pytest.approx(28.26)

    def test_unknown_variable(self):
        p = SafeFormulaParser({"x": 1})
        with pytest.raises(ValueError, match="Unknown variable"):
            p.parse("x + y")

    def test_invalid_characters(self):
        p = SafeFormulaParser({"x": 1})
        with pytest.raises(ValueError):
            p.parse("x; import os")

    def test_reject_code_injection_underscore(self):
        p = SafeFormulaParser({"x": 1})
        with pytest.raises(ValueError):
            p.parse("__import__('os')")

    def test_reject_code_injection_eval(self):
        p = SafeFormulaParser({"x": 1})
        # 'eval' would be parsed as a variable, not found -> error
        with pytest.raises(ValueError):
            p.parse("eval('1+1')")

    def test_empty_expression(self):
        p = SafeFormulaParser({})
        with pytest.raises(ValueError):
            p.parse("")

    def test_nested_parentheses(self):
        p = SafeFormulaParser({"a": 2, "b": 3})
        assert p.parse("((a + b) * (a - b))") == -5.0

    def test_subtraction(self):
        p = SafeFormulaParser({"a": 10, "b": 3})
        assert p.parse("a - b") == 7.0


# --- DimensionEngine unit tests (no DB) ---


class TestDimensionEngineUnit:
    def _make_engine(self, config=None):
        """Create DimensionEngine with mock product."""
        if config is None:
            config = {
                "dimensions": ["length", "width"],
                "unit": "m",
                "formula": "length * width",
                "computed_unit": "m²",
            }

        class MockProduct:
            engine_type = "dimension"
            engine_config = config

        return DimensionEngine(MockProduct(), config)

    def test_get_ui_config(self):
        engine = self._make_engine()
        ui = engine.get_ui_config()
        assert ui["input_type"] == "dimension"
        assert len(ui["fields"]) == 2
        assert ui["fields"][0]["name"] == "length"
        assert ui["fields"][1]["name"] == "width"
        assert ui["computed_unit"] == "m²"
        assert ui["formula"] == "length * width"

    def test_calculate_delta_add(self):
        engine = self._make_engine()
        delta = engine.calculate_delta({"length": 10, "width": 5, "operation": "add"})
        assert delta == 50.0

    def test_calculate_delta_subtract(self):
        engine = self._make_engine()
        delta = engine.calculate_delta({"length": 3, "width": 4, "operation": "subtract"})
        assert delta == -12.0

    def test_calculate_delta_missing_dimension(self):
        engine = self._make_engine()
        with pytest.raises(ValueError, match="Missing dimension value"):
            engine.calculate_delta({"length": 5, "operation": "add"})

    def test_calculate_delta_unknown_operation(self):
        engine = self._make_engine()
        with pytest.raises(ValueError, match="Unknown operation"):
            engine.calculate_delta({"length": 5, "width": 5, "operation": "multiply"})

    def test_process_transaction_add(self):
        engine = self._make_engine()
        result = engine.process_transaction(100.0, {"length": 5, "width": 3, "operation": "add"})
        assert result == 115.0

    def test_process_transaction_subtract(self):
        engine = self._make_engine()
        result = engine.process_transaction(
            50.0, {"length": 2, "width": 5, "operation": "subtract"}
        )
        assert result == 40.0

    def test_process_transaction_none_stock(self):
        engine = self._make_engine()
        result = engine.process_transaction(None, {"length": 3, "width": 3, "operation": "add"})
        assert result == 9.0

    def test_format_stock_display_integer(self):
        engine = self._make_engine()
        assert engine.format_stock_display(45) == "45 m²"

    def test_format_stock_display_decimal(self):
        engine = self._make_engine()
        assert engine.format_stock_display(45.23) == "45.23 m²"

    def test_format_stock_display_none(self):
        engine = self._make_engine()
        assert engine.format_stock_display(None) == "0 m²"

    def test_volume_formula(self):
        config = {
            "dimensions": ["length", "width", "height"],
            "unit": "m",
            "formula": "length * width * height",
            "computed_unit": "m³",
        }
        engine = self._make_engine(config)
        delta = engine.calculate_delta({"length": 2, "width": 3, "height": 4, "operation": "add"})
        assert delta == 24.0
        assert engine.format_stock_display(24.0) == "24 m³"

    def test_complex_formula(self):
        """Test formula with addition inside: e.g. perimeter = 2 * (l + w)."""
        config = {
            "dimensions": ["l", "w"],
            "unit": "m",
            "formula": "2 * (l + w)",
            "computed_unit": "m",
        }
        engine = self._make_engine(config)
        delta = engine.calculate_delta({"l": 5, "w": 3, "operation": "add"})
        assert delta == 16.0

    def test_no_formula_raises(self):
        config = {"dimensions": ["x"], "unit": "m", "formula": ""}
        engine = self._make_engine(config)
        with pytest.raises(ValueError, match="No formula configured"):
            engine.calculate_delta({"x": 1, "operation": "add"})


# --- Integration tests with DB ---


@pytest.fixture
def company(db):
    unique_code = uuid.uuid4().hex[:6].upper()
    return Company.objects.create(name="TestCo", license_code=unique_code)


@pytest.fixture
def dimension_product(company):
    return ProductModel.objects.create(
        company=company,
        sku=f"FABRIC-{uuid.uuid4().hex[:6]}",
        name="Fabric Roll",
        profile="DIMENSIONAL",
        engine_config={
            "dimensions": ["length", "width"],
            "unit": "m",
            "formula": "length * width",
            "computed_unit": "m²",
        },
    )


@pytest.mark.django_db
class TestDimensionEngineIntegration:
    def test_engine_factory_creates_dimension(self, dimension_product):
        engine = EngineFactory.get_engine(dimension_product)
        assert isinstance(engine, DimensionEngine)

    def test_full_transaction_flow(self, dimension_product):
        engine = EngineFactory.get_engine(dimension_product)

        # Start at 0, add 10m x 5m = 50 m²
        stock = engine.process_transaction(0, {"length": 10, "width": 5, "operation": "add"})
        assert stock == 50.0

        # Subtract 3m x 2m = 6 m²
        stock = engine.process_transaction(
            stock, {"length": 3, "width": 2, "operation": "subtract"}
        )
        assert stock == 44.0

        display = engine.format_stock_display(stock)
        assert display == "44 m²"

    def test_product_model_dimension_engine_type(self, dimension_product):
        assert dimension_product.engine_type == "dimension"
        assert dimension_product.engine_config["formula"] == "length * width"
