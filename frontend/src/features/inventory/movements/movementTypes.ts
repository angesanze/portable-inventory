import type { EngineUiConfig, InventoryProfile, LocationType } from "../../../types/api";

/**
 * Local view-model types for the movement-creation form. These describe just the
 * subset of each API record the form reads (Refine `useList`/`useCustom` return
 * loosely-typed records), keeping the form fully typed without leaking `any`.
 */

/** Snapshot persisted to ``sessionStorage`` before an inline-create jump (CLEANUP-05). */
export interface MovementDraft {
    productId: string;
    direction: string;
    quantity: string;
    locationId: string;
    reason: string;
    supplierId: string;
    batchIdentifier: string;
    batchLotNumber: string;
    batchExpiry: string;
    identifier: string;
}

/** ProductModel fields the movement form consumes. */
export interface MovementProduct {
    id: string;
    name: string;
    sku?: string;
    profile?: InventoryProfile;
    engine_ui_config?: EngineUiConfig | null;
}

/** Location fields the movement form consumes. */
export interface MovementLocation {
    id: string;
    name: string;
    type: LocationType;
}

/** Supplier fields the movement form consumes. */
export interface MovementSupplier {
    id: string;
    name: string;
    vat_number?: string | null;
}

/** PhysicalProduct fields used for the tracker current-status lookup. */
export interface MovementPhysicalProduct {
    id: string;
    identifier: string;
    status: string;
}

/** Stock-level endpoint payload (current quantity at a location). */
export interface StockLevelResponse {
    quantity?: number;
}

/** Payload sent for a tracker (status-change) movement. */
export interface TrackerPayload {
    product_id: string;
    physical_identifier: string;
    transaction_type: "status_change";
    new_status: string;
    notes?: string;
}

/** Payload sent for a directional (inbound/outbound) movement. */
export interface MovementPayload {
    product_id: string;
    quantity: number;
    reason: string;
    from_id?: string;
    to_id?: string;
    from_location_name?: string;
    to_location_name?: string;
    supplier_id?: string;
    batch_data?: Record<string, string>;
    physical_identifier?: string;
}

/**
 * The "external" side of a receipt/shipment is the External Vendor virtual
 * location specifically — NOT just any VIRTUAL (e.g. "Inventory Adjustment"),
 * otherwise receipts get mislabeled as adjustments.
 */
export const VENDOR_ALIASES = ["External Vendor", "External", "Vendor"];

// ── Transfer-form-local types ──────────────────────────────────────────

/** ProductModel fields the transfer form consumes. */
export interface TransferProduct {
    id: string;
    name: string;
    sku?: string;
    tracking_mode?: string;
    engine_type?: string;
}

/** Location fields the transfer form consumes. */
export interface TransferLocation {
    id: string;
    name: string;
    type: LocationType;
}

/** Payload POSTed for a stock transfer between two real locations. */
export interface TransferPayload {
    product_id: string;
    from_id: string;
    to_id: string;
    quantity: number;
    reason: string;
    batch_data?: Record<string, string>;
    physical_identifier?: string;
}
