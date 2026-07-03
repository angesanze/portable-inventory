"""Snapshot tests for widget product payload parity (Phase WIDGET-AUDIT-02).

Verifies that `WidgetProductService.get_widget_products` (list) and
`WidgetProductService.get_widget_product_details` (detail) emit the same
canonical shape per profile, and that the legacy `status_transitions`
field does not leak from `ui_config` to the top level of `calc_config`.
"""

import uuid

import pytest

from core.models import Company
from inventory.models import CalculatorTemplate, ProductModel
from inventory.services.widget_product import WidgetProductService


REQUIRED_KEYS = {
    "id",
    "sku",
    "name",
    "profile",
    "engine_type",
    "tracking_mode",
    "quantity",
    "stock_display",
    "calc_config",
    "components",
    "unit",
}

# Fields that must match exactly between list and detail payloads.
PARITY_FIELDS = ("profile", "engine_type", "tracking_mode")


@pytest.fixture
def company(db):
    code = uuid.uuid4().hex[:8].upper()
    return Company.objects.create(name=f"PayloadCo-{code}", license_code=code)


def _engine_config_for(profile):
    """Return a minimal engine_config that satisfies the engine for testing."""
    if profile == "DIMENSIONAL":
        return {
            "dimensions": ["length", "width"],
            "unit": "m",
            "formula": "length * width",
            "computed_unit": "m²",
        }
    if profile == "UNIT_CONVERSION":
        return {"ratio": 1.0, "input_label": "Consumed"}
    if profile == "BATCH_TRACKED":
        return {"fields": []}
    if profile == "PERISHABLE":
        return {"expiry_tracking": True, "time_unit": "days"}
    return {}


def _get_list_item(company, product_id):
    items = WidgetProductService.get_widget_products(company)
    for item in items:
        if item.get("id") == str(product_id):
            return item
    raise AssertionError(f"Product {product_id} not found in list payload")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "profile",
    [
        "SIMPLE_COUNT",
        "UNIT_CONVERSION",
        "DIMENSIONAL",
        "BATCH_TRACKED",
        "PERISHABLE",
        "SERIALIZED",
        "ASSEMBLED",
    ],
)
def test_list_and_detail_share_required_shape(company, profile):
    """Each profile's list-item dict and detail dict must satisfy the
    canonical required keys and agree on parity fields."""
    product = ProductModel.objects.create(
        company=company,
        sku=f"SKU-{profile}-{uuid.uuid4().hex[:6]}",
        name=f"Prod-{profile}",
        profile=profile,
        engine_config=_engine_config_for(profile),
    )

    list_item = _get_list_item(company, product.id)
    detail = WidgetProductService.get_widget_product_details(company, product.id)

    # Required key intersection holds for both endpoints
    missing_list = REQUIRED_KEYS - set(list_item.keys())
    missing_detail = REQUIRED_KEYS - set(detail.keys())
    assert not missing_list, f"List missing keys for {profile}: {missing_list}"
    assert not missing_detail, f"Detail missing keys for {profile}: {missing_detail}"

    # calc_config sub-shape
    for payload, label in ((list_item, "list"), (detail, "detail")):
        cc = payload["calc_config"]
        assert "engine" in cc, f"{label}[{profile}] calc_config.engine missing"
        assert "ui_config" in cc, f"{label}[{profile}] calc_config.ui_config missing"
        assert "status_transitions" in cc, (
            f"{label}[{profile}] calc_config.status_transitions key missing"
        )

    # Parity fields must agree exactly
    for field in PARITY_FIELDS:
        assert list_item[field] == detail[field], (
            f"{profile} mismatch on {field}: list={list_item[field]!r} detail={detail[field]!r}"
        )

    # status_transitions must agree across endpoints
    assert (
        list_item["calc_config"]["status_transitions"]
        == detail["calc_config"]["status_transitions"]
    ), f"{profile} status_transitions diverge between list and detail"


@pytest.mark.django_db
def test_serialized_with_tracker_preset_exposes_same_status_transitions(company):
    """SERIALIZED + tracker preset assigned → list and detail must both expose
    the same `status_transitions` map via the two-tier lookup."""
    transitions = {
        "ACTIVE": ["BROKEN"],
        "BROKEN": ["REPAIRED"],
        "REPAIRED": ["ACTIVE"],
    }
    preset = CalculatorTemplate.objects.create(
        company=company,
        name="Tracker Preset",
        engine_type="tracker",
        engine_config={"status_transitions": transitions},
    )
    product = ProductModel.objects.create(
        company=company,
        sku=f"TRK-{uuid.uuid4().hex[:6]}",
        name="Tracker With Preset",
        profile="SERIALIZED",
        default_calculator=preset,
    )

    list_item = _get_list_item(company, product.id)
    detail = WidgetProductService.get_widget_product_details(company, product.id)

    assert list_item["calc_config"]["status_transitions"] == transitions
    assert detail["calc_config"]["status_transitions"] == transitions


@pytest.mark.django_db
def test_no_preset_does_not_leak_status_transitions_to_top_level(company):
    """Negative test: products without a preset must have
    `calc_config.status_transitions` == None. The engine-default living
    inside `calc_config.ui_config.status_transitions` (tracker only)
    must NOT leak into the top-level field."""
    # SIMPLE_COUNT — no preset, no tracker engine → top-level must be None
    simple = ProductModel.objects.create(
        company=company,
        sku=f"SIMPLE-{uuid.uuid4().hex[:6]}",
        name="Simple No Preset",
        profile="SIMPLE_COUNT",
    )
    simple_list = _get_list_item(company, simple.id)
    simple_detail = WidgetProductService.get_widget_product_details(company, simple.id)
    assert simple_list["calc_config"]["status_transitions"] is None
    assert simple_detail["calc_config"]["status_transitions"] is None

    # SERIALIZED — no preset, no engine_config override → top-level must be None
    # even though ui_config will carry DEFAULT_TRANSITIONS from TrackerEngine.
    tracker = ProductModel.objects.create(
        company=company,
        sku=f"TRK-NOPRESET-{uuid.uuid4().hex[:6]}",
        name="Tracker No Preset",
        profile="SERIALIZED",
    )
    tracker_list = _get_list_item(company, tracker.id)
    tracker_detail = WidgetProductService.get_widget_product_details(company, tracker.id)

    assert tracker_list["calc_config"]["status_transitions"] is None, (
        "List leaked ui_config status_transitions to calc_config.status_transitions"
    )
    assert tracker_detail["calc_config"]["status_transitions"] is None, (
        "Detail leaked ui_config status_transitions to calc_config.status_transitions"
    )
    # Phase 03: engine no longer leaks DEFAULT_TRANSITIONS into ui_config.
    # Without explicit engine_config.status_transitions, the key must be absent.
    assert "status_transitions" not in tracker_list["calc_config"]["ui_config"]
    assert "status_transitions" not in tracker_detail["calc_config"]["ui_config"]
