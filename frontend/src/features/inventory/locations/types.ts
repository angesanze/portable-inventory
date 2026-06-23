/**
 * Feature-local API row/record shapes for the Locations feature.
 *
 * Partial mirrors of the DRF `locations`, `physical-products` and `movements`
 * payloads as consumed by the list / show / create / edit screens.
 */

/** A row in the locations list response (also the create/edit parent picker). */
export interface LocationRow {
    id: string;
    name: string;
    type: string;
    parent_id?: string | null;
    parent_name?: string | null;
}

/** Full location record (show screen). */
export interface LocationRecord {
    id: string;
    name: string;
    type: string;
    parent_id?: string | null;
    parent_name?: string | null;
    created_at?: string | null;
}

/** A physical-product / stock item rendered in the location's inventory list. */
export interface LocationInventoryItem {
    id: string;
    product_model_name?: string | null;
    name?: string | null;
    sku?: string | null;
    serial_number?: string | null;
    status?: string | null;
    quantity?: string | number | null;
}

/** A movement rendered in the location's recent-activity list. */
export interface LocationMovement {
    id: string;
    product_model_name?: string | null;
    from_location?: { name?: string | null } | null;
    to_location?: { name?: string | null } | null;
    quantity: string | number;
    reason?: string | null;
    occurred_at: string;
}
