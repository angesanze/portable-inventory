"""Numeric-delta engines: Counter, Converter, Dimension."""
from typing import Any, Dict, Optional

from .base import BaseEngine
from .formula import SafeFormulaParser


class CounterEngine(BaseEngine):
    """
    Engine for simple numeric counting (Incremental/Decremental).
    """
    CONFIG_SCHEMA = {
        "required": [],
        "properties": {
            "allow_negative": {"type": "boolean"},
            "step": {"type": "number"},
            "input_label": {"type": "string"},
        }
    }

    def get_ui_config(self) -> Dict[str, Any]:
        """Returns numeric input configuration."""
        return {
            "input_type": "number",
            "allow_negative": self.config.get("allow_negative", False),
            "step": float(self.config.get("step", 1)),
            "input_label": self.config.get("input_label", "Quantity")
        }

    def calculate_delta(self, delta_payload: Dict[str, Any]) -> float:
        """Calculates floating point delta from quantity and operation."""
        quantity = float(delta_payload.get("quantity", 0))
        operation = delta_payload.get("operation", "add")
        return self._signed(quantity, operation)

    def process_transaction(self, current_stock: Any, delta_payload: Dict[str, Any]) -> Any:
        """Adds or subtracts quantity from the current numeric stock."""
        try:
            current_stock = float(current_stock) if current_stock is not None else 0.0
        except (ValueError, TypeError):
            current_stock = 0.0
            
        delta = float(self.calculate_delta(delta_payload))
        new_stock = current_stock + delta

        if not self.config.get("allow_negative", False) and new_stock < 0:
             raise ValueError("Stock cannot be negative")

        return new_stock

    def format_stock_display(self, stock_value: Any) -> str:
        """Formats number with 2 decimal places or as integer, appending unit if configured."""
        val = float(stock_value) if stock_value is not None else 0.0
        if val.is_integer():
            formatted = str(int(val))
        else:
            formatted = f"{val:.2f}"

        unit = self.get_display_unit()
        if unit:
            formatted = f"{formatted} {unit}"
        return formatted

    def get_display_unit(self) -> Optional[str]:
        """Counter exposes its `input_label` as the trailing unit when set."""
        unit = self.config.get("input_label")
        if isinstance(unit, str) and unit.strip():
            return unit.strip()
        return None



class ConverterEngine(BaseEngine):
    """
    Engine that converts input units to stock units using a ratio.
    Useful for products consumed in different units (e.g., liters vs bottles).
    """
    CONFIG_SCHEMA = {
        "required": [],
        "properties": {
            "ratio_source": {"type": "string"},
            "precision": {"type": "number"},
            "input_label": {"type": "string"},
            "stock_unit": {"type": "string"},
            "allow_negative": {"type": "boolean"},
        }
    }

    def get_ui_config(self) -> Dict[str, Any]:
        """Returns configuration for unit conversion input."""
        return {
            "input_type": "number",
            "input_label": self.config.get("input_label", "Consumed"),
            "step": self.config.get("precision", 0.01)
        }

    def calculate_delta(self, delta_payload: Dict[str, Any]) -> float:
        """Calculates delta by multiplying input quantity with a conversion ratio."""
        input_quantity = float(delta_payload.get("quantity", 0.0))
        operation = delta_payload.get("operation", "subtract") # Default to subtract for consumption
        
        # Calculate Ratio
        ratio = 1.0
        ratio_source = self.config.get("ratio_source")
        if ratio_source and ratio_source.startswith("attribute:"):
             attr_key = ratio_source.split(":")[1]
             # Assuming product.attributes is a flat dict for now
             ratio = float(self.product.attributes.get(attr_key, 1.0))

        delta_real = input_quantity * ratio
        return self._signed(delta_real, operation)

    def process_transaction(self, current_stock: Any, delta_payload: Dict[str, Any]) -> Any:
        """Applies converted delta to numeric stock."""
        try:
            current_stock = float(current_stock) if current_stock is not None else 0.0
        except (ValueError, TypeError):
            current_stock = 0.0

        delta_real = self.calculate_delta(delta_payload)
        new_stock = current_stock + delta_real

        if not self.config.get("allow_negative", False) and new_stock < 0:
            raise ValueError("Stock cannot be negative")

        return new_stock

    def format_stock_display(self, stock_value: Any) -> str:
        """Displays converted stock with unit suffix."""
        val = float(stock_value) if stock_value is not None else 0.0
        unit = self.config.get("stock_unit", "")
        return f"{val:.2f} {unit}".strip()



class DimensionEngine(BaseEngine):
    """
    Engine for products measured by multiple dimensions (length × width, area, volume).
    Evaluates a configurable formula using a safe expression parser.

    engine_config schema:
        {
            "dimensions": ["length", "width"],
            "unit": "m",
            "formula": "length * width",
            "computed_unit": "m²"
        }
    """
    CONFIG_SCHEMA = {
        "required": ["dimensions", "unit", "formula"],
        "properties": {
            "dimensions": {"type": "array", "items": {"type": "string"}},
            "unit": {"type": "string"},
            "formula": {"type": "string"},
            "computed_unit": {"type": "string"},
        }
    }

    def get_ui_config(self) -> Dict[str, Any]:
        """Returns one numeric input per dimension."""
        dimensions = self.config.get("dimensions", [])
        unit = self.config.get("unit", "")
        fields = [
            {
                "name": dim,
                "type": "number",
                "label": dim.replace("_", " ").title(),
                "unit": unit,
            }
            for dim in dimensions
        ]
        return {
            "input_type": "dimension",
            "fields": fields,
            "formula": self.config.get("formula", ""),
            "computed_unit": self.config.get("computed_unit", unit),
        }

    def _evaluate_formula(self, dimension_values: Dict[str, float]) -> float:
        """Safely evaluate the formula with provided dimension values."""
        formula = self.config.get("formula", "")
        if not formula:
            raise ValueError("No formula configured for dimension engine")

        parser = SafeFormulaParser(variables=dimension_values)
        return parser.parse(formula)

    def calculate_delta(self, delta_payload: Dict[str, Any]) -> float:
        """Evaluates the formula with provided dimension values to compute delta."""
        dimensions = self.config.get("dimensions", [])
        dimension_values = {}
        for dim in dimensions:
            val = delta_payload.get(dim)
            if val is None:
                raise ValueError(f"Missing dimension value: {dim}")
            dimension_values[dim] = float(val)

        computed = self._evaluate_formula(dimension_values)

        operation = delta_payload.get("operation", "add")
        return self._signed(computed, operation)

    def process_transaction(self, current_stock: Any, delta_payload: Dict[str, Any]) -> Any:
        """Stores dimension values in Movement metadata, updates stock by computed value."""
        try:
            current_stock = float(current_stock) if current_stock is not None else 0.0
        except (ValueError, TypeError):
            current_stock = 0.0

        delta = self.calculate_delta(delta_payload)
        new_stock = current_stock + delta
        return new_stock

    def format_stock_display(self, stock_value: Any) -> str:
        """Shows total with computed unit (e.g., '45.2 m²')."""
        val = float(stock_value) if stock_value is not None else 0.0
        computed_unit = self.config.get("computed_unit", self.config.get("unit", ""))
        if val == int(val):
            return f"{int(val)} {computed_unit}".strip()
        return f"{val:.2f} {computed_unit}".strip()


