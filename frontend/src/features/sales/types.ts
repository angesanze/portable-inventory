/**
 * Feature-local API shapes for the Sales-Orders views.
 *
 * These mirror the fields the sales components actually read from the
 * sales-orders / pick_list / customers / product-models / locations
 * endpoints. Quantities arrive as decimal strings from DRF.
 */
import type { LocationType } from "../../types/api";

/** A single line on a sales order, as returned by the detail/list serializers. */
export interface SalesOrderLine {
    id: string;
    product_name: string;
    product_sku: string;
    product_profile: string;
    quantity_ordered: string;
    quantity_shipped: string;
    /** Present on the edit serializer payload (DRAFT lines). */
    product_model?: string | null;
    /** Present on the edit serializer payload (DRAFT lines). */
    unit_price?: string | number | null;
}

/** A sales order as read by view / edit / list components. */
export interface SalesOrderRecord {
    id: string;
    number: string;
    status: string;
    customer_name?: string | null;
    /** FK to the customer, surfaced on the edit serializer. */
    customer?: string | null;
    promised_at?: string | null;
    notes?: string | null;
    lines?: SalesOrderLine[];
}

/** A batch suggestion attached to a pick-list line. */
export interface PickListBatch {
    id: string;
    batch_identifier: string;
    quantity: string | number;
    expiry_date?: string | null;
    location?: string | null;
}

/** A serial suggestion attached to a pick-list line. */
export interface PickListSerial {
    identifier: string;
}

/** A single line of the `/pick_list/` endpoint payload. */
export interface PickListLine {
    line_id: string;
    product_name: string;
    product_sku: string;
    quantity_pending: string;
    reserved: string;
    serials?: PickListSerial[];
    batches?: PickListBatch[];
}

/** The `/pick_list/` endpoint payload. */
export interface PickList {
    lines?: PickListLine[];
}

/** Location option-source row for the destination select. */
export interface SalesLocationRow {
    id: string;
    name: string;
    type: LocationType;
}

/** Customer option-source row for the customer select. */
export interface SalesCustomerRow {
    id: string;
    name: string;
    vat_number?: string | null;
}

/** Product option-source row for the line product select. */
export interface SalesProductRow {
    id: string;
    name: string;
    sku: string;
}

/** One shipment entry in the `/ship/` request payload. */
export interface ShipmentEntry {
    line_id: string;
    quantity: string;
    serials?: string[];
    batch_id?: string;
}
