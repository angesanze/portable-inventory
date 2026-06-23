import type { TFunction } from "i18next";
import type { BadgeVariant } from "../../../components/ui/Badge";

export function statusExplanation(
    status: string,
    t: TFunction,
): string | undefined {
    switch (status) {
        case "OPEN":
            return t("workOrders.statusOpen");
        case "CLOSED":
            return t("workOrders.statusClosed");
        case "ARCHIVED":
            return t("workOrders.statusArchived");
        default:
            return undefined;
    }
}

export function statusVariant(status: string): BadgeVariant {
    switch (status) {
        case "OPEN":
            return "emerald";
        case "CLOSED":
            return "neutral";
        case "ARCHIVED":
            return "slate";
        default:
            return "neutral";
    }
}
