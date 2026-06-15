"""Catalogue import service (DATA-ONBOARDING-09).

Parses a CSV or XLSX upload into normalized rows, validates each row against the
company's catalogue (CREATE / UPDATE / ERROR), then commits row-by-row so one
broken row never blocks the others.

Hostile-file defenses: uploads are capped at 5 MB and 2000 rows, and XLSX is
read in openpyxl read-only mode.

Columns (header row required):
    sku*            — natural key (with company) for CREATE/UPDATE dispatch
    name*           — product name
    profile*        — INVENTORY_PROFILES value
    barcode         — GTIN/EAN/UPC (validated, unique per company when set)
    engine_config   — JSON string, validated per engine
    initial_stock   — opening balance (CREATE only)
    location        — destination location name for initial stock
    supplier        — supplier name for initial-stock attribution
    unit_cost       — receipt unit cost (→ Movement.purchased_cost)
    batch_identifier— BATCH/PERISHABLE lot id for initial stock
    expiry_date     — ISO date for perishable batch
    serials         — ';'-separated identifiers for SERIALIZED initial stock
"""

import csv
import io
import json
from decimal import Decimal, InvalidOperation

from django.db import transaction

from ..models import ProductModel, Location, Supplier
from ..profiles import profile_to_legacy
from ..engines import EngineFactory
from ..validators import validate_gtin
from ..constants import INVENTORY_PROFILES
from .onboarding import onboard_initial_stock

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_ROWS = 2000

CANONICAL_COLUMNS = [
    'sku', 'name', 'profile', 'barcode', 'engine_config', 'initial_stock',
    'location', 'supplier', 'unit_cost', 'batch_identifier', 'expiry_date', 'serials',
]

_VALID_PROFILES = {code for code, _ in INVENTORY_PROFILES}


class ImportError_(Exception):
    """Raised for whole-file failures (oversize, unreadable, missing headers)."""


def _normalize_header(name):
    return (name or '').strip().lower().replace(' ', '_')


def parse(file):
    """Parse an uploaded CSV/XLSX file into a list of normalized row dicts.

    Each dict has lowercased canonical-or-extra keys and a 1-based `_row`
    line number (excluding the header). Raises ImportError_ on whole-file
    problems. Cell values are strings (or '' for blanks); empty cells are ''.
    """
    raw = file.read()
    if isinstance(raw, str):
        raw = raw.encode('utf-8')
    if len(raw) > MAX_FILE_BYTES:
        raise ImportError_(f"File too large (limit {MAX_FILE_BYTES // (1024 * 1024)} MB).")

    name = (getattr(file, 'name', '') or '').lower()
    if name.endswith('.xlsx') or raw[:2] == b'PK':
        rows = _parse_xlsx(raw)
    else:
        rows = _parse_csv(raw)

    if len(rows) > MAX_ROWS:
        raise ImportError_(f"Too many rows (limit {MAX_ROWS}).")
    return rows


def _parse_csv(raw):
    text = raw.decode('utf-8-sig', errors='replace')
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        raise ImportError_("Empty file.")
    keys = [_normalize_header(h) for h in header]
    if 'sku' not in keys or 'name' not in keys or 'profile' not in keys:
        raise ImportError_("Missing required header(s): sku, name, profile.")

    rows = []
    for i, raw_row in enumerate(reader, start=1):
        # Skip completely blank lines.
        if not any((c or '').strip() for c in raw_row):
            continue
        row = {keys[j]: (raw_row[j].strip() if j < len(raw_row) and raw_row[j] is not None else '')
               for j in range(len(keys))}
        row['_row'] = i
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise ImportError_(f"Too many rows (limit {MAX_ROWS}).")
    return rows


def _parse_xlsx(raw):
    try:
        import openpyxl
    except ImportError:  # pragma: no cover - guarded by requirements
        raise ImportError_("XLSX support requires openpyxl on the server.")

    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as exc:
        raise ImportError_(f"Could not read XLSX file: {exc}")

    ws = wb.active
    rows = []
    header = None
    keys = []
    data_idx = 0
    for sheet_row in ws.iter_rows(values_only=True):
        if header is None:
            header = sheet_row
            keys = [_normalize_header(str(h) if h is not None else '') for h in header]
            if 'sku' not in keys or 'name' not in keys or 'profile' not in keys:
                wb.close()
                raise ImportError_("Missing required header(s): sku, name, profile.")
            continue
        if sheet_row is None or not any(
            (str(c).strip() if c is not None else '') for c in sheet_row
        ):
            continue
        data_idx += 1
        row = {}
        for j in range(len(keys)):
            val = sheet_row[j] if j < len(sheet_row) else None
            row[keys[j]] = '' if val is None else str(val).strip()
        row['_row'] = data_idx
        rows.append(row)
        if len(rows) > MAX_ROWS:
            wb.close()
            raise ImportError_(f"Too many rows (limit {MAX_ROWS}).")
    wb.close()
    return rows


