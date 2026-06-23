import { type BadgeVariant } from "../../../components/ui/Badge";
import type { Bucket } from "./types";

/**
 * Local, feature-scoped types and presentation helpers for the product
 * restock drawer. Defined here (rather than in the global ``src/types/api.ts``)
 * because they describe the drawer's own view models and the stock-series
 * endpoint response that only this feature consumes.
 */

export const bucketVariant: Record<Bucket, BadgeVariant> = {
    HEALTHY: "emerald",
    REORDER: "amber",
    CRITICAL: "red",
    OUT: "slate",
    OVERSTOCK: "cyan",
};

export type Tab = "history" | "velocity" | "thresholds";
export type Period = 30 | 90;

export interface SeriesPoint {
    date: string;
    on_hand: number;
    inbound: number;
    outbound: number;
}

export interface SeriesResponse {
    product_id: string;
    days: number;
    series: SeriesPoint[];
    velocity: { "7d": number; "30d": number; "90d": number };
    projection: {
        current_qty: number;
        daily_burn: number;
        days_to_reorder: number | null;
        days_to_critical: number | null;
        days_to_out: number | null;
        suggested_reorder_qty: number | null;
    };
}

/** Chart datum derived from a {@link SeriesPoint} (outbound is negated). */
export interface ChartPoint {
    date: string;
    on_hand: number;
    inbound: number;
    outbound: number;
}

/** Product-model record returned by the ``product-models`` resource. */
export interface ProductModelRecord {
    id: string;
    reorder_threshold: number | string | null;
    critical_threshold: number | string | null;
    max_threshold: number | string | null;
    reorder_qty: number | string | null;
}

/** Minimal i18n translate signature used by the drawer subcomponents. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export const fmtDays = (v: number | null) =>
    v == null ? "∞" : v < 1 ? "<1" : v.toFixed(1);
export const fmtQty = (v: number | null) => (v == null ? "—" : v.toFixed(0));
export const fmtRate = (v: number) => `${v.toFixed(2)}/d`;
