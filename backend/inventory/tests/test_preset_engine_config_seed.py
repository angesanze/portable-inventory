"""Tests for ProductModelSerializer auto-seeding engine_config from preset.

Behavior under test:
- Create with default_calculator preset and no engine_config → copy preset.engine_config.
- Update changing default_calculator → engine_config replaced from preset.
- Explicit non-empty engine_config in payload wins over preset.
- engine_type mismatch between preset and product → skipped (no crash, no copy).
"""
import uuid
import pytest

from core.models import Company
from inventory.models import ProductModel, CalculatorTemplate
from inventory.serializers import ProductModelSerializer


@pytest.fixture
def company(db):
    return Company.objects.create(
        name="PresetSeedCo",
        license_code=uuid.uuid4().hex[:6].upper(),
    )


@pytest.fixture
def counter_preset(company):
    return CalculatorTemplate.objects.create(
        company=company,
        name="Kg Counter",
        engine_type="counter",
        engine_config={"input_label": "Kg", "step": 1},
    )


@pytest.fixture
def counter_preset_pcs(company):
    return CalculatorTemplate.objects.create(
        company=company,
        name="Pcs Counter",
        engine_type="counter",
        engine_config={"input_label": "pcs", "step": 5},
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
class TestPresetEngineConfigSeed:
    def test_create_with_preset_copies_engine_config(self, company, counter_preset):
        data = {
            "sku": "SEED-1",
            "name": "Caffè",
            "profile": "SIMPLE_COUNT",
            "default_calculator": str(counter_preset.id),
        }
        serializer = ProductModelSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        product = serializer.save(company=company)
        assert product.engine_config == {"input_label": "Kg", "step": 1}
        assert product.engine_config is not counter_preset.engine_config  # deep-copied

    def test_create_with_empty_engine_config_still_copies(self, company, counter_preset):
        data = {
            "sku": "SEED-2",
            "name": "Caffè",
            "profile": "SIMPLE_COUNT",
            "default_calculator": str(counter_preset.id),
            "engine_config": {},
        }
        serializer = ProductModelSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        product = serializer.save(company=company)
        assert product.engine_config == {"input_label": "Kg", "step": 1}

    def test_create_explicit_engine_config_wins(self, company, counter_preset):
        explicit = {"input_label": "Lb", "step": 2}
        data = {
            "sku": "SEED-3",
            "name": "Caffè",
            "profile": "SIMPLE_COUNT",
            "default_calculator": str(counter_preset.id),
            "engine_config": explicit,
        }
        serializer = ProductModelSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        product = serializer.save(company=company)
        assert product.engine_config == explicit

    def test_update_changing_preset_replaces_engine_config(
        self, company, counter_preset, counter_preset_pcs,
    ):
        product = ProductModel.objects.create(
            company=company,
            sku="SEED-4",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=counter_preset,
            engine_config={"input_label": "Kg", "step": 1},
        )
        data = {"default_calculator": str(counter_preset_pcs.id)}
        serializer = ProductModelSerializer(product, data=data, partial=True)
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.engine_config == {"input_label": "pcs", "step": 5}

    def test_update_explicit_engine_config_wins_over_preset(
        self, company, counter_preset, counter_preset_pcs,
    ):
        product = ProductModel.objects.create(
            company=company,
            sku="SEED-5",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=counter_preset,
            engine_config={"input_label": "Kg", "step": 1},
        )
        explicit = {"input_label": "L", "step": 10}
        data = {
            "default_calculator": str(counter_preset_pcs.id),
            "engine_config": explicit,
        }
        serializer = ProductModelSerializer(product, data=data, partial=True)
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.engine_config == explicit

    def test_update_same_preset_does_not_overwrite(self, company, counter_preset):
        product = ProductModel.objects.create(
            company=company,
            sku="SEED-6",
            name="Caffè",
            profile="SIMPLE_COUNT",
            default_calculator=counter_preset,
            engine_config={"input_label": "Custom", "step": 99},
        )
        # User edits name only; preset unchanged → engine_config preserved.
        data = {"name": "Caffè renamed", "default_calculator": str(counter_preset.id)}
        serializer = ProductModelSerializer(product, data=data, partial=True)
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.engine_config == {"input_label": "Custom", "step": 99}

    def test_create_engine_type_mismatch_skips_copy(self, company, time_preset):
        # SIMPLE_COUNT → counter engine; preset is time_based → mismatch.
        data = {
            "sku": "SEED-7",
            "name": "Caffè",
            "profile": "SIMPLE_COUNT",
            "default_calculator": str(time_preset.id),
        }
        serializer = ProductModelSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        product = serializer.save(company=company)
        assert product.engine_config == {}

    def test_create_without_preset_leaves_config_empty(self, company):
        data = {
            "sku": "SEED-8",
            "name": "Caffè",
            "profile": "SIMPLE_COUNT",
        }
        serializer = ProductModelSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        product = serializer.save(company=company)
        assert product.engine_config == {}
