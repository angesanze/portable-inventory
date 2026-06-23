/**
 * Feature-local API row/record shapes for the Stocktake feature.
 *
 * Partial mirrors of the DRF `count-sessions` payloads (list / detail /
 * variance) as consumed by the list / create / view screens.
 */

/** A row in the count-sessions list response. */
export interface CountSessionRow {
    id: string;
    status: string;
    location_name?: string | null;
    line_count?: number | null;
    created_at?: string | null;
}

/** A line within a count session (view / count tab). */
export interface CountSessionLine {
    id: string;
    product_name: string;
    product_sku: string;
    identifier?: string | null;
    batch_identifier?: string | null;
    expected_qty: string | number;
    counted_qty?: string | number | null;
}

/** Full count-session record (view screen). */
export interface CountSessionRecord {
    id: string;
    status: string;
    location_name?: string | null;
    lines?: CountSessionLine[];
}

/** A variance entry in the variance report. */
export interface VarianceLine {
    line_id: string;
    product_name: string;
    product_sku: string;
    identifier?: string | null;
    batch_identifier?: string | null;
    expected_qty: string | number;
    counted_qty: string | number | null;
    variance: string | number;
}

/** An uncounted-line entry in the variance report. */
export interface UncountedLine {
    line_id: string;
}

/** Response payload of the count-session variance endpoint. */
export interface VarianceReport {
    variances: VarianceLine[];
    uncounted: UncountedLine[];
    movements_after_snapshot?: boolean;
}

/** Response body of the count-session apply action. */
export interface ApplyResponse {
    adjustments?: number;
}

/** Response body of the count-session create action. */
export interface CreateSessionResponse {
    id: string;
}

/** Location option-source row for the create screen. */
export interface StocktakeLocationRow {
    id: string;
    name: string;
    type: string;
}