def _parse_serials(value):
    if not value:
        return []
    return [s.strip() for s in str(value).split(';') if s.strip()]


def validate_rows(company, rows):
    """Classify each parsed row as CREATE / UPDATE / ERROR.

    Returns a list of result dicts:
        {row, sku, name, action, errors:[...]}
    `action` is 'CREATE', 'UPDATE' or 'ERROR'. Existing SKUs (per company) map
    to UPDATE; new SKUs to CREATE. initial_stock on an UPDATE row is rejected
    (v1 — rectifications go through stocktake, not import).
    Reuses validate_gtin and the engine `validate_config` validators.
    """
    existing_skus = set(
        ProductModel.objects.filter(company=company).values_list('sku', flat=True)
    )
    # Track barcodes already taken in DB and within this batch to flag clashes.
    db_barcodes = {
        b for b in ProductModel.objects.filter(company=company)
        .exclude(barcode='').values_list('barcode', flat=True)
    }
    seen_skus_in_batch = {}
    seen_barcodes_in_batch = {}

    results = []
    for row in rows:
        errors = []
        sku = (row.get('sku') or '').strip()
        name = (row.get('name') or '').strip()
        profile = (row.get('profile') or '').strip().upper()
        barcode = (row.get('barcode') or '').strip()

        if not sku:
            errors.append("sku is required.")
        if not name:
            errors.append("name is required.")
        if not profile:
            errors.append("profile is required.")
        elif profile not in _VALID_PROFILES:
            errors.append(f"Invalid profile '{profile}'.")

        is_update = sku in existing_skus
        action = 'UPDATE' if is_update else 'CREATE'

        # Duplicate SKU within the same file.
        if sku and sku in seen_skus_in_batch:
            errors.append(f"Duplicate sku in file (also row {seen_skus_in_batch[sku]}).")
        elif sku:
            seen_skus_in_batch[sku] = row.get('_row')

        # Barcode GTIN check + uniqueness.
        if barcode:
            if not validate_gtin(barcode):
                errors.append(f"Invalid barcode '{barcode}' (failed GTIN check digit).")
            else:
                clash_db = barcode in db_barcodes and not is_update
                clash_batch = barcode in seen_barcodes_in_batch
                if clash_batch:
                    errors.append(
                        f"Duplicate barcode in file (also row {seen_barcodes_in_batch[barcode]})."
                    )
                elif clash_db:
                    errors.append(f"Barcode '{barcode}' already used by another product.")
                seen_barcodes_in_batch[barcode] = row.get('_row')

        # engine_config JSON + per-engine validation.
        engine_config = {}
        ec_raw = (row.get('engine_config') or '').strip()
        if ec_raw:
            try:
                engine_config = json.loads(ec_raw)
                if not isinstance(engine_config, dict):
                    raise ValueError("engine_config must be a JSON object.")
            except (ValueError, json.JSONDecodeError) as exc:
                errors.append(f"engine_config is not valid JSON: {exc}")
                engine_config = {}
        if engine_config and profile in _VALID_PROFILES:
            _, engine_type, _ = profile_to_legacy(profile)
            ec_errors = EngineFactory.validate_config(engine_type, engine_config)
            if ec_errors:
                errors.append("engine_config invalid: " + "; ".join(ec_errors))

        # initial_stock numeric + UPDATE rejection.
        initial_stock_raw = (row.get('initial_stock') or '').strip()
        if initial_stock_raw:
            if is_update:
                errors.append("initial_stock is only allowed on new products (CREATE).")
            else:
                try:
                    qty = Decimal(initial_stock_raw)
                    if qty < 0:
                        errors.append("initial_stock cannot be negative.")
                except (InvalidOperation, TypeError):
                    errors.append("initial_stock must be numeric.")

        # unit_cost numeric.
        unit_cost_raw = (row.get('unit_cost') or '').strip()
        if unit_cost_raw:
            try:
                Decimal(unit_cost_raw)
            except (InvalidOperation, TypeError):
                errors.append("unit_cost must be numeric.")

        # location existence (only matters when there is initial stock).
        loc_name = (row.get('location') or '').strip()
        if loc_name and not is_update:
            if not Location.objects.filter(company=company, name=loc_name).exists():
                errors.append(f"Location '{loc_name}' does not exist.")

        # expiry_date shape (lenient: only flag obvious garbage).
        expiry = (row.get('expiry_date') or '').strip()
        if expiry:
            import datetime
            ok = False
            for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y'):
                try:
                    datetime.datetime.strptime(expiry, fmt)
                    ok = True
                    break
                except ValueError:
                    continue
            if not ok:
                errors.append(f"expiry_date '{expiry}' is malformed (expected YYYY-MM-DD).")

        results.append({
            'row': row.get('_row'),
            'sku': sku,
            'name': name,
            'action': 'ERROR' if errors else action,
            'errors': errors,
        })

    return results


