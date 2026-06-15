"""List/expiry engines: Bucket, TimeBased."""
from typing import Any, Dict

from .base import BaseEngine


class BucketEngine(BaseEngine):
    """
    Engine for complex batch/lot management.
    Stock is stored as a list of dictionaries (buckets).
    """
    CONFIG_SCHEMA = {
        "required": [],
        "properties": {
            "fields": {"type": "array", "items": {"type": "object"}},
            "allocation_strategy": {"type": "string", "enum": ["MANUAL", "FIFO", "LIFO", "WEIGHTED"]},
            "primary_key": {"type": "string"},
        }
    }

    def get_ui_config(self) -> Dict[str, Any]:
        """Returns configuration for batch-aware form."""
        return {
            "input_type": "bucket_form",
            "fields": self.config.get("fields", []),
            "allocation_strategy": self.config.get("allocation_strategy", "MANUAL")
        }

    def calculate_delta(self, delta_payload: Dict[str, Any]) -> float:
        """Returns net quantity change for ledger/audit integration."""
        quantity = float(delta_payload.get("quantity", 0))
        operation = delta_payload.get("operation")
        if operation == "add":
            return quantity
        elif operation == "subtract":
            return -quantity
        return 0.0

    def process_transaction(self, current_stock: Any, delta_payload: Dict[str, Any]) -> Any:
        """Updates internal buckets (add/remove from specific batch)."""
        if not isinstance(current_stock, list):
            current_stock = []
            
        operation = delta_payload.get("operation")
        pk_field = self.config.get("primary_key", "id")

        if operation == "add":
            bucket_data = delta_payload.get("bucket_data", {})
            pk_value = bucket_data.get(pk_field)
            if not pk_value:
                 raise ValueError(f"Missing primary key: {pk_field}")
            
            qty_to_add = float(delta_payload.get("quantity", 0))

            # Find existing bucket
            found = False
            for bucket in current_stock:
                if bucket.get(pk_field) == pk_value:
                    bucket["qty"] = bucket.get("qty", 0) + qty_to_add
                    found = True
                    break
            
            if not found:
                new_bucket = bucket_data.copy()
                new_bucket["qty"] = qty_to_add
                current_stock.append(new_bucket)

        elif operation == "subtract":
             qty_to_remove = float(delta_payload.get("quantity", 0))
             
             # Allocation Strategy Logic ( Simplified for now )
              # Manual removal via bucket_id
             bucket_pk = delta_payload.get("bucket_id")
             
             if bucket_pk:
                 for bucket in current_stock:
                      if bucket.get(pk_field) == bucket_pk:
                           current_qty = bucket.get("qty", 0)
                           if current_qty < qty_to_remove:
                                raise ValueError("Insufficient stock in bucket")
                           bucket["qty"] = current_qty - qty_to_remove
                           break
                 else:
                      raise ValueError("Bucket not found")

        return current_stock

    def format_stock_display(self, stock_value: Any) -> str:
        """Returns total sum across all buckets."""
        if not isinstance(stock_value, list):
             return "0 items"
        total_qty = sum(b.get("qty", 0) for b in stock_value)
        return f"{total_qty} (across {len(stock_value)} buckets)"



