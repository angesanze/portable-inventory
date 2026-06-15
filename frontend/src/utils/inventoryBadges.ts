/**
 * Shared badge mappings for inventory domain enums.
 *
 * These maps were previously reimplemented (and had drifted) across
 * products/models/show, inventory/stock/list, and others — e.g. RETURNED
 * rendered slate in one view and amber in another, ASSEMBLED used an invalid
 * "violet" variant. Centralised here so every surface agrees.
 */
import type { TFunction } from "i18next";
import type { BadgeVariant } from "../components/ui/Badge";
import type { InventoryProfile } from "../types/api";

/** Physical-item status → Badge colour. NOT for work-order lifecycle. */
const ITEM_STATUS_VARIANT: Record<string, BadgeVariant> = {
    ACTIVE: "emerald",
    IN_USE: "cyan",
    RETURNED: "slate",
    RECALL: "amber",
    EXPIRED: "rose",
    DISPOSED: "slate",
    REPAIRED: "emerald",
    BROKEN: "rose",
    AO: "amber",
};

export function itemStatusVariant(status: string): BadgeVariant {
    return ITEM_STATUS_VARIANT[status] ?? "neutral";
}

/**
 * Localised label for a physical-item status. Falls back to the raw status
 * (then a generic "unknown") so unmapped/custom tracker states still render.
 */
export function itemStatusLabel(status: string, t: TFunction): string {
    const key: Record<string, string> = {
        ACTIVE: "stock.statusActive",
        IN_USE: "stock.statusInUse",
        RETURNED: "stock.statusReturned",
        DISPOSED: "stock.statusDisposed",
    };
    if (key[status]) return t(key[status]);
    return status || t("stock.statusUnknown");
}

/** Inventory profile → Badge colour. */
export function profileVariant(profile: InventoryProfile | string | null | undefined): BadgeVariant {
    switch (profile) {
        case "SERIALIZED": return "amber";
        case "BATCH_TRACKED":
        case "PERISHABLE": return "cyan";
        case "DIMENSIONAL": return "indigo";
        case "ASSEMBLED": return "primary";
        case "UNIT_CONVERSION": return "emerald";
        case "SIMPLE_COUNT":
        default: return "neutral";
    }
}
