/**
 * Feature-local API row/record shapes for the Transfers feature.
 *
 * Partial mirrors of the DRF `transfer-orders` payloads as consumed by the
 * list / edit / receive screens — only fields read by the UI are typed.
 */

/** A row in the transfer-orders list response. */
export interface TransferOrderRow {
    id: string;
    number: string;
    status: string;
    from_location_name?: string | null;
    to_location_name?: string | null;
    shipped_at?: string | null;
    lines?: unknown[];
}

/** A line on a transfer order (edit screen). */
export interface TransferOrderLine {
    product_model: string | null;
    quantity_sent: string | number | null;
}

/** Full transfer-order record (edit screen). */
export interface TransferOrderRecord {
    id: string;
    status?: string;
    from_location?: string | null;
    to_location?: string | null;
    notes?: string | null;
    lines?: TransferOrderLine[];
}

/** A line as rendered on the receive screen. */
export interface ReceiveLine {
    id: string;
    product_name: string;
    product_sku: string;
    quantity_sent: string | number;
    quantity_received: string | number;
    quantity_shortage: string | number;
}

/** Full transfer-order record as consumed by the receive screen. */
export interface ReceiveOrderRecord {
    id: string;
    number: string;
    status: string;
    from_location_name?: string | null;
    to_location_name?: string | null;
    lines?: ReceiveLine[];
}

/** Location option-source row (filtered to real stock-holding locations). */
export interface TransferLocationRow {
    id: string;
    name: string;
    type: string;
}

/** Product option-source row for the transfer line selects. */
export interface TransferProductRow {
    id: string;
    name: string;
    sku: string;
}

/** A by-product entry in the in-transit report. */
export interface InTransitProduct {
    product_id: string;
    name: string;
    quantity: string | number;
}

/** Response payload of the in-transit report endpoint. */
export interface InTransitReport {
    total: string | number;
    by_product: InTransitProduct[];
}