class TimeBasedEngine(BaseEngine):
    """
    Engine for products with time-based consumption (subscriptions, rentals, perishables).
    Tracks expiry dates on batches and provides expiry-aware stock display.

    engine_config schema:
        {
            "time_unit": "days"|"hours",
            "expiry_tracking": true,
            "auto_decrement": false
        }
    """
    returns_numeric_delta = False

    CONFIG_SCHEMA = {
        "required": ["time_unit"],
        "properties": {
            "time_unit": {"type": "string", "enum": ["days", "hours"]},
            "expiry_tracking": {"type": "boolean"},
            "auto_decrement": {"type": "boolean"},
        }
    }

    def get_ui_config(self) -> Dict[str, Any]:
        """Returns intrinsic config + namespaced engine scaffolding.

        The canonical `quantity / expiry_date / batch_ref` field triple is
        scaffolding the frontend `TimeBasedPanel` renders from its own props,
        not user data. We expose it under `engine_defaults.fields` so any
        consumer that wants the canonical layout can read it explicitly without
        mistaking it for user-configured fields (mirrors the Phase 03 tracker
        cleanup).
        """
        expiry_tracking = self.config.get("expiry_tracking", True)
        scaffold_fields = [
            {"name": "quantity", "type": "number", "label": "Quantity"},
        ]
        if expiry_tracking:
            scaffold_fields.append(
                {"name": "expiry_date", "type": "date", "label": "Expiry Date"}
            )
        scaffold_fields.append(
            {"name": "batch_ref", "type": "text", "label": "Batch Reference", "required": False}
        )
        return {
            "input_type": "time_based",
            "time_unit": self.config.get("time_unit", "days"),
            "expiry_tracking": expiry_tracking,
            "engine_defaults": {"fields": scaffold_fields},
        }

    def calculate_delta(self, delta_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Computes quantity delta with expiry metadata attached."""
        quantity = float(delta_payload.get("quantity", 0))
        operation = delta_payload.get("operation", "add")
        delta = self._signed(quantity, operation)

        result = {"delta": delta, "quantity": quantity, "operation": operation}

        if self.config.get("expiry_tracking", True):
            expiry_date = delta_payload.get("expiry_date")
            if expiry_date and operation == "add":
                result["expiry_date"] = expiry_date

        batch_ref = delta_payload.get("batch_ref")
        if batch_ref:
            result["batch_ref"] = batch_ref

        return result

    def process_transaction(self, current_stock: Any, delta_payload: Dict[str, Any]) -> Any:
        """
        Creates Movement with expiry date in metadata.
        Updates ProductBatch.data with expiry info.
        Returns updated numeric stock value.
        """
        try:
            current_stock = float(current_stock) if current_stock is not None else 0.0
        except (ValueError, TypeError):
            current_stock = 0.0

        delta_meta = self.calculate_delta(delta_payload)
        delta = delta_meta["delta"]
        new_stock = current_stock + delta

        if new_stock < 0:
            raise ValueError("Stock cannot be negative")

        return new_stock

    def format_stock_display(self, stock_value: Any) -> str:
        """Shows stock with expiry breakdown: '100 units (20 expiring in 3 days)'.

        Accepts either a plain numeric value or a dict with keys:
            - value: the stock quantity
            - expired: count of expired items (optional)
            - expiring_soon: count of items expiring soon (optional)
        Callers should pass pre-computed expiry data for a full breakdown.
        """
        if isinstance(stock_value, dict):
            val = float(stock_value.get("value", 0))
            expired = stock_value.get("expired", 0)
            expiring_soon = stock_value.get("expiring_soon", 0)
        else:
            try:
                val = float(stock_value) if stock_value is not None else 0.0
            except (ValueError, TypeError):
                val = 0.0
            expired = 0
            expiring_soon = 0

        display_val = int(val) if val == int(val) else f"{val:.2f}"

        if not self.config.get("expiry_tracking", True):
            return f"{display_val} units"

        expiry_parts = []
        if expired > 0:
            expiry_parts.append(f"{expired} expired")
        if expiring_soon > 0:
            time_unit = self.config.get("time_unit", "days")
            label = "3 days" if time_unit == "days" else "72 hours"
            expiry_parts.append(f"{expiring_soon} expiring in {label}")

        if expiry_parts:
            return f"{display_val} units ({', '.join(expiry_parts)})"
        return f"{display_val} units"

    def ensure_monitoring_rules(self):
        """Auto-create expiry monitoring rules when time-based products are added."""
        if not self.config.get("expiry_tracking", True):
            return None

        from ..models import MonitoringRule

        product_model = getattr(self.product, 'model', self.product)

        time_unit = self.config.get("time_unit", "days")
        offset_value = 3 if time_unit == "days" else 72

        rule, created = MonitoringRule.objects.get_or_create(
            product_model=product_model,
            name=f"Expiry Alert - {product_model.name}",
            defaults={
                "trigger_type": "DATE_OFFSET",
                "condition_config": {
                    "field": "expiry_date",
                    "offset_value": offset_value,
                    "offset_unit": time_unit,
                    "source": "batch_data",
                },
                "severity": "WARNING",
            }
        )
        return rule


