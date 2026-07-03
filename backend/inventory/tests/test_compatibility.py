"""Tests for profile-based product creation and validation."""

import pytest
from inventory.models import ProductModel
from core.models import Company


@pytest.fixture
def company(db):
    import uuid

    return Company.objects.create(name="Compat Co", license_code=uuid.uuid4().hex[:6].upper())


@pytest.mark.django_db
def test_batch_tracked_profile_valid(company):
    """BATCH_TRACKED profile creates valid product."""
    product = ProductModel(
        company=company,
        sku="VALID-BUCKET",
        name="Valid Bucket",
        profile="BATCH_TRACKED",
    )
    product.full_clean()
    product.save()
    assert product.id is not None
    assert product.tracking_mode == "BATCH"
    assert product.engine_type == "bucket"


@pytest.mark.django_db
def test_unit_conversion_profile_valid(company):
    """UNIT_CONVERSION profile creates valid product."""
    product = ProductModel(
        company=company,
        sku="VALID-CONV",
        name="Valid Converter",
        profile="UNIT_CONVERSION",
    )
    product.full_clean()
    product.save()
    assert product.tracking_mode == "BULK"
    assert product.engine_type == "converter"


@pytest.mark.django_db
def test_simple_count_no_strategy_valid(company):
    """SIMPLE_COUNT profile without strategy = valid."""
    product = ProductModel(
        company=company,
        sku="SC-OK",
        name="Simple Count",
        profile="SIMPLE_COUNT",
    )
    product.full_clean()
    product.save()
    assert product.tracking_mode == "BULK"
    assert product.engine_type == "counter"
