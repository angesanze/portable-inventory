import type { ExportColumn } from "../../../utils/exportToExcel";

export interface MovementExportRow {
    occurred_at: string;
    product_name?: string | null;
    product_model?: { name?: string | null } | null;
    sku?: string | null;
    from_location?: { name?: string | null } | null;
    supplier_name?: string | null;
    to_location?: { name?: string | null } | null;
    quantity?: number | string | null;
    delta?: number | string | null;
    reason?: string | null;
}

function productLabel(r: MovementExportRow): string | null {
    return r.product_name ?? r.product_model?.name ?? r.sku ?? null;
}

function fromLabel(r: MovementExportRow): string | null {
    return r.supplier_name ?? r.from_location?.name ?? null;
}

function toLabel(r: MovementExportRow): string | null {
    return r.to_location?.name ?? null;
}

function quantityValue(r: MovementExportRow): number | string | null {
    const v = r.quantity ?? r.delta ?? null;
    if (v === null || v === undefined) return null;
    return typeof v === "string" ? Number(v) : v;
}

export const MOVEMENT_EXPORT_COLUMNS: ExportColumn<MovementExportRow>[] = [
    {
        key: (r) => (r.occurred_at ? new Date(r.occurred_at).toISOString() : null),
        header: "Occurred at",
    },
    { key: productLabel, header: "Product" },
    { key: fromLabel, header: "From" },
    { key: toLabel, header: "To" },
    { key: quantityValue, header: "Quantity" },
    { key: (r) => r.reason ?? null, header: "Reason" },
];

export const MOVEMENT_EXPORT_FILENAME = "movements";
