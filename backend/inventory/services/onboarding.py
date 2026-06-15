"""Shared initial-stock onboarding path.

Both `ProductModelViewSet.perform_create` (single-product create) and the bulk
importer (`services/importer.py`) need to book a product's opening stock against
the External Vendor virtual location. Rather than duplicate the three-branch
logic (BATCH/PERISHABLE, SERIALIZED, BULK) this module owns it.

`onboard_initial_stock` is intentionally permissive about *where* its inputs come
from (a DRF payload vs. a parsed import row) — it takes plain values and resolves
locations/suppliers itself, raising InventoryError on misconfiguration so callers
can translate to their own error shape.
"""

from decimal import Decimal, InvalidOperation

from ..models import Location, Supplier, PhysicalProduct, Movement
from .. import constants
from ..exceptions import InventoryError
from .ledger import LedgerService
from .counterparty import CounterpartyService


def _resolve_destination(company, location_id):
    """Resolve a real (non-virtual) destination location for a receipt.

    Preference: explicit location_id (scoped to company) → first WAREHOUSE →
    first non-VIRTUAL/non-LOSS location. Returns None when nothing usable.
    """
    dest = None
    if location_id:
        dest = Location.objects.filter(id=location_id, company=company).first()
    if not dest:
        dest = Location.objects.filter(company=company, type='WAREHOUSE').first()
    if not dest:
        dest = (
            Location.objects.filter(company=company)
            .exclude(type__in=['VIRTUAL', 'LOSS'])
            .first()
        )
    return dest


def onboard_initial_stock(
    *,
    product,
    user,
    company,
    location_id=None,
    supplier=None,
    initial_balance=None,
    initial_batch=None,
    initial_serials=None,
    purchased_cost=None,
):
    """Book opening stock for a freshly-created product. Returns the Movement
    (or None when nothing was booked).

    Exactly one of `initial_batch` / `initial_serials` / `initial_balance` is
    acted upon, in that priority order — mirroring the legacy perform_create
    branching so behavior is identical whether stock arrives via the UI or import.

    Raises InventoryError on bad inputs (no usable location, non-positive qty,
    duplicate/clashing serials, etc.). Caller is responsible for the surrounding
    transaction.atomic() boundary.

    `supplier` is an already-resolved Supplier instance (or None).
    """
    source_loc = CounterpartyService.resolve(company, constants.COUNTERPARTY_VENDOR)
    if source_loc is None:
        raise InventoryError("No usable source (vendor) location.")

    # Branch 1 — PERISHABLE / BATCH_TRACKED initial batch.
    if initial_batch:
        batch_identifier = (initial_batch.get('batch_identifier') or '').strip()
        qty_raw = initial_batch.get('initial_quantity')
        batch_loc_id = initial_batch.get('initial_location_id') or location_id
        expiry_date = initial_batch.get('expiry_date')
        lot_number = initial_batch.get('lot_number')

        if not batch_identifier:
            raise InventoryError("batch_identifier is required.")
        try:
            qty = Decimal(str(qty_raw))
        except (InvalidOperation, TypeError):
            raise InventoryError("initial_quantity must be numeric.")
        if qty <= 0:
            raise InventoryError("initial_quantity must be > 0.")

        dest_loc = _resolve_destination(company, batch_loc_id)
        if not dest_loc:
            raise InventoryError("No usable destination location.")

        batch_data_payload = {
            'batch_identifier': batch_identifier,
            'data': {
                k: v for k, v in {
                    'expiry_date': expiry_date,
                    'lot_number': lot_number,
                }.items() if v
            },
        }
        return LedgerService.transfer_stock(
            product_model=product,
            from_location=source_loc,
            to_location=dest_loc,
            quantity=qty,
            user=user,
            reason="Initial stock",
            batch_data=batch_data_payload,
            supplier=supplier,
            purchased_cost=purchased_cost,
        )

    # Branch 2 — SERIALIZED initial serials.
    if initial_serials:
        from django.db import IntegrityError
        if not isinstance(initial_serials, list):
            raise InventoryError("initial_serials must be a list of identifiers.")

        cleaned = []
        seen = set()
        duplicates_in_payload = []
        for raw in initial_serials:
            ident = (str(raw) if raw is not None else '').strip()
            if not ident:
                continue
            if ident in seen:
                duplicates_in_payload.append(ident)
                continue
            seen.add(ident)
            cleaned.append(ident)

        if duplicates_in_payload:
            raise InventoryError(f"Duplicate identifiers in payload: {duplicates_in_payload}")
        if not cleaned:
            raise InventoryError("At least one serial identifier is required.")

        dest_loc = _resolve_destination(company, location_id)
        if not dest_loc:
            raise InventoryError("No usable destination location.")

        existing = set(
            PhysicalProduct.objects.filter(
                product_model=product, identifier__in=cleaned,
            ).values_list('identifier', flat=True)
        )
        if existing:
            raise InventoryError(f"Identifier(s) already exist: {sorted(existing)}")

        items = [
            PhysicalProduct(
                product_model=product,
                identifier=ident,
                status='ACTIVE',
                location=dest_loc,
            )
            for ident in cleaned
        ]
        try:
            PhysicalProduct.objects.bulk_create(items)
        except IntegrityError as exc:
            raise InventoryError(f"Identifier(s) already exist: {str(exc)}")

        return Movement.objects.create(
            product_model=product,
            from_location=source_loc,
            to_location=dest_loc,
            quantity=len(cleaned),
            performed_by=user,
            reason="Initial serials",
            supplier=supplier,
        )

    # Branch 3 — BULK initial_balance.
    if initial_balance is not None:
        try:
            qty = Decimal(str(initial_balance))
        except (InvalidOperation, TypeError):
            raise InventoryError("initial_balance must be numeric.")
        if qty > 0:
            dest_loc = _resolve_destination(company, location_id)
            if not dest_loc:
                raise InventoryError("No usable destination location.")
            return LedgerService.transfer_stock(
                product_model=product,
                from_location=source_loc,
                to_location=dest_loc,
                quantity=qty,
                user=user,
                reason="Initial Stock Onboarding",
                supplier=supplier,
                purchased_cost=purchased_cost,
            )

    return None
