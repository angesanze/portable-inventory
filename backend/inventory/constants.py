"""
Constants and magic strings for the inventory system.

This module centralizes all magic strings, status choices, and enum-like values
to avoid repetition and improve maintainability.
"""

# Tracking Modes
TRACKING_MODE_BULK = "BULK"
TRACKING_MODE_INDIVIDUAL = "INDIVIDUAL"
TRACKING_MODE_BATCH = "BATCH"

# Engine Types
ENGINE_TYPE_COUNTER = "counter"
ENGINE_TYPE_CONVERTER = "converter"
ENGINE_TYPE_BUCKET = "bucket"
ENGINE_TYPE_TRACKER = "tracker"

ENGINE_TYPE_DIMENSION = "dimension"
ENGINE_TYPE_TIME_BASED = "time_based"

ENGINE_TYPES = [
    (ENGINE_TYPE_COUNTER, "Counter (Discrete)"),
    (ENGINE_TYPE_CONVERTER, "Converter (Continuous)"),
    (ENGINE_TYPE_BUCKET, "Bucket (Segmented)"),
    (ENGINE_TYPE_TRACKER, "Item Tracker (Serialized)"),
    (ENGINE_TYPE_DIMENSION, "Dimension (Area/Volume)"),
    (ENGINE_TYPE_TIME_BASED, "Time-Based (Perishable/Rental)"),
]

# Strategy Types
STRATEGY_TYPE_BUCKET = "BUCKET"
STRATEGY_TYPE_ASSEMBLY = "ASSEMBLY"
STRATEGY_TYPE_CONVERTER = "CONVERTER"
STRATEGY_TYPE_TIME = "TIME"
STRATEGY_TYPE_DIMENSION = "DIMENSION"

# Location Types
LOCATION_TYPE_WAREHOUSE = "WAREHOUSE"
LOCATION_TYPE_STORE = "STORE"
LOCATION_TYPE_LOSS = "LOSS"
LOCATION_TYPE_VIRTUAL = "VIRTUAL"

LOCATION_TYPES = [
    (LOCATION_TYPE_WAREHOUSE, "Warehouse"),
    (LOCATION_TYPE_STORE, "Store"),
    (LOCATION_TYPE_LOSS, "Loss"),
    (LOCATION_TYPE_VIRTUAL, "Virtual"),
]

# Canonical name for the per-company LOSS location (scrap/shrinkage sink).
DEFAULT_LOSS_LOCATION_NAME = "Loss"

# Source-document kinds driving a transfer (Movement provenance).
SOURCE_DOCUMENT_PURCHASE = "PURCHASE"

# Reservation status (mirrors Reservation.STATUS_CHOICES).
RESERVATION_STATUS_ACTIVE = "ACTIVE"

# Physical Product Status
PHYSICAL_STATUS_ACTIVE = "ACTIVE"
PHYSICAL_STATUS_RECALL = "RECALL"
PHYSICAL_STATUS_EXPIRED = "EXPIRED"

PHYSICAL_STATUS_CHOICES = [
    (PHYSICAL_STATUS_ACTIVE, "Active"),
    (PHYSICAL_STATUS_RECALL, "Recall"),
    (PHYSICAL_STATUS_EXPIRED, "Expired"),
]

# Work Order Status
WORK_ORDER_STATUS_OPEN = "OPEN"
WORK_ORDER_STATUS_CLOSED = "CLOSED"
WORK_ORDER_STATUS_ARCHIVED = "ARCHIVED"

WORK_ORDER_STATUS_CHOICES = [
    (WORK_ORDER_STATUS_OPEN, "Open"),
    (WORK_ORDER_STATUS_CLOSED, "Closed"),
    (WORK_ORDER_STATUS_ARCHIVED, "Archived"),
]

# QR Code Status
QR_STATUS_VIRGIN = "VIRGIN"
QR_STATUS_CONFIGURED = "CONFIGURED"
QR_STATUS_LOCKED = "LOCKED"

