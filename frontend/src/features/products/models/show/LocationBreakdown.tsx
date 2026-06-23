import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";

/** Per-location quantity breakdown for BULK stock. */
export function LocationBreakdown({
    breakdown,
}: {
    breakdown: Record<string, number>;
}) {
    const { t } = useTranslation("products");
    return (
        <div className="mt-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {t("byLocation")}
            </h4>
            <div className="space-y-2">
                {Object.entries(breakdown).map(([location, qty]) => (
                    <div
                        key={location}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                    >
                        <div className="flex items-center gap-2 text-sm text-zinc-300">
                            <MapPin size={14} className="text-zinc-500" />
                            {location}
                        </div>
                        <span className="font-mono font-bold text-zinc-50">
                            {Number(qty).toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
