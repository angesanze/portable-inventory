/**
 * Feature-local option-source row shapes for the Reservations create modal.
 *
 * (The list-row shape `ReservationRow` lives alongside the list component.)
 */

/** Product option-source row for the reservation product select. */
export interface ReservationProductRow {
    id: string;
    name: string;
    sku: string;
}

/** Location option-source row for the reservation location select. */
export interface ReservationLocationRow {
    id: string;
    name: string;
    type: string;
}
