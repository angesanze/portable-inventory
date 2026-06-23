/**
 * Feature-local view-model types for the Products feature.
 *
 * These describe the *shape the UI actually consumes* from the various
 * Refine data hooks (`useList`/`useOne`/`useForm`/`useCustom`/`useSelect`)
 * for product models and the polymorphic product instances. They are kept
 * local to this feature (rather than in `src/types/api.ts`) because the
 * underlying endpoints return profile-/engine-dependent payloads and the
 * canonical API types are intentionally stricter than these list/edit views.
 *
 * All record types include an `id` so they satisfy Refine's `BaseRecord`
 * constraint when passed as generic arguments to its hooks.
 */
import type { InventoryProfile, EngineType } from "../../types/api";
import type { ProductExportRow } from "./models/exportColumns";

/**
 * Compact stock summary embedded in each product-model list row
 * (rendered by `formatStockDisplay`).
 */
export interface ProductStockSummary {
    total?: number | string | null;
    tracking_mode?: string;
    status?: string;
    batch_count?: number | null;
    unit?: string | null;
    avg_unit_cost?: number | string | null;
    stock_value?: number | string | null;
}

/**
 * Product-model row as rendered by the list page.
 *
 * Extends {@link ProductExportRow} so the same rows can be passed straight to
 * `exportToExcel(rows, PRODUCT_EXPORT_COLUMNS, …)` and `fetchAllPages` without
 * a cast — the export columns and the table read the same payload.
 */
export interface ProductModelRow extends ProductExportRow {
    id: string;
    created_at?: string;
    stock_summary?: ProductStockSummary | null;
}

/** A bill-of-materials component line as returned on a model record. */
export interface ModelComponent {
    child: string;
    child_name?: string;
    quantity: number | string;
}

/** Editable component row tracked in the edit-form local state. */
export interface ComponentItem {
    product_model_id: string;
    quantity: number;
    /** Stable React list key (also reused as the rendered key). */
    key: number;
}

/**
 * Product-model record as consumed by the edit form
 * (`useForm` queryResult payload). Permissive because the shape is
 * profile-dependent and only a subset of fields is read here.
 */
export interface ProductModelEditRecord {
    id: string;
    name?: string;
    sku?: string;
    barcode?: string;
    profile?: InventoryProfile | string;
    engine_type?: string;
    engine_config?: Record<string, unknown>;
    default_calculator?: string | null;
    components?: ModelComponent[];
    attributes?: { min_threshold?: number | string } & Record<string, unknown>;
}

/** A model row used to build the kit "component model" select options. */
export interface ComponentModelOption {
    id: string;
    sku?: string;
    name?: string;
    profile?: InventoryProfile | string;
    engine_type?: string;
}

/** Stock-level payload from `/api/v1/stock/:id/level` (only `total` is read). */
export interface StockLevelSummary {
    total?: number | string | null;
}

/** Form values collected from the edit form's `FormData` plus derived fields. */
export interface ProductModelEditValues {
    components?: Array<{ child: string; quantity: number }>;
    default_calculator?: string | null;
    engine_config?: Record<string, unknown>;
    min_threshold?: string;
    attributes?: Record<string, unknown>;
    [key: string]: unknown;
}

/** Location row consumed by the create form's destination-location select. */
export interface LocationOptionRow {
    id: string;
    name: string;
    type?: string;
}

/** Supplier row consumed by the create form's supplier select. */
export interface SupplierOptionRow {
    id: string;
    name: string;
    vat_number?: string | null;
}

/** Mutation-success payload from `useForm` create (`onMutationSuccess`). */
export interface CreatedModelResult {
    data: { id: string };
}

/** Request body built by the create form (profile-dependent). */
export interface ProductModelCreateValues {
    sku: string;
    name: string;
    barcode?: string;
    description?: string;
    profile: InventoryProfile;
    engine_config?: Record<string, unknown>;
    default_calculator?: string;
    initial_balance?: number;
    initial_dimensions?: Record<string, number>;
    initial_location_id?: string;
    initial_supplier_id?: string;
    initial_serials?: string[];
    initial_batch?: {
        batch_identifier: string;
        initial_quantity: number;
        initial_location_id?: string;
        lot_number?: string;
        expiry_date?: string;
    };
}

/**
 * One batch/allocation entry inside a polymorphic product's `stock_value`
 * when the engine is bucket/tracker (array form).
 *
 * `work_order*` are typed as plain strings (matching the strategy-view
 * `StockBucket` contract this is fed into) — an absent kit is `undefined`.
 */
export interface PolyStockBatch {
    quantity?: number;
    qty?: number;
    work_order?: string;
    work_order_id?: string;
    /**
     * Buckets carry profile-dependent extra keys (rendered dynamically by the
     * strategy views); the open index keeps this assignable to their
     * `StockBucket` contract.
     */
    [key: string]: unknown;
}

/** Scalar/object form of a polymorphic product's `stock_value`. */
export interface PolyStockObject {
    total?: number | string | null;
}

/**
 * `stock_value` is polymorphic: an array of batches (bucket/tracker),
 * a scalar (counter/converter), or an object/`null` default.
 */
export type PolyStockValue =
    | PolyStockBatch[]
    | PolyStockObject
    | number
    | string
    | null;

/** Polymorphic product instance row as rendered by the poly list page. */
export interface PolyProductRow {
    id: string;
    name?: string;
    engine_type?: string;
    stock_value?: PolyStockValue;
}

/**
 * Polymorphic product instance as consumed by the detail (show) page.
 *
 * `stock_value` is narrowed to `number | PolyStockBatch[]` so the record can be
 * handed straight to the strategy-view components (`QuickAdjust`/`BatchManager`)
 * whose `stock_value` props are `number | StockBucket[]`; the scalar/string and
 * object/`null` default forms are handled by the page's runtime `typeof`
 * branches (which simply fall through to `0`).
 */
export interface PolyShowProduct {
    id: string;
    name?: string;
    /** Required: the show page renders `engine_type.toUpperCase()` unguarded. */
    engine_type: string;
    profile?: string;
    tracking_mode?: string;
    stock_value?: number | PolyStockBatch[];
}

/** A unique kit extracted from a poly product's batch allocations. */
export interface PolyKitRef {
    name?: string | null;
    id?: string | null;
}

/** A movement row as consumed by the poly show page's activity chart/list. */
export interface PolyMovementRow {
    id?: string;
    quantity: number | string;
    occurred_at?: string;
    movement_type?: string;
}

/** Engine type re-export for convenience within the feature. */
export type { EngineType };
