"""Status-machine engine for serialized items: Tracker."""

from typing import Any, Dict

from .base import BaseEngine


class TrackerEngine(BaseEngine):
    """
    Engine for tracking individual serialized items (PhysicalProduct)
    through status transitions: ACTIVE → IN_USE → RETURNED → EXPIRED → DISPOSED.
    """

    returns_numeric_delta = False

    CONFIG_SCHEMA = {
        "required": [],
        "properties": {
            "status_transitions": {"type": "object"},
            "item_fields": {"type": "array", "items": {"type": "object"}},
        },
    }

    VALID_STATUSES = ["ACTIVE", "IN_USE", "RETURNED", "EXPIRED", "DISPOSED"]
    DEFAULT_TRANSITIONS = {
        "ACTIVE": ["IN_USE", "EXPIRED", "DISPOSED"],
        "IN_USE": ["RETURNED", "EXPIRED", "DISPOSED"],
        "RETURNED": ["ACTIVE", "IN_USE", "DISPOSED"],
        "EXPIRED": ["DISPOSED"],
        "DISPOSED": [],
    }

    def _allowed_statuses(self) -> set:
        """
        Union of statuses reachable from this product's configuration.

        When the user supplies a custom `status_transitions` map (e.g.
        `{BROKEN: [REPAIRED]}` from a tracker preset), runtime validation
        must accept those names — not the hardcoded default whitelist.
        Falls back to `VALID_STATUSES` only when no custom map is configured.
        """
        transitions = (self.config or {}).get("status_transitions")
        if not transitions or not isinstance(transitions, dict):
            return set(self.VALID_STATUSES)
        allowed = set(transitions.keys())
        for targets in transitions.values():
            if isinstance(targets, (list, tuple, set)):
                allowed.update(targets)
        return allowed

    def get_ui_config(self) -> Dict[str, Any]:
        """Intrinsic-only UI config for tracker engine.

        Returns `input_type` plus the user-configured `status_transitions` and
        `fields` only when explicitly set on the product. Frontend renders the
        canonical item/status/notes form from props in `TrackerPanel` — it does
        NOT need the engine to feed it a default field list.
        """
        ui: Dict[str, Any] = {"input_type": "tracker"}

        transitions = (self.config or {}).get("status_transitions")
        if transitions:
            ui["status_transitions"] = transitions

        attributes = getattr(self.product, "attributes", None) or {}
        attr_fields = attributes.get("fields") if isinstance(attributes, dict) else None
        if attr_fields:
            ui["fields"] = attr_fields

        return ui

    def calculate_delta(self, delta_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Returns status change metadata rather than numeric delta."""
        new_status = delta_payload.get("new_status")
        if new_status not in self._allowed_statuses():
            raise ValueError(f"Invalid status: {new_status}")

        return {
            "type": "status_change",
            "physical_product_id": delta_payload.get("physical_product_id"),
            "new_status": new_status,
            "notes": delta_payload.get("notes", ""),
        }

    def process_transaction(self, current_stock: Any, delta_payload: Dict[str, Any]) -> Any:
        """
        Pure computation: validates a status transition and returns the result.

        No DB operations — the caller (TrackerStatusBehavior) handles persistence.

        Args:
            current_stock: Dict with 'current_status' key for the item being transitioned.
            delta_payload: Must contain 'new_status' and 'physical_product_id'.

        Returns:
            Dict with old_status, new_status, and physical_product_id.

        Raises:
            ValueError: If transition is invalid or physical_product_id missing.
        """
        delta = self.calculate_delta(delta_payload)
        new_status = delta["new_status"]
        pp_id = delta["physical_product_id"]

        if not pp_id:
            raise ValueError("physical_product_id is required")

        # current_stock must provide the item's current status
        if not isinstance(current_stock, dict) or "current_status" not in current_stock:
            raise ValueError("current_stock must be a dict with 'current_status' key")

        old_status = current_stock["current_status"]
        transitions = self.config.get("status_transitions", self.DEFAULT_TRANSITIONS)

        # Bootstrap rule: when the item's current status is not a node of the
        # configured state machine (typically the model-default 'ACTIVE' on a
        # product whose preset only defines custom states like BROKEN/REPAIRED),
        # allow transitioning into any declared state. Without this the user is
        # stranded — `transitions.get('ACTIVE', [])` is `[]` and every move is
        # rejected. Once the item lands inside the machine, normal per-edge
        # validation resumes.
        if old_status not in transitions:
            allowed = list(self._allowed_statuses())
        else:
            allowed = transitions.get(old_status, [])

        if new_status not in allowed:
            raise ValueError(
                f"Cannot transition from {old_status} to {new_status}. Allowed: {allowed}"
            )

        return {
            "old_status": old_status,
            "new_status": new_status,
            "physical_product_id": pp_id,
        }

    def format_stock_display(self, stock_value: Any) -> str:
        """Returns breakdown like '12 active, 3 in-use, 1 broken'.

        Accepts either a dict of {status: count} or a plain numeric value.
        Callers should pass pre-computed status counts for a full breakdown.

        Custom preset statuses (e.g. BROKEN, REPAIRED, AO) are included
        after the default VALID_STATUSES so they remain visible — a unit
        whose only state-machine label is BROKEN must not silently
        disappear from the display.
        """
        if isinstance(stock_value, dict):
            parts = []
            seen = set()
            for status in self.VALID_STATUSES:
                count = stock_value.get(status, 0)
                if count > 0:
                    label = status.lower().replace("_", "-")
                    parts.append(f"{count} {label}")
                seen.add(status)
            for status, count in stock_value.items():
                if status in seen or not count:
                    continue
                label = status.lower().replace("_", "-")
                parts.append(f"{count} {label}")
            return ", ".join(parts) if parts else "0 items"

        val = int(stock_value) if stock_value else 0
        return f"{val} items"
