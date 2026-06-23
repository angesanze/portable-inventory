import type { TFunction } from "i18next";
import type { ProductStockRow } from "./types";

// ── Pure formatting / option helpers for the stock list ────────────────

export function statusOptions(t: TFunction) {
    return [
        { label: t("stock.statusActive"), value: "ACTIVE" },
        { label: t("stock.statusInUse"), value: "IN_USE" },
        { label: t("stock.statusReturned"), value: "RETURNED" },
        { label: t("stock.statusDisposed"), value: "DISPOSED" },
    ];
}

export function formatRelativeTime(dateString: string, t: TFunction): string {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t("common:justNow");
    if (diffMins < 60) return t("common:minutesAgo", { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t("common:hoursAgo", { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return t("common:daysAgo", { count: diffDays });
    return date.toLocaleDateString();
}

export function stockStatusIndicator(
    total: number,
    t: TFunction,
): { color: string; label: string } {
    if (total <= 0) return { color: "text-rose-400", label: t("stock.outOfStock") };
    return { color: "text-emerald-400", label: t("stock.inStock") };
}

export function formatStockDisplay(row: ProductStockRow, t: TFunction): string {
    const total = row.stock_total;
    let text: string;
    if (row.tracking_mode === "INDIVIDUAL") {
        text = t("stock.itemCount", { count: total });
    } else if (row.tracking_mode === "BATCH") {
        const batchCount = Array.isArray(row.stock_value) ? row.stock_value.length : 0;
        if (batchCount > 0) {
            text = t("stock.inBatches", { total: Number(total).toLocaleString(), count: batchCount });
        } else {
            text = Number(total).toLocaleString();
        }
    } else {
        text = Number(total).toLocaleString();
    }
    return row.unit ? `${text} ${row.unit}` : text;
}

export function getPrimaryLocation(row: ProductStockRow): string {
    const breakdown = row.stock_breakdown;
    if (!breakdown || Object.keys(breakdown).length === 0) return "—";
    const sorted = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
    return sorted[0][0];
}
