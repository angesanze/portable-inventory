/**
 * Feature-local API row/record shapes for the Returns feature.
 *
 * These mirror the relevant fields of the DRF `return-orders` payloads as
 * consumed by the list / edit / resolve screens. They are intentionally
 * partial — only the fields actually read by the UI are typed.
 */
import type { ReturnKind } from "./returnForm";

/** A row in the return-orders list response. */
export interface ReturnOrderRow {
    id: string;
    number: string;
    kind: string;
    status: string;
    reason_code: string;
    customer_name?: string | null;
    supplier_name?: string | null;
    lines?: unknown[];
}

/** A line on a return order (edit screen reads product_model + quantity). */
export interface ReturnOrderLine {
    id: string;
    product_model: string | { id: string } | null;
    quantity: string | number;
}

/** Full return-order record (edit screen). */
export interface ReturnOrderRecord {
    id: string;
    kind: ReturnKind;
    status: string;
    reason_code?: string | null;
    customer?: string | null;
    supplier?: string | null;
    sales_order?: string | null;
    purchase_order?: string | null;
    notes?: string | null;
    lines?: ReturnOrderLine[];
}

/** A pending/resolved line as rendered on the resolve screen. */
export interface ResolveLine {
    id: string;
    resolution: string;
    product_name: string;
    product_sku: string;
    physical_identifier?: string | null;
    quantity: string | number;
}

/** Full return-order record as consumed by the resolve screen. */
export interface ResolveOrderRecord {
    id: string;
    number: string;
    kind: string;
    status: string;
    customer_name?: string | null;
    supplier_name?: string | null;
    lines?: ResolveLine[];
}

/** One resolution entry in the resolve payload. */
export interface ResolutionEntry {
    line_id: string;
    resolution: string;
    location_id?: string;
    supplier_id?: string;
}

/** Option-source rows for the ReturnForm selects. */
export interface ProductOptionRow {
    id: string;
    name: string;
    sku: string;
}

export interface PartyOptionRow {
    id: string;
    name: string;
}

export interface OrderOptionRow {
    id: string;
    number: string;
    // Optional (may be absent); fed straight into a Select option `description`,
    // which is `string | undefined` — so kept non-null here.
    customer_name?: string;
    supplier_name?: string;
}

/** Location row used by the resolve destination select. */
export interface ResolveLocationRow {
    id: string;
    name: string;
    type: string;
    is_sellable?: boolean;
}
