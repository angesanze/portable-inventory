"""Tests that serializers use explicit field lists (not __all__) and enforce read-only constraints."""

from django.test import TestCase

from inventory.serializers.work_orders import WorkOrderSerializer
from inventory.serializers.movements import EventLogSerializer


class TestExplicitFieldLists(TestCase):
    """Verify serializers declare fields explicitly, not via '__all__'."""

    def test_work_order_serializer_has_explicit_fields(self):
        meta = WorkOrderSerializer.Meta
        self.assertIsInstance(
            meta.fields, list, "WorkOrderSerializer should use an explicit field list"
        )
        self.assertIn("id", meta.fields)
        self.assertIn("company", meta.fields)
        self.assertIn("name", meta.fields)
        self.assertIn("status", meta.fields)
        self.assertIn("product_model", meta.fields)

    def test_work_order_serializer_company_read_only(self):
        meta = WorkOrderSerializer.Meta
        self.assertIn("company", meta.read_only_fields)

    def test_event_log_serializer_has_explicit_fields(self):
        meta = EventLogSerializer.Meta
        self.assertIsInstance(
            meta.fields, list, "EventLogSerializer should use an explicit field list"
        )
        self.assertIn("id", meta.fields)
        self.assertIn("rule", meta.fields)
        self.assertIn("product", meta.fields)
        self.assertIn("message", meta.fields)
        self.assertIn("status", meta.fields)

    def test_event_log_serializer_all_fields_read_only(self):
        meta = EventLogSerializer.Meta
        for field in meta.fields:
            self.assertIn(
                field, meta.read_only_fields, f"EventLog field '{field}' should be read-only"
            )
