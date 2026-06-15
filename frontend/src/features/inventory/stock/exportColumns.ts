import type { ExportColumn } from "../../../utils/exportToExcel";

export interface StockExportRow {
    identifier: string;
    product_model_name?: string | null;
    status: string;
    location_name?: string | null;
    updated_at?: string | null;
}

export const STOCK_EXPORT_COLUMNS: ExportColumn<StockExportRow>[] = [
    { key: "identifier", header: "Identifier" },
    { key: (r) => r.product_model_name ?? null, header: "Product model" },
    { key: "status", header: "Status" },
    { key: (r) => r.location_name ?? null, header: "Location" },
    {
        key: (r) => (r.updated_at ? new Date(r.updated_at).toISOString() : null),
        header: "Updated at",
    },
];

export const STOCK_EXPORT_FILENAME = "stock";
