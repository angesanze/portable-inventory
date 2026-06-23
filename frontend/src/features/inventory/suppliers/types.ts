/**
 * Feature-local API row shape for the Suppliers list.
 *
 * Partial mirror of the DRF `suppliers` list payload — only fields read by the
 * list screen are typed. The export-row shape lives in `exportColumns.ts`.
 */
export interface SupplierRow {
    id: string;
    name: string;
    vat_number?: string | null;
    email?: string | null;
    phone?: string | null;
    is_active?: boolean;
}