def _to_decimal(value):
    value = (value or '').strip()
    if not value:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError):
        return None


def commit(company, rows, user):
    """Commit parsed rows atomically PER ROW.

    Re-validates (so a stale dry-run can't smuggle a bad row through), then for
    each non-error row creates/updates the ProductModel and books initial stock
    on CREATE via the shared onboarding helper. Each row runs in its own
    savepoint: a failure rolls back just that row and is reported, leaving the
    rest committed.

    Returns {created, updated, errors, results:[per-row dicts]}.
    """
    validations = {v['row']: v for v in validate_rows(company, rows)}

    created = updated = error_count = 0
    results = []

    for row in rows:
        rownum = row.get('_row')
        verdict = validations.get(rownum, {'action': 'ERROR', 'errors': ['unknown row']})
        if verdict['action'] == 'ERROR':
            error_count += 1
            results.append({
                'row': rownum, 'sku': verdict.get('sku'),
                'action': 'ERROR', 'errors': verdict.get('errors', []),
            })
            continue

        try:
            with transaction.atomic():
                action = _commit_row(company, row, user)
            if action == 'CREATE':
                created += 1
            else:
                updated += 1
            results.append({
                'row': rownum, 'sku': verdict.get('sku'),
                'action': action, 'errors': [],
            })
        except Exception as exc:  # row isolated — report and continue
            error_count += 1
            results.append({
                'row': rownum, 'sku': verdict.get('sku'),
                'action': 'ERROR', 'errors': [str(exc)],
            })

    return {
        'created': created,
        'updated': updated,
        'errors': error_count,
        'results': results,
    }


def _commit_row(company, row, user):
    """Create/update a single product (+ optional initial stock). Returns action."""
    sku = (row.get('sku') or '').strip()
    name = (row.get('name') or '').strip()
    profile = (row.get('profile') or '').strip().upper()
    barcode = (row.get('barcode') or '').strip()

    engine_config = {}
    ec_raw = (row.get('engine_config') or '').strip()
    if ec_raw:
        engine_config = json.loads(ec_raw)

    existing = ProductModel.objects.filter(company=company, sku=sku).first()
    if existing is not None:
        existing.name = name
        existing.profile = profile
        if barcode:
            existing.barcode = barcode
        if engine_config:
            existing.engine_config = engine_config
        existing.save()
        return 'UPDATE'

    # License quota (GOVERNANCE-11): a CREATE counts against max_products, same
    # as the single-create paths. Each row runs in its own savepoint, so a
    # LimitReached here is reported against that row and the import continues.
    from core.license_limits import check_product_limit
    check_product_limit(company, user=user)

    product = ProductModel(
        company=company,
        sku=sku,
        name=name,
        profile=profile,
        barcode=barcode,
        engine_config=engine_config or {},
    )
    product.save()

    # Initial stock (CREATE only). Resolve supplier / build branch payloads.
    supplier = None
    supplier_name = (row.get('supplier') or '').strip()
    if supplier_name:
        supplier, _ = Supplier.objects.get_or_create(company=company, name=supplier_name)

    location_id = None
    loc_name = (row.get('location') or '').strip()
    if loc_name:
        loc = Location.objects.filter(company=company, name=loc_name).first()
        if loc is not None:
            location_id = loc.id

    unit_cost = _to_decimal(row.get('unit_cost'))

    serials = _parse_serials(row.get('serials'))
    initial_stock = _to_decimal(row.get('initial_stock'))
    batch_identifier = (row.get('batch_identifier') or '').strip()
    expiry = (row.get('expiry_date') or '').strip()

    initial_batch = None
    initial_serials = None
    initial_balance = None

    tracking_mode = product.tracking_mode
    if tracking_mode == 'INDIVIDUAL':
        if serials:
            initial_serials = serials
    elif tracking_mode == 'BATCH':
        if initial_stock and initial_stock > 0:
            initial_batch = {
                'batch_identifier': batch_identifier or f"IMP-{sku}",
                'initial_quantity': str(initial_stock),
                'initial_location_id': location_id,
                'expiry_date': expiry or None,
            }
    else:  # BULK
        if initial_stock and initial_stock > 0:
            initial_balance = initial_stock

    if initial_batch or initial_serials or initial_balance is not None:
        onboard_initial_stock(
            product=product,
            user=user,
            company=company,
            location_id=location_id,
            supplier=supplier,
            initial_balance=initial_balance,
            initial_batch=initial_batch,
            initial_serials=initial_serials,
            purchased_cost=unit_cost,
        )

    return 'CREATE'
