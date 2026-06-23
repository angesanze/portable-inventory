import { useTranslation } from "react-i18next";
import { Plus, ArrowRightLeft } from "lucide-react";
import { PROFILE_METADATA } from "../../../../types/api";
import type { InventoryProfile } from "../../../../types/api";
import { Button } from "../../../../components/ui/Button";

/**
 * Profile-aware primary action for the Current Inventory card:
 * "Register New Item" for INDIVIDUAL tracking, otherwise a movement action.
 */
export function InventoryActionButton({
    profile,
    productId,
    navigate,
}: {
    profile: string;
    productId: string;
    navigate: (path: string) => void;
}) {
    const { t } = useTranslation("products");
    const meta = PROFILE_METADATA[profile as InventoryProfile];
    if (!meta) return null;

    if (meta.trackingMode === "INDIVIDUAL") {
        return (
            <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => navigate(`/stock/create?product=${productId}`)}
            >
                {t("registerNewItem")}
            </Button>
        );
    }

    return (
        <Button
            variant="secondary"
            size="sm"
            icon={ArrowRightLeft}
            onClick={() => navigate(`/movements/create?product=${productId}`)}
        >
            {meta.trackingMode === "BATCH"
                ? t("recordBatchMovement")
                : t("recordMovement")}
        </Button>
    );
}
