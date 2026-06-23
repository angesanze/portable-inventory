/**
 * Feature-local API shapes for the Purchase-Orders views.
 *
 * These mirror the fields the purchasing components actually read from the
 * purchase-orders / receive / suppliers / product-models / locations
 * endpoints. Quantities arrive as decimal strings from DRF.
 */
import type { LocationType } from "../../types/api";

/** A single line on a purchase order, as returned by the detail/list serializers. */
export interface PurchaseOrderLine {
    id: string;
    product_name: string;
    product_sku: string;
    product_profile: string;
    quantity_ordered: string;
    quantity_received: string;
    /** Present on the edit serializer payload (DRAFT lines). */
    product_model?: string | null;
    /** Present on the edit serializer payload (DRAFT lines). */
    unit_cost?: string | number | null;
}

/** A purchase order as read by receive / edit / list components. */
export interface PurchaseOrderRecord {
    id: string;
    number: string;
    status: string;
    supplier_name?: string | null;
    /** FK to the supplier, surfaced on the edit serializer. */
    supplier?: string | null;
    expected_at?: string | null;
    notes?: string | null;
    lines?: PurchaseOrderLine[];
}

/** Location option-source row for the destination select. */
export interface PurchaseLocationRow {
    id: string;
    name: string;
    type: LocationType;
}

/** Supplier option-source row for the supplier select. */
export interface PurchaseSupplierRow {
    id: string;
    name: string;
    vat_number?: string | null;
}

/**
 * Product option-source row for the line product select. Carries the
 * list serializer's `stock_summary` so the average-cost hint needs no
 * extra request.
 */
export interface PurchaseProductRow {
    id: string;
    name: string;
    sku: string;
    stock_summary?: {
        avg_unit_cost?: string | number | null;
    } | null;
}

/** Batch metadata nested in a `/receive/` line entry. */
export interface ReceiptBatchData {
    batch_identifier?: string;
    lot_number?: string;
}

/** One receipt entry in the `/receive/` request payload. */
export interface ReceiptEntry {
    line_id: string;
    quantity: string;
    serials?: string[];
    batch_data?: ReceiptBatchData;
    expiry_date?: string;
}
