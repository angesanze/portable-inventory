import type { ExportColumn } from "../../../utils/exportToExcel";

export interface SupplierExportRow {
    name: string;
    vat_number?: string | null;
    is_active?: boolean;
    created_at?: string | null;
}

export const SUPPLIER_EXPORT_COLUMNS: ExportColumn<SupplierExportRow>[] = [
    { key: "name", header: "Name" },
    { key: (r) => r.vat_number ?? null, header: "VAT" },
    { key: (r) => Boolean(r.is_active), header: "Active" },
    {
        key: (r) => (r.created_at ? new Date(r.created_at).toISOString() : null),
        header: "Created at",
    },
];

export const SUPPLIER_EXPORT_FILENAME = "suppliers";
