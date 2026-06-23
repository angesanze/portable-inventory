/**
 * Local view-model types for the Product Model "show" page.
 *
 * These describe the *shape the UI actually consumes* from the
 * `useOne(product-models)`, `useCustom(/stock/:id/level)` and
 * `useList(movements)` responses. They are intentionally permissive
 * (most fields optional) because the underlying endpoints return
 * profile-dependent payloads, and are kept local to this feature to
 * avoid clashing with the canonical API types in `src/types/api.ts`.
 */
import type { BadgeVariant } from "../../../../components/ui/Badge";
import type { InventoryProfile } from "../../../../types/api";
import type { TFunction } from "i18next";

/** A single bill-of-materials line on an assembled/kit model. */
export interface KitComponent {
    child?: string;
    child_name?: string;
    quantity: number;
}

/** Product model record as rendered by the detail page. */
export interface ProductModelDetail {
    id: string;
    name?: string;
    sku?: string;
    description?: string;
    profile?: InventoryProfile | string;
    engine_config?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
    components?: KitComponent[];
}

/** One batch/lot row inside a BATCH-mode stock level. */
export interface StockBatch {
    id: string;
    batch_identifier: string;
    quantity: number;
    location?: string;
    data?: { expiry_date?: string } & Record<string, unknown>;
}

/** One serialized item inside an INDIVIDUAL-mode stock level. */
export interface StockItem {
    id: string;
    identifier: string;
    status: string;
    location?: string;
}

/** Stock level payload returned by `/api/v1/stock/:id/level`. */
export interface StockLevel {
    total?: number;
    tracking_mode?: string;
    profile?: string;
    reserved?: number | null;
    available?: number | null;
    breakdown?: Record<string, number>;
    batches?: StockBatch[];
    items?: StockItem[];
    status_counts?: Record<string, number>;
    quarantine_total?: number;
    quarantine_breakdown?: Record<string, number>;
}

/** Location reference as embedded in a movement row. */
export interface MovementLocationRef {
    name?: string;
}

/** A single recent-movement row. */
export interface MovementRow {
    id: string;
    quantity: number;
    occurred_at: string;
    reason?: string;
    supplier_name?: string;
    from_location?: MovementLocationRef;
    to_location?: MovementLocationRef;
}

export type ExpiryBucket = "expired" | "critical" | "warning" | "ok";

export interface ExpiryInfo {
    bucket: ExpiryBucket;
    variant: BadgeVariant;
    textClass: string;
    labelKey: "expired" | "expiringSoon" | null;
    daysText: (t: TFunction) => string;
}
