"""Tests for migration 0052_backfill_engine_config_from_preset.

pytest runs with `--no-migrations`, so we can't drive this through
MigrationExecutor without major harness changes. Instead we call the
migration's `backfill_engine_config` function directly against the live
app registry — the function only uses `apps.get_model` so it works
identically.
"""

import importlib
import uuid

import pytest
from django.apps import apps as live_apps

from core.models import Company
from inventory.models import CalculatorTemplate, ProductModel

# Migration module name starts with a digit, so import via importlib.
_migration_mod = importlib.import_module(
    "inventory.migrations.0052_backfill_engine_config_from_preset"
)
backfill_engine_config = _migration_mod.backfill_engine_config


@pytest.fixture
def company(db):
    return Company.objects.create(
        name="BackfillCo",
        license_code=uuid.uuid4().hex[:6].upper(),
    )


@pytest.fixture
def kg_preset(company):
    return CalculatorTemplate.objects.create(
        company=company,
        name="Kg Counter",
        engine_type="counter",
        engine_config={"input_label": "Kg", "step": 1},
    )


@pytest.fixture
def time_preset(company):
    return CalculatorTemplate.objects.create(
        company=company,
        name="Days Time",
        engine_type="time_based",
        engine_config={"time_unit": "days", "expiry_tracking": True},
    )


@pytest.mark.django_db
class TestBackfillEngineConfig:
    def test_backfills_empty_config_from_matching_preset(self, company, kg_preset):
        product = ProductModel.objects.create(
            company=company,
            sku="BF-1",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=kg_preset,
            engine_config={},
        )

        backfill_engine_config(live_apps, None)

        product.refresh_from_db()
        assert product.engine_config == {"input_label": "Kg", "step": 1}
        # deep-copied: mutating product config must not touch preset
        product.engine_config["step"] = 99
        product.save()
        kg_preset.refresh_from_db()
        assert kg_preset.engine_config == {"input_label": "Kg", "step": 1}

    def test_does_not_overwrite_non_empty_config(self, company, kg_preset):
        existing = {"input_label": "Custom", "step": 7}
        product = ProductModel.objects.create(
            company=company,
            sku="BF-2",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=kg_preset,
            engine_config=existing,
        )

        backfill_engine_config(live_apps, None)

        product.refresh_from_db()
        assert product.engine_config == existing

    def test_skips_engine_type_mismatch(self, company, time_preset):
        # SIMPLE_COUNT product → engine_type 'counter', preset is 'time_based'.
        product = ProductModel.objects.create(
            company=company,
            sku="BF-3",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=time_preset,
            engine_config={},
        )

        backfill_engine_config(live_apps, None)

        product.refresh_from_db()
        assert product.engine_config == {}

    def test_skips_products_without_preset(self, company):
        product = ProductModel.objects.create(
            company=company,
            sku="BF-4",
            name="Scatole",
            profile="SIMPLE_COUNT",
            default_calculator=None,
            engine_config={},
        )

        backfill_engine_config(live_apps, None)

        product.refresh_from_db()
        assert product.engine_config == {}

    def test_idempotent(self, company, kg_preset):
        product = ProductModel.objects.create(
            company=company,
            sku="BF-5",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=kg_preset,
            engine_config={},
        )

        backfill_engine_config(live_apps, None)
        first = dict(ProductModel.objects.get(pk=product.pk).engine_config)
        backfill_engine_config(live_apps, None)
        second = dict(ProductModel.objects.get(pk=product.pk).engine_config)

        assert first == second == {"input_label": "Kg", "step": 1}
