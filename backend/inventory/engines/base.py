"""Abstract base for polymorphic inventory engines."""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Union


class BaseEngine(ABC):
    """
    Abstract base class for polymorphic inventory engines.

    Each engine defines how UI is configured, how stock deltas are calculated,
    how transactions affect stock values, and how stock is displayed.
    """

    def __init__(self, product, config: Dict[str, Any]):
        self.product = product
        self.config = config

    @classmethod
    def validate_config(cls, config: Dict[str, Any]) -> list:
        """
        Validate engine_config against CONFIG_SCHEMA.
        Returns list of error strings. Empty list = valid.
        """
        errors = []
        schema = getattr(cls, "CONFIG_SCHEMA", None)
        if not schema:
            return errors

        required = schema.get("required", [])
        properties = schema.get("properties", {})

        for field_name in required:
            if field_name not in config:
                errors.append(f"Missing required field: {field_name}")

        type_map = {
            "string": str,
            "number": (int, float),
            "boolean": bool,
            "array": list,
            "object": dict,
        }

        for field_name, field_value in config.items():
            if field_name not in properties:
                continue
            field_schema = properties[field_name]
            expected_type = field_schema.get("type")
            if expected_type and expected_type in type_map:
                py_type = type_map[expected_type]
                if not isinstance(field_value, py_type):
                    errors.append(
                        f"Field '{field_name}' must be {expected_type}, got {type(field_value).__name__}"
                    )
            enum_values = field_schema.get("enum")
            if enum_values and field_value not in enum_values:
                errors.append(
                    f"Field '{field_name}' must be one of {enum_values}, got '{field_value}'"
                )

        return errors

    @abstractmethod
    def get_ui_config(self) -> Dict[str, Any]:
        """
        Returns the configuration for the frontend widget.

        Returns:
            Dict[str, Any]: UI configuration parameters (labels, input types, etc.)
        """
        pass

    returns_numeric_delta: bool = True

    @abstractmethod
    def calculate_delta(self, delta_payload: Dict[str, Any]) -> Union[float, Dict[str, Any]]:
        """
        Calculates the change in stock (delta) based on payload.

        Args:
            delta_payload (Dict[str, Any]): Input data from the widget/API.

        Returns:
            Union[float, Dict[str, Any]]: A numeric delta for simple engines
                (Counter, Converter, Bucket, Dimension) or a metadata dict for
                complex engines (Tracker, TimeBased).
        """
        pass

    @abstractmethod
    def process_transaction(self, current_stock: Any, delta_payload: Dict[str, Any]) -> Any:
        """
        Calculates the new stock value based on the delta.

        Args:
            current_stock (Any): The existing stock value before the transaction.
            delta_payload (Dict[str, Any]): Input data for the transaction.

        Returns:
            Any: The updated stock value.
        """
        pass

    @abstractmethod
    def format_stock_display(self, stock_value: Any) -> str:
        """
        Formats the stock value for display.

        Args:
            stock_value (Any): The raw stock value.

        Returns:
            str: Human-readable stock representation.
        """
        pass

    def get_display_unit(self) -> Optional[str]:
        """Return a short unit string to append after raw numeric stock, or None.

        Default: None. Engines that already embed units in their numeric
        rendering (converter, dimension, etc.) keep returning None so that
        frontends that build their own numeric formatter don't double-print.
        """
        return None

    @staticmethod
    def _signed(value, operation):
        """Apply add/subtract sign to a numeric delta.

        Shared by the numeric engines (Counter/Converter/Dimension/TimeBased)
        so the add/subtract dispatch lives in one place. Raises on an unknown
        operation. Callers default ``operation`` themselves (Converter defaults
        to ``subtract``, the rest to ``add``).
        """
        if operation == "add":
            return value
        if operation == "subtract":
            return -value
        raise ValueError(f"Unknown operation: {operation}")
