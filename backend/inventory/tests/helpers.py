"""Shared test helpers for inventory tests."""
import secrets
import uuid

from core.models import Company, User, ApiKey
from inventory.constants import (
    PROFILE_SIMPLE_COUNT, PROFILE_UNIT_CONVERSION, PROFILE_DIMENSIONAL,
    PROFILE_BATCH_TRACKED, PROFILE_PERISHABLE, PROFILE_SERIALIZED,
    PROFILE_ASSEMBLED,
)


def make_company(suffix="A"):
    """Create Company → User → ApiKey directly (lean, no seeding)."""
    company = Company.objects.create(
        name=f"Company {suffix}",
        license_code=f"TEST{suffix}",
    )
    user = User.objects.create_user(
        username=f"admin_{suffix}",
        password="testpass123",
    )
    user.company = company
    user.role = "Admin"
    user.save()
    api_key = ApiKey.objects.create(
        company=company,
        key=secrets.token_hex(32),
        label="Test Key",
    )
    return company, user, api_key


def make_company_full(suffix="A"):
    """Create Company → User → ApiKey + seed default locations."""
    from inventory.models import Location

    company, user, api_key = make_company(suffix)

    # Seed default locations (no strategies to seed anymore)
    for name, loc_type in [
        ('Main Warehouse', 'WAREHOUSE'),
        ('Store', 'STORE'),
        ('Loss', 'LOSS'),
        ('External Vendor', 'VIRTUAL'),
    ]:
        Location.objects.get_or_create(
            company=company, name=name, defaults={'type': loc_type}
        )

    return company, user, api_key


# ── Profile-based product factories ─────────────────────────────────


def make_product(company, profile=PROFILE_SIMPLE_COUNT, sku=None, name=None, **kwargs):
    """Create a ProductModel with a given profile. Auto-generates sku/name if not provided."""
    from inventory.models import ProductModel

    suffix = str(uuid.uuid4())[:8]
    return ProductModel.objects.create(
        company=company,
        profile=profile,
        sku=sku or f"TEST-{profile}-{suffix}",
        name=name or f"Test {profile} {suffix}",
        **kwargs,
    )


def make_simple_product(company, **kwargs):
    """SIMPLE_COUNT product (bolts, screws)."""
    return make_product(company, profile=PROFILE_SIMPLE_COUNT, **kwargs)


def make_batch_product(company, **kwargs):
    """BATCH_TRACKED product (pharma lots)."""
    return make_product(company, profile=PROFILE_BATCH_TRACKED, **kwargs)


def make_perishable_product(company, **kwargs):
    """PERISHABLE product (food with expiry)."""
    return make_product(company, profile=PROFILE_PERISHABLE, **kwargs)


def make_serialized_product(company, **kwargs):
    """SERIALIZED product (unique assets)."""
    return make_product(company, profile=PROFILE_SERIALIZED, **kwargs)


def make_assembled_product(company, **kwargs):
    """ASSEMBLED product (kit/BOM)."""
    return make_product(company, profile=PROFILE_ASSEMBLED, **kwargs)


def make_dimensional_product(company, **kwargs):
    """DIMENSIONAL product (fabric m²)."""
    defaults = {
        'engine_config': {
            'dimensions': [
                {'key': 'length', 'label': 'Length', 'unit': 'm'},
                {'key': 'width', 'label': 'Width', 'unit': 'm'},
            ],
            'formula': 'length * width',
            'computed_unit': 'm²',
        }
    }
    defaults.update(kwargs)
    return make_product(company, profile=PROFILE_DIMENSIONAL, **defaults)


def make_converter_product(company, **kwargs):
    """UNIT_CONVERSION product (liters → bottles)."""
    defaults = {
        'engine_config': {
            'ratio_source': 'config',
            'conversion_ratio': '0.75',
            'precision': 2,
            'stock_unit': 'bottles',
            'input_label': 'Liters',
        }
    }
    defaults.update(kwargs)
    return make_product(company, profile=PROFILE_UNIT_CONVERSION, **defaults)
