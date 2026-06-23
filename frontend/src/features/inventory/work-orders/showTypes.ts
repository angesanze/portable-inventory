/**
 * Local view-model types for the Work Order detail (show) screen.
 *
 * These describe the shape of the data the show screen actually consumes from
 * the API (which is richer than the canonical `WorkOrder` in `src/types/api.ts`).
 * They are intentionally scoped to this feature folder.
 */

/** Work order status values surfaced on the show screen. */
export type WorkOrderStatus = "OPEN" | "CLOSED" | "ARCHIVED";

/** Summary counts returned alongside a work order record. */
export interface WorkOrderContentsSummary {
    batch_count?: number;
    item_count?: number;
    total_items?: number;
}

/** Embedded product-model details on a work order record. */
export interface WorkOrderProductModelDetails {
    name?: string;
}

/** The work order record as consumed by the detail screen. */
export interface WorkOrderRecord {
    id?: string;
    name?: string;
    description?: string | null;
    status?: WorkOrderStatus;
    product_model_details?: WorkOrderProductModelDetails | null;
    product_model_sku?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    contents_summary?: WorkOrderContentsSummary | null;
}

/** Line-item type discriminant used to group contents. */
export type LineItemType = "BULK" | "BATCH" | "SERIAL";

/** A single line item within a work order's contents. */
export interface WorkOrderContentItem {
    type: LineItemType;
    product_id?: string;
    product_name?: string;
    sku?: string;
    quantity?: number | string;
    unit?: string;
    identifier?: string;
    batch_identifier?: string;
}

/** Location reference embedded on a movement. */
export interface MovementLocationRef {
    name?: string;
}

/** A stock movement linked to the work order.
 *
 * Shape mirrors `MovementReadSerializer` (the list/retrieve serializer): the
 * product name is flattened as `product_name` (source `product_model.name`) and
 * the free-text note is the Movement model's `reason` column — there is no
 * `product_model_name` or `description` field on the payload. */
export interface WorkOrderMovement {
    id: string;
    quantity?: number | string;
    occurred_at?: string | null;
    from_location?: MovementLocationRef | null;
    to_location?: MovementLocationRef | null;
    product_name?: string;
    reason?: string;
}

/** A product model option as returned by the `product-models` list. */
export interface ProductModelOption {
    id: string;
    sku?: string;
    name?: string;
    engine_type?: string;
    tracking_mode?: string;
    profile?: string;
}

/** A physical product as returned by the `physical-products` list. */
export interface PhysicalProductOption {
    id: string;
    identifier?: string;
}
