import type { ExportColumn } from "../../utils/exportToExcel";

export interface PurchaseOrderExportRow {
    number: string;
    supplier_name?: string | null;
    status: string;
    expected_at?: string | null;
    created_at?: string | null;
    lines?: Array<{ quantity_ordered: string; quantity_received: string }>;
    notes?: string;
}

export const PURCHASE_ORDER_EXPORT_COLUMNS: ExportColumn<PurchaseOrderExportRow>[] = [
    { key: "number", header: "Number" },
    { key: (r) => r.supplier_name ?? null, header: "Supplier" },
    { key: "status", header: "Status" },
    { key: (r) => r.lines?.length ?? 0, header: "Lines" },
    {
        key: (r) =>
            (r.lines ?? []).reduce((sum, l) => sum + Number(l.quantity_ordered || 0), 0),
        header: "Qty ordered",
    },
    {
        key: (r) =>
            (r.lines ?? []).reduce((sum, l) => sum + Number(l.quantity_received || 0), 0),
        header: "Qty received",
    },
    { key: (r) => r.expected_at ?? null, header: "Expected at" },
    {
        key: (r) => (r.created_at ? new Date(r.created_at).toISOString() : null),
        header: "Created at",
    },
];

export const PURCHASE_ORDER_EXPORT_FILENAME = "purchase-orders";
