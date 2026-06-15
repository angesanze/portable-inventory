import type { ExportColumn } from "../../utils/exportToExcel";

export interface SalesOrderExportRow {
    number: string;
    customer_name?: string | null;
    status: string;
    promised_at?: string | null;
    created_at?: string | null;
    lines?: Array<{ quantity_ordered: string; quantity_shipped: string }>;
    notes?: string;
}

export const SALES_ORDER_EXPORT_COLUMNS: ExportColumn<SalesOrderExportRow>[] = [
    { key: "number", header: "Number" },
    { key: (r) => r.customer_name ?? null, header: "Customer" },
    { key: "status", header: "Status" },
    { key: (r) => r.lines?.length ?? 0, header: "Lines" },
    {
        key: (r) =>
            (r.lines ?? []).reduce((sum, l) => sum + Number(l.quantity_ordered || 0), 0),
        header: "Qty ordered",
    },
    {
        key: (r) =>
            (r.lines ?? []).reduce((sum, l) => sum + Number(l.quantity_shipped || 0), 0),
        header: "Qty shipped",
    },
    { key: (r) => r.promised_at ?? null, header: "Promised at" },
    {
        key: (r) => (r.created_at ? new Date(r.created_at).toISOString() : null),
        header: "Created at",
    },
];

export const SALES_ORDER_EXPORT_FILENAME = "sales-orders";