QR_STATUS_CHOICES = [
    (QR_STATUS_VIRGIN, "Not Configured"),
    (QR_STATUS_CONFIGURED, "Configured"),
    (QR_STATUS_LOCKED, "Locked"),
]

# Monitoring Rule Triggers
TRIGGER_TYPE_THRESHOLD = "THRESHOLD"
TRIGGER_TYPE_DATE_OFFSET = "DATE_OFFSET"
TRIGGER_TYPE_CUSTOM = "CUSTOM"

TRIGGER_TYPES = [
    (TRIGGER_TYPE_THRESHOLD, "Threshold (Min/Max Quantity)"),
    (TRIGGER_TYPE_DATE_OFFSET, "Date Offset (Expiry/Maintenance)"),
    (TRIGGER_TYPE_CUSTOM, "Custom Expression"),
]

# Severity Levels
SEVERITY_INFO = "INFO"
SEVERITY_WARNING = "WARNING"
SEVERITY_CRITICAL = "CRITICAL"

SEVERITY_LEVELS = [
    (SEVERITY_INFO, "Info"),
    (SEVERITY_WARNING, "Warning"),
    (SEVERITY_CRITICAL, "Critical"),
]

# Event Log Status
EVENT_STATUS_OPEN = "OPEN"
EVENT_STATUS_RESOLVED = "RESOLVED"
EVENT_STATUS_IGNORED = "IGNORED"

EVENT_STATUS_CHOICES = [
    (EVENT_STATUS_OPEN, "Open"),
    (EVENT_STATUS_RESOLVED, "Resolved"),
    (EVENT_STATUS_IGNORED, "Ignored"),
]

# Default Values
DEFAULT_EXTERNAL_VENDOR_NAME = "External Vendor"
DEFAULT_ADJUSTMENT_LOCATION_NAME = "Inventory Adjustment"
DEFAULT_BATCH_AGGREGATED = "AGGREGATED"

# Counterparty Kinds
# The virtual location a stock change is booked against. A manual giacenza
# correction is an ADJUSTMENT (rettifica), NOT goods received from a VENDOR.
COUNTERPARTY_ADJUSTMENT = "ADJUSTMENT"
COUNTERPARTY_VENDOR = "VENDOR"
COUNTERPARTY_CUSTOMER = "CUSTOMER"
# TRANSIT: the single per-company virtual "In Transit" location goods sit in
# between an inter-site shipment (ship) and its reception (receive). NOT a
# per-pair location — one company has exactly one transit buffer.
COUNTERPARTY_TRANSIT = "TRANSIT"

COUNTERPARTY_KINDS = [
    (COUNTERPARTY_ADJUSTMENT, "Inventory Adjustment"),
    (COUNTERPARTY_VENDOR, "External Vendor"),
    (COUNTERPARTY_CUSTOMER, "External Customer"),
    (COUNTERPARTY_TRANSIT, "In Transit"),
]

DEFAULT_EXTERNAL_CUSTOMER_NAME = "External Customer"
DEFAULT_IN_TRANSIT_LOCATION_NAME = "In Transit"

# Per-kind canonical name + lookup aliases for the virtual counterparty location.
COUNTERPARTY_LOCATION_DEFS = {
    COUNTERPARTY_ADJUSTMENT: {
        "name": DEFAULT_ADJUSTMENT_LOCATION_NAME,
        "aliases": ["Inventory Adjustment", "Adjustment", "Rettifica", "Rettifica Inventario"],
    },
    COUNTERPARTY_VENDOR: {
        "name": DEFAULT_EXTERNAL_VENDOR_NAME,
        "aliases": ["External Vendor", "External", "Vendor"],
    },
    COUNTERPARTY_CUSTOMER: {
        "name": DEFAULT_EXTERNAL_CUSTOMER_NAME,
        "aliases": ["External Customer", "Customer"],
    },
    COUNTERPARTY_TRANSIT: {
        "name": DEFAULT_IN_TRANSIT_LOCATION_NAME,
        "aliases": ["In Transit", "Transit", "In transito"],
    },
}

