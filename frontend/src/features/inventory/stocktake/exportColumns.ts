import type { ExportColumn } from "../../../utils/exportToExcel";

export interface VarianceExportRow {
    product_sku: string;
    product_name: string;
    batch_identifier?: string | null;
    identifier?: string | null;
    expected_qty: string | number;
    counted_qty: string | number | null;
    variance: string | number;
}

export const VARIANCE_EXPORT_COLUMNS: ExportColumn<VarianceExportRow>[] = [
    { key: "product_sku", header: "SKU" },
    { key: "product_name", header: "Product" },
    { key: (r) => r.batch_identifier ?? r.identifier ?? null, header: "Batch / Serial" },
    { key: (r) => Number(r.expected_qty), header: "Expected" },
    { key: (r) => (r.counted_qty === null ? null : Number(r.counted_qty)), header: "Counted" },
    { key: (r) => Number(r.variance), header: "Variance" },
];

export const VARIANCE_EXPORT_FILENAME = "stocktake-variances";
