
import pytest
from decimal import Decimal
from unittest.mock import MagicMock
from django.utils import timezone
from datetime import timedelta
import uuid
from inventory.models import ProductModel, Location, PhysicalProduct, Movement
from inventory.orchestrators import InventoryOrchestrator
from core.models import Company
from django.core.exceptions import ValidationError

@pytest.fixture
def company_setup(db):
    code = uuid.uuid4().hex[:6].upper()
    comp = Company.objects.create(name="TestCo", license_code=code)
    return comp

@pytest.fixture
def product_setup(company_setup):
    loc = Location.objects.create(name="Orch Warehouse", type="WAREHOUSE", company=company_setup)
    product = ProductModel.objects.create(
        company=company_setup,
        name="Orch Serial",
        sku=f"ORCH-{uuid.uuid4()}",
        profile="SERIALIZED"
    )
    return comp, loc, product

@pytest.mark.django_db
def test_orchestrator_field_mismatch_checkin(company_setup):
    """
    Test that calling orchestrator with 'physical_identifier' (used by frontend) 
    fails if orchestrator only looks for 'item_identifier'.
    """
    company = company_setup
    loc = Location.objects.create(name="Orch Loc", type="WAREHOUSE", company=company)
    product = ProductModel.objects.create(
        company=company,
        name="Orch Prod",
        sku=f"SKU-{uuid.uuid4()}",
        profile="SERIALIZED"
    )

    # Frontend payload pattern
    data = {
        "quantity": 1,
        "physical_identifier": "SN-CHECKIN-001", 
        # 'item_identifier' is MISSING
        "reason": "Check In Test"
    }
    
    # This should now SUCCEED because orchestrator supports 'physical_identifier'
    result = InventoryOrchestrator.handle_widget_movement(
        company=company,
        product_model=product,
        location=loc,
        data=data
    )
    
    assert result['status'] == 'success'
    assert result['quantity'] == 1.0

@pytest.mark.django_db
def test_orchestrator_fifo_fallback(company_setup):
    """
    Test that orchestrator succeeds on subtract check-out if no ID provided (FIFO fallback).
    """
    company = company_setup
    loc = Location.objects.create(name="Orch Loc FIFO", type="WAREHOUSE", company=company)
    product = ProductModel.objects.create(
        company=company,
        name="Orch FIFO Prod",
        sku=f"SKU-FIFO-{uuid.uuid4()}",
        profile="SERIALIZED"
    )

    # Create an item to potentially be picked
    pp = PhysicalProduct.objects.create(
        product_model=product,
        location=loc,
        identifier="SN-FIFO-AVAIL",
        status="ACTIVE",
        batch_date=timezone.now().date()
    )
    
    # Reload from DB to ensure it's saved
    pp.refresh_from_db()
    
    data = {
        "quantity": -1,
        # No identifier provided implies "Any" -> FIFO
    }
    
    # Should now SUCCEED due to FIFO fallback
    result = InventoryOrchestrator.handle_widget_movement(
        company=company,
        product_model=product,
        location=loc,
        data=data
    )
        
    assert result['status'] == 'success'
    # Verify the item was moved to external (or check its location changed)
    pp.refresh_from_db()
    # It should no longer be at 'loc' (it moves to virtual supplier/external)
    assert pp.location != loc


@pytest.mark.django_db
def test_manual_adjustment_books_against_adjustment_not_vendor(company_setup):
    """
    A manual giacenza correction must be tracked against the dedicated
    'Inventory Adjustment' virtual location, NOT 'External Vendor'.
    """
    company = company_setup
    loc = Location.objects.create(name="Adj Warehouse", type="WAREHOUSE", company=company)
    product = ProductModel.objects.create(
        company=company,
        name="Adj Bulk",
        sku=f"SKU-ADJ-{uuid.uuid4()}",
        profile="SIMPLE_COUNT",
    )

    # Default (no counterparty) is treated as an adjustment.
    result = InventoryOrchestrator.handle_widget_movement(
        company=company,
        product_model=product,
        location=loc,
        data={"quantity": 10, "reason": "Manual stock adjustment"},
    )
    assert result['status'] == 'success'

    movement = Movement.objects.filter(product_model=product).latest('occurred_at')
    # Inbound: counterparty -> warehouse
    assert movement.to_location == loc
    assert movement.from_location.name == "Inventory Adjustment"
    assert movement.from_location.type == "VIRTUAL"

    # No 'External Vendor' location should have been created for a manual edit.
    assert not Location.objects.filter(company=company, name="External Vendor").exists()


@pytest.mark.django_db
def test_orchestrator_rejects_malformed_idempotency_key(company_setup):
    """L2: a non-UUID idempotency_key must raise a clean ValidationError up front,
    not bubble a deep error out of the ledger's UUIDField as a generic 500."""
    from rest_framework.exceptions import ValidationError as DRFValidationError

    company = company_setup
    loc = Location.objects.create(name="Idem Warehouse", type="WAREHOUSE", company=company)
    product = ProductModel.objects.create(
        company=company,
        name="Idem Bulk",
        sku=f"SKU-IDEM-{uuid.uuid4()}",
        profile="SIMPLE_COUNT",
    )

    with pytest.raises(DRFValidationError):
        InventoryOrchestrator.handle_widget_movement(
            company=company,
            product_model=product,
            location=loc,
            data={"quantity": 5, "idempotency_key": "not-a-uuid"},
        )
    # The bad request created no Movement.
    assert not Movement.objects.filter(product_model=product).exists()


@pytest.mark.django_db
def test_orchestrator_accepts_valid_idempotency_key(company_setup):
    """L2: a well-formed UUID idempotency_key is accepted and threaded to the
    ledger (the movement is stamped with it)."""
    company = company_setup
    loc = Location.objects.create(name="Idem OK Warehouse", type="WAREHOUSE", company=company)
    product = ProductModel.objects.create(
        company=company,
        name="Idem OK Bulk",
        sku=f"SKU-IDEMOK-{uuid.uuid4()}",
        profile="SIMPLE_COUNT",
    )
    key = str(uuid.uuid4())

    result = InventoryOrchestrator.handle_widget_movement(
        company=company,
        product_model=product,
        location=loc,
        data={"quantity": 5, "idempotency_key": key},
    )
    assert result["status"] == "success"
    movement = Movement.objects.filter(product_model=product).latest("occurred_at")
    assert str(movement.idempotency_key) == key


@pytest.mark.django_db
def test_explicit_vendor_counterparty_uses_external_vendor(company_setup):
    """Passing counterparty='VENDOR' still books against 'External Vendor'."""
    company = company_setup
    loc = Location.objects.create(name="Vendor Warehouse", type="WAREHOUSE", company=company)
    product = ProductModel.objects.create(
        company=company,
        name="Vendor Bulk",
        sku=f"SKU-VEN-{uuid.uuid4()}",
        profile="SIMPLE_COUNT",
    )

    result = InventoryOrchestrator.handle_widget_movement(
        company=company,
        product_model=product,
        location=loc,
        data={"quantity": 5, "counterparty": "VENDOR", "reason": "PO receipt"},
    )
    assert result['status'] == 'success'

    movement = Movement.objects.filter(product_model=product).latest('occurred_at')
    assert movement.from_location.name == "External Vendor"
    assert movement.from_location.type == "VIRTUAL"
