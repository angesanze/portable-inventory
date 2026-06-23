/**
 * Local view-model types for the Movement list + hub screens.
 *
 * Refine's `useList` returns loosely-typed records; these describe just the
 * subset the movement tables read. Kept scoped to this feature folder,
 * alongside the create-form types in `movementTypes.ts`.
 */

import type { MovementExportRow } from "./exportColumns";

/** A location reference embedded on a movement, including its routing `type`. */
export interface MovementLocationRef {
    name?: string | null;
    type?: string | null;
}

/**
 * A movement row as rendered by the list / hub tables. Extends the export-row
 * shape (so rows pass straight to `exportToExcel` / `fetchAllPages`) and adds
 * the extra fields the tables render.
 */
export interface MovementListRow extends MovementExportRow {
    id: string;
    occurred_at: string;
    from_location?: MovementLocationRef | null;
    to_location?: MovementLocationRef | null;
    product_model?: { name?: string | null; sku?: string | null } | null;
    performed_by?: { username?: string | null } | null;
    performed_by_name?: string | null;
}

/** A `product-models` existence probe row (only `length` of the list matters). */
export interface ProductModelProbeRow {
    id: string;
}
