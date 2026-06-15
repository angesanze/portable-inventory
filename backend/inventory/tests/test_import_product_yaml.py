"""Tests for import_product_yaml management command."""
import os
import tempfile
import yaml
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from inventory.models import ProductModel as Product
from .helpers import make_company


class ImportProductYamlTests(TestCase):
    def setUp(self):
        self.company, self.user, self.api_key = make_company("YAML")

    def _write_yaml(self, data):
        f = tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False)
        yaml.dump(data, f)
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name

    def test_import_simple_count_product(self):
        path = self._write_yaml({
            'sku': 'STAPLER-001',
            'name': 'Test Stapler',
            'profile': 'SIMPLE_COUNT',
            'attributes': {'category': 'Office'},
            'engine_config': {'step': 1},
            'initial_stock': 50,
        })
        call_command('import_product_yaml', path, '--company', self.company.name)
        product = Product.objects.get(sku='STAPLER-001', company=self.company)
        self.assertEqual(product.name, 'Test Stapler')
        self.assertEqual(product.profile, 'SIMPLE_COUNT')
        self.assertEqual(product.tracking_mode, 'BULK')
        self.assertEqual(product.engine_type, 'counter')
        self.assertEqual(product.engine_config, {'step': 1})
        self.assertEqual(product.initial_balance, 50)

    def test_import_batch_tracked_product(self):
        path = self._write_yaml({
            'sku': 'MED-001',
            'name': 'Batch Item',
            'profile': 'BATCH_TRACKED',
            'engine_config': {'primary_key': 'batch_number'},
        })
        call_command('import_product_yaml', path, '--company', self.company.name)
        product = Product.objects.get(sku='MED-001', company=self.company)
        self.assertEqual(product.profile, 'BATCH_TRACKED')
        self.assertEqual(product.tracking_mode, 'BATCH')
        self.assertEqual(product.engine_type, 'bucket')

    def test_update_existing_product(self):
        path1 = self._write_yaml({
            'sku': 'UPD-001',
            'name': 'Updatable',
            'profile': 'SIMPLE_COUNT',
        })
        call_command('import_product_yaml', path1, '--company', self.company.name)
        self.assertEqual(Product.objects.filter(sku='UPD-001', company=self.company).count(), 1)

        path2 = self._write_yaml({
            'sku': 'UPD-001',
            'name': 'Updatable v2',
            'profile': 'UNIT_CONVERSION',
            'engine_config': {'ratio': 2.5},
        })
        call_command('import_product_yaml', path2, '--company', self.company.name)
        self.assertEqual(Product.objects.filter(sku='UPD-001', company=self.company).count(), 1)
        product = Product.objects.get(sku='UPD-001', company=self.company)
        self.assertEqual(product.profile, 'UNIT_CONVERSION')
        self.assertEqual(product.name, 'Updatable v2')

    def test_missing_sku_raises(self):
        path = self._write_yaml({'name': 'No SKU', 'profile': 'SIMPLE_COUNT'})
        with self.assertRaises(CommandError):
            call_command('import_product_yaml', path)

    def test_missing_name_raises(self):
        path = self._write_yaml({'sku': 'X', 'profile': 'SIMPLE_COUNT'})
        with self.assertRaises(CommandError):
            call_command('import_product_yaml', path)

    def test_missing_profile_raises(self):
        path = self._write_yaml({'sku': 'X', 'name': 'No Profile'})
        with self.assertRaises(CommandError):
            call_command('import_product_yaml', path)

    def test_invalid_profile_raises(self):
        path = self._write_yaml({'sku': 'X', 'name': 'Bad', 'profile': 'NONEXISTENT'})
        with self.assertRaises(CommandError):
            call_command('import_product_yaml', path)

    def test_missing_file_raises(self):
        with self.assertRaises(CommandError):
            call_command('import_product_yaml', '/tmp/does_not_exist_12345.yaml')

    def test_default_company_used_when_not_specified(self):
        path = self._write_yaml({
            'sku': 'DEFAULT-001',
            'name': 'Default Co Product',
            'profile': 'SIMPLE_COUNT',
        })
        call_command('import_product_yaml', path)
        self.assertTrue(Product.objects.filter(sku='DEFAULT-001').exists())
