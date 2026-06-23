import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";

/** RMA-08: stock physically held in quarantine (non-sellable) locations. */
export function QuarantineSection({
    total,
    breakdown,
}: {
    total: number;
    breakdown: Record<string, number>;
}) {
    const { t } = useTranslation(["returns", "products"]);
    return (
        <div className="mt-4" data-testid="quarantine-section">
            <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">
                {t("returns:inQuarantine")}{" "}
                <span className="font-mono">({Number(total).toLocaleString()})</span>
            </h4>
            <div className="space-y-2">
                {Object.entries(breakdown).map(([location, qty]) => (
                    <div
                        key={location}
                        className="flex items-center justify-between p-3 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg"
                    >
                        <div className="flex items-center gap-2 text-sm text-zinc-300">
                            <MapPin size={14} className="text-amber-400/70" />
                            {location}
                        </div>
                        <span className="font-mono font-bold text-amber-200">
                            {Number(qty).toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
