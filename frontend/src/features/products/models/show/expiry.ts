import type { ExpiryInfo } from "./types";

/**
 * Bucket a batch expiry date into a presentation descriptor
 * (colour + label + "days remaining" text). Returns `null` when no
 * expiry is set. Pure — moved verbatim from `show.tsx`.
 */
export function getExpiryInfo(expiry: string | undefined): ExpiryInfo | null {
    if (!expiry) return null;
    const now = new Date();
    const exp = new Date(expiry);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / msPerDay);

    if (exp <= now) {
        return {
            bucket: "expired",
            variant: "slate",
            textClass: "text-zinc-500",
            labelKey: "expired",
            daysText: (t) => t("expired"),
        };
    }
    if (diffDays <= 7) {
        return {
            bucket: "critical",
            variant: "rose",
            textClass: "text-rose-400 font-semibold",
            labelKey: "expiringSoon",
            daysText: (t) => t("daysRemainingValue", { count: diffDays }),
        };
    }
    if (diffDays <= 30) {
        return {
            bucket: "warning",
            variant: "amber",
            textClass: "text-amber-400",
            labelKey: null,
            daysText: (t) => t("daysRemainingValue", { count: diffDays }),
        };
    }
    return {
        bucket: "ok",
        variant: "emerald",
        textClass: "text-emerald-400",
        labelKey: null,
        daysText: (t) => t("daysRemainingValue", { count: diffDays }),
    };
}
