"""Verifies ProductModel threshold changes upsert a MonitoringRule."""
from decimal import Decimal

from django.test import TestCase

from core.models import Company
from inventory.models import MonitoringRule, ProductModel
from inventory.services.restock import RestockService


class ThresholdSyncTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='SyncCo', license_code='SYNC01')

    def _make_product(self, **fields):
        return ProductModel.objects.create(
            company=self.company,
            sku='SYNC-01',
            name='Sync Product',
            profile='SIMPLE_COUNT',
            **fields,
        )

    def test_setting_reorder_threshold_creates_synced_rule(self):
        product = self._make_product(reorder_threshold=Decimal('10'))

        rules = MonitoringRule.objects.filter(
            product_model=product, name=RestockService.SYNCED_RULE_NAME,
        )
        self.assertEqual(rules.count(), 1)
        rule = rules.first()
        self.assertEqual(rule.trigger_type, 'THRESHOLD')
        self.assertEqual(rule.condition_config['min'], 10.0)
        self.assertIsNone(rule.condition_config['max'])
        self.assertEqual(rule.severity, 'WARNING')

    def test_updating_threshold_reuses_same_rule(self):
        product = self._make_product(reorder_threshold=Decimal('10'))
        original_id = MonitoringRule.objects.get(
            product_model=product, name=RestockService.SYNCED_RULE_NAME,
        ).id

        product.reorder_threshold = Decimal('25')
        product.save()

        rules = MonitoringRule.objects.filter(
            product_model=product, name=RestockService.SYNCED_RULE_NAME,
        )
        self.assertEqual(rules.count(), 1)
        rule = rules.first()
        self.assertEqual(rule.id, original_id)
        self.assertEqual(rule.condition_config['min'], 25.0)

    def test_clearing_all_thresholds_deletes_rule(self):
        product = self._make_product(
            reorder_threshold=Decimal('10'), max_threshold=Decimal('100'),
        )
        self.assertTrue(
            MonitoringRule.objects.filter(
                product_model=product, name=RestockService.SYNCED_RULE_NAME,
            ).exists(),
        )

        product.reorder_threshold = None
        product.critical_threshold = None
        product.max_threshold = None
        product.save()

        self.assertFalse(
            MonitoringRule.objects.filter(
                product_model=product, name=RestockService.SYNCED_RULE_NAME,
            ).exists(),
        )

    def test_max_threshold_only_creates_rule(self):
        product = self._make_product(max_threshold=Decimal('50'))

        rule = MonitoringRule.objects.get(
            product_model=product, name=RestockService.SYNCED_RULE_NAME,
        )
        self.assertIsNone(rule.condition_config['min'])
        self.assertEqual(rule.condition_config['max'], 50.0)
