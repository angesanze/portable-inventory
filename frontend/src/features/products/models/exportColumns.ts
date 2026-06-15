import type { ExportColumn } from "../../../utils/exportToExcel";

export interface ProductExportRow {
    sku: string;
    name: string;
    profile: string;
    engine_type: string;
    updated_at?: string | null;
}

export const PRODUCT_EXPORT_COLUMNS: ExportColumn<ProductExportRow>[] = [
    { key: "sku", header: "SKU" },
    { key: "name", header: "Name" },
    { key: "profile", header: "Profile" },
    { key: "engine_type", header: "Engine type" },
    {
        key: (r) => (r.updated_at ? new Date(r.updated_at).toISOString() : null),
        header: "Updated at",
    },
];

export const PRODUCT_EXPORT_FILENAME = "products";
