/**
 * Feature-local API row shape for the Customers list.
 *
 * Partial mirror of the DRF `customers` list payload — only fields read by the
 * list screen are typed. The export-row shape lives in `exportColumns.ts`.
 */
export interface CustomerRow {
    id: string;
    name: string;
    vat_number?: string | null;
    email?: string | null;
    phone?: string | null;
    is_active?: boolean;
}
