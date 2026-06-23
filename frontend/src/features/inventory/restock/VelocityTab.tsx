import { Skeleton } from "../../../components/ui/Skeleton";
import {
    fmtDays,
    fmtQty,
    fmtRate,
    type SeriesResponse,
    type Translate,
} from "./drawerTypes";

interface VelocityTabProps {
    isLoading: boolean;
    payload: SeriesResponse | undefined;
    t: Translate;
}

export const VelocityTab = ({ isLoading, payload, t }: VelocityTabProps) => {
    if (isLoading || !payload) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
                <Skeleton className="h-40 w-full" />
            </div>
        );
    }
    const v = payload.velocity;
    const p = payload.projection;
    const tiles: { label: string; value: number }[] = [
        { label: "7d", value: v["7d"] },
        { label: "30d", value: v["30d"] },
        { label: "90d", value: v["90d"] },
    ];
    const rows: { label: string; value: string }[] = [
        { label: t("drawer.daysToReorder"), value: fmtDays(p.days_to_reorder) },
        { label: t("drawer.daysToCritical"), value: fmtDays(p.days_to_critical) },
        { label: t("drawer.daysToOut"), value: fmtDays(p.days_to_out) },
        {
            label: t("drawer.suggestedReorder"),
            value: fmtQty(p.suggested_reorder_qty),
        },
    ];
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2" data-testid="velocity-tiles">
                {tiles.map((tile) => (
                    <div
                        key={tile.label}
                        className="bg-zinc-900/80 border border-white/[0.06] rounded-lg p-3"
                    >
                        <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                            {tile.label}
                        </div>
                        <div className="text-xl font-semibold text-zinc-100 mt-1">
                            {fmtRate(tile.value)}
                        </div>
                    </div>
                ))}
            </div>

            <div
                className="bg-zinc-900/80 border border-white/[0.06] rounded-lg divide-y divide-white/[0.04]"
                data-testid="projection-panel"
            >
                {rows.map((row) => (
                    <div
                        key={row.label}
                        className="flex items-center justify-between px-4 py-3"
                    >
                        <span className="text-sm text-zinc-400">{row.label}</span>
                        <span className="text-sm font-mono text-zinc-100">
                            {row.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
