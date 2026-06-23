import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { MovementCreateViewModel } from "./useMovementCreate";

/** Visual indicator showing the external ↔ location flow for a directional move. */
export const DirectionIndicator = ({ vm }: { vm: MovementCreateViewModel }) => {
    const { t, isInbound, locationId, realLocations } = vm;

    return (
        <div className="flex items-center justify-center gap-3 py-2 text-sm">
            {isInbound ? (
                <>
                    <span className="text-zinc-500">{t("movements.external")}</span>
                    <ArrowUpRight size={18} className="text-emerald-400" />
                    <span className="text-emerald-400 font-medium">
                        {realLocations.find((l) => l.id === locationId)?.name || t("movements.locationFallback")}
                    </span>
                </>
            ) : (
                <>
                    <span className="text-rose-400 font-medium">
                        {realLocations.find((l) => l.id === locationId)?.name || t("movements.locationFallback")}
                    </span>
                    <ArrowDownLeft size={18} className="text-rose-400" />
                    <span className="text-zinc-500">{t("movements.external")}</span>
                </>
            )}
        </div>
    );
};
