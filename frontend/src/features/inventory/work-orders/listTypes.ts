/**
 * Local view-model types for the Work Order list + create screens.
 *
 * These describe just the subset of each API record the list/create forms read
 * (Refine `useList`/`useOne` return loosely-typed records). Kept scoped to this
 * feature folder, alongside the show-screen types in `showTypes.ts`.
 */

import type { WorkOrderExportRow } from "./exportColumns";

/**
 * A work-order row as rendered by the list table. Extends the export-row shape
 * so list rows can be passed straight to `exportToExcel` / `fetchAllPages`.
 */
export interface WorkOrderListRow extends WorkOrderExportRow {
    id: string;
    contents_summary?: { total_items?: number | null } | null;
    updated_at?: string | null;
}

/** A single entry in the work-order `contents` endpoint payload. */
export interface WorkOrderContentRow {
    product_name?: string;
    sku?: string;
    quantity?: number | string;
}

/**
 * A `product-models` row as consumed by the create form. Richer than the
 * canonical type: includes the engine discriminator and (on the detail fetch)
 * the embedded BOM `components`.
 */
export interface WorkOrderProductModel {
    id: string;
    name: string;
    sku?: string;
    engine_type?: string;
    profile?: string;
    tracking_mode?: string;
    components?: WorkOrderModelComponent[];
}

/** A BOM component embedded on a template product-model detail record. */
export interface WorkOrderModelComponent {
    child: string;
    quantity: number | string;
}

/** A serialized physical-product option for the serial picker. */
export interface WorkOrderSerialOption {
    id: string;
    identifier?: string;
}

/** A line item in the create-form local state (`items`). */
export interface WorkOrderLineItem {
    product_model_id: string;
    quantity: number;
    temp_serials: string[];
    locked?: boolean;
    key: number;
}

/** A single payload item POSTed when creating a work order. */
export interface WorkOrderPayloadItem {
    product_model_id: string;
    quantity: number;
    physical_product_id: string;
}
