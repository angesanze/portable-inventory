import type { ExportColumn } from "../../../utils/exportToExcel";

export interface WorkOrderExportRow {
    name: string;
    status: string;
    product_model_name?: string | null;
    product_model?: { name?: string | null } | null;
    created_at?: string | null;
}

export const WORK_ORDER_EXPORT_COLUMNS: ExportColumn<WorkOrderExportRow>[] = [
    { key: "name", header: "Name" },
    { key: "status", header: "Status" },
    {
        key: (r) => r.product_model_name ?? r.product_model?.name ?? null,
        header: "Product model",
    },
    {
        key: (r) => (r.created_at ? new Date(r.created_at).toISOString() : null),
        header: "Created at",
    },
];

export const WORK_ORDER_EXPORT_FILENAME = "work-orders";