# ── Inventory Profiles ──────────────────────────────────────────────
# A single axis that replaces tracking_mode × engine_type × strategy_type.
# Each profile is a named, valid combination of the three legacy axes.

PROFILE_SIMPLE_COUNT = "SIMPLE_COUNT"
PROFILE_UNIT_CONVERSION = "UNIT_CONVERSION"
PROFILE_DIMENSIONAL = "DIMENSIONAL"
PROFILE_BATCH_TRACKED = "BATCH_TRACKED"
PROFILE_PERISHABLE = "PERISHABLE"
PROFILE_SERIALIZED = "SERIALIZED"
PROFILE_ASSEMBLED = "ASSEMBLED"

INVENTORY_PROFILES = [
    (PROFILE_SIMPLE_COUNT, "Simple Count"),
    (PROFILE_UNIT_CONVERSION, "Unit Conversion"),
    (PROFILE_DIMENSIONAL, "Dimensional (Area/Volume)"),
    (PROFILE_BATCH_TRACKED, "Batch / Lot Tracked"),
    (PROFILE_PERISHABLE, "Perishable / Time-Based"),
    (PROFILE_SERIALIZED, "Serialized / Individual"),
    (PROFILE_ASSEMBLED, "Assembled / Kit"),
]

# Operations
OPERATION_ADD = "add"
OPERATION_SUBTRACT = "subtract"

# ── RMA / Returns (RMA-08) ──────────────────────────────────────────
# The quarantine area is a real (WAREHOUSE-type) location flagged
# is_sellable=False, created lazily per company. Goods returned by a
# customer land here until a resolution (restock / scrap / return to
# supplier) is decided.
DEFAULT_QUARANTINE_LOCATION_NAME = "Quarantena"

RMA_KIND_CUSTOMER_RETURN = "CUSTOMER_RETURN"
RMA_KIND_SUPPLIER_RETURN = "SUPPLIER_RETURN"

RMA_KINDS = [
    (RMA_KIND_CUSTOMER_RETURN, "Customer return"),
    (RMA_KIND_SUPPLIER_RETURN, "Supplier return"),
]

RMA_STATUS_OPEN = "OPEN"
RMA_STATUS_RECEIVED = "RECEIVED"
RMA_STATUS_RESOLVED = "RESOLVED"
RMA_STATUS_CANCELLED = "CANCELLED"

RMA_STATUSES = [
    (RMA_STATUS_OPEN, "Open"),
    (RMA_STATUS_RECEIVED, "Received"),
    (RMA_STATUS_RESOLVED, "Resolved"),
    (RMA_STATUS_CANCELLED, "Cancelled"),
]

RMA_REASON_DEFECTIVE = "DEFECTIVE"
RMA_REASON_WRONG_ITEM = "WRONG_ITEM"
RMA_REASON_EXPIRED = "EXPIRED"
RMA_REASON_OTHER = "OTHER"

RMA_REASON_CODES = [
    (RMA_REASON_DEFECTIVE, "Defective"),
    (RMA_REASON_WRONG_ITEM, "Wrong item"),
    (RMA_REASON_EXPIRED, "Expired"),
    (RMA_REASON_OTHER, "Other"),
]

RMA_RESOLUTION_PENDING = "PENDING"
RMA_RESOLUTION_RESTOCK = "RESTOCK"
RMA_RESOLUTION_SCRAP = "SCRAP"
RMA_RESOLUTION_RETURN_TO_SUPPLIER = "RETURN_TO_SUPPLIER"

RMA_RESOLUTIONS = [
    (RMA_RESOLUTION_PENDING, "Pending"),
    (RMA_RESOLUTION_RESTOCK, "Restock"),
    (RMA_RESOLUTION_SCRAP, "Scrap"),
    (RMA_RESOLUTION_RETURN_TO_SUPPLIER, "Return to supplier"),
]
