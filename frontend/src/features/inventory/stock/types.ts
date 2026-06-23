import type { InventoryProfile } from "../../../types/api";
import type { PhysicalProduct } from "../../../types/inventory";

// ── Stock-list-local shared types ──────────────────────────────────────
//
// These describe the polymorphic `products-poly` rows and the per-item
// fields the stock list reads off `physical-products` that are not part of
// the canonical API types. Kept local to this feature folder on purpose.

/** A single batch entry inside a BATCH-tracked product's `stock_value`. */
export interface StockBatchEntry {
    id: string;
    batch_identifier: string;
    qty: number;
    location?: string | null;
}

/**
 * `stock_value` is polymorphic per tracking mode:
 *  - BATCH / INDIVIDUAL → array of entries (only `length`/`map` are read here)
 *  - BULK / SIMPLE_COUNT → a scalar quantity
 */
export type StockValue = StockBatchEntry[] | number;

/** A row from the `products-poly` resource (All Products tab). */
export interface ProductStockRow {
    id: string;
    name: string;
    sku: string;
    profile: InventoryProfile;
    engine_type: string;
    tracking_mode: string;
    stock_value: StockValue;
    stock_total: number;
    stock_breakdown: Record<string, number>;
    unit?: string | null;
}

/**
 * A `physical-products` row augmented with the flattened, list-only fields
 * the Individual Items tab renders (batch + timestamps) which are not part
 * of the canonical `PhysicalProduct` shape.
 */
export interface PhysicalProductRow extends PhysicalProduct {
    batch_identifier?: string | null;
    quantity?: number | null;
    updated_at?: string | null;
}

// ── Stock detail (show) screen types ───────────────────────────────────

/** A `{ name, sku, id }`-style nested reference (model or location). */
export interface StockNestedRef {
    id?: string;
    name?: string;
    sku?: string;
}

/**
 * A `physical-products` detail record as read by the show screen. Both
 * `product_model` and `location` arrive polymorphically as either an id string
 * or a nested object, so the screen branches on `typeof`.
 */
export interface PhysicalProductDetail {
    id?: string;
    identifier?: string;
    status?: string;
    created_at?: string | null;
    updated_at?: string | null;
    batch_identifier?: string | null;
    work_order?: string | null;
    work_order_name?: string | null;
    product_model?: string | StockNestedRef | null;
    product_model_name?: string | null;
    product_model_details?: StockNestedRef | null;
    location?: string | StockNestedRef | null;
    location_name?: string | null;
    data?: Record<string, unknown> | null;
    attributes?: Record<string, unknown> | null;
}

/** Stock-level endpoint payload read by the show screen. */
export interface StockLevelDetail {
    status_counts?: Record<string, number>;
}

/** A movement row as rendered in the show screen's recent-movements table. */
export interface StockMovementRow {
    id: string;
    occurred_at?: string | null;
    reason?: string | null;
    quantity?: number | string | null;
    from_location?: { name?: string | null } | null;
    from_location_name?: string | null;
    to_location?: { name?: string | null } | null;
    to_location_name?: string | null;
}

/** A location option `{id, name}` for the create / edit selects. */
export interface StockLocationOption {
    id: string;
    name: string;
}

/** A `product-models` option `{id, sku, name}` for the create select. */
export interface StockModelOption {
    id: string;
    name: string;
    sku?: string;
}

/** A physical-product `edit` record (form seed values). */
export interface PhysicalProductEditRecord {
    identifier?: string;
    status?: string;
    location?: string | number | null;
    product_model_name?: string | null;
}
