from django.test import TestCase
from django.utils import timezone
from core.models import Company, User
from inventory.models import ProductModel, MonitoringRule, EventLog, Location, ProductBatch
from inventory.monitors import RuleEvaluator
from inventory.services import LedgerService

class MonitoringTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Corp", license_code="TSTMON")

        self.user = User.objects.create(username="tester", company=self.company)

        # Locations
        self.warehouse = Location.objects.create(company=self.company, name="Warehouse", type="WAREHOUSE")
        self.supplier = Location.objects.create(company=self.company, name="Supplier", type="VIRTUAL")

        # Products
        self.pm_simple = ProductModel.objects.create(
            company=self.company,
            sku="SIMPLE-01",
            name="Screw",
            profile='SIMPLE_COUNT',
        )
        self.pm_pharma = ProductModel.objects.create(
            company=self.company,
            sku="MED-01",
            name="Medicine",
            profile='SIMPLE_COUNT',
        )

        # Rules linked to product_model
        self.rule_low_stock = MonitoringRule.objects.create(
            product_model=self.pm_simple,
            name="Low Stock",
            trigger_type="THRESHOLD",
            condition_config={"min": 10},
            severity="WARNING"
        )

        self.rule_expiry = MonitoringRule.objects.create(
            product_model=self.pm_pharma,
            name="Expiring Soon",
            trigger_type="DATE_OFFSET",
            condition_config={"date_field": "expiration_date", "days_offset": 7},
            severity="CRITICAL"
        )

    def test_threshold_monitor(self):
        """Tests that the threshold monitor triggers an event when stock is below min."""
        # Create Movement to give it 5 stock
        LedgerService.transfer_stock(
            product_model=self.pm_simple,
            from_location=self.supplier,
            to_location=self.warehouse,
            quantity=5,
            user=self.user,
            reason="Initial Stock"
        )

        RuleEvaluator.evaluate_product(self.pm_simple)

        # Assert Event Created
        events = EventLog.objects.filter(product=self.pm_simple, rule=self.rule_low_stock)
        self.assertTrue(events.exists(), "EventLog should have been created for low stock")
        self.assertIn("below minimum threshold", events.first().message)

    def test_expiry_monitor(self):
        """Tests that the expiry monitor triggers an event when a batch is near expiration."""
        tomorrow = (timezone.now() + timezone.timedelta(days=1)).date()

        # Create a Batch with near-expiry date
        ProductBatch.objects.create(
            product_model=self.pm_pharma,
            location=self.warehouse,
            quantity=10,
            batch_identifier="BATCH-EXP-01",
            data={"expiration_date": tomorrow.isoformat()}
        )

        RuleEvaluator.evaluate_product(self.pm_pharma)

        events = EventLog.objects.filter(product=self.pm_pharma, rule=self.rule_expiry)
        self.assertTrue(events.exists(), "EventLog should have been created for expiring batch")
        self.assertIn("approaches expiry", events.first().message)

    def test_no_event_if_healthy(self):
        """Tests that no event is created if stock levels are healthy."""
        pm = ProductModel.objects.create(
            company=self.company,
            sku="HEALTHY-01",
            name="Good Stock",
            profile='SIMPLE_COUNT'
        )
        # Link the low-stock rule to this product too
        MonitoringRule.objects.create(
            product_model=pm,
            name="Low Stock Check",
            trigger_type="THRESHOLD",
            condition_config={"min": 10},
            severity="WARNING"
        )

        # Give it 100 stock
        LedgerService.transfer_stock(
            product_model=pm,
            from_location=self.supplier,
            to_location=self.warehouse,
            quantity=100,
            user=self.user,
            reason="Bulk Stock"
        )

        RuleEvaluator.evaluate_product(pm)
        self.assertFalse(EventLog.objects.filter(product=pm).exists(), "No EventLog should be created for healthy stock")
