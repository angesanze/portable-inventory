import {
    Area,
    Bar,
    CartesianGrid,
    ComposedChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../../../components/ui/Skeleton";
import type { ChartPoint, Period } from "./drawerTypes";

interface HistoryTabProps {
    isLoading: boolean;
    chartData: ChartPoint[];
    allZero: boolean;
    period: Period;
    setPeriod: (p: Period) => void;
    reorderT: number | null;
    criticalT: number | null;
}

export const HistoryTab = ({
    isLoading,
    chartData,
    allZero,
    period,
    setPeriod,
    reorderT,
    criticalT,
}: HistoryTabProps) => {
    const { t } = useTranslation(["restock", "common"]);
    return (
        <div className="space-y-4">
            <div
                className="inline-flex rounded-lg border border-white/[0.06] overflow-hidden"
                role="group"
                aria-label={t("drawer.period", { defaultValue: "Period" })}
            >
                {[30, 90].map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setPeriod(d as Period)}
                        className={`px-3 py-1 text-xs ${
                            period === d
                                ? "bg-indigo-500/20 text-indigo-300"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        data-testid={`period-${d}`}
                    >
                        {d}d
                    </button>
                ))}
            </div>

            {isLoading ? (
                <Skeleton className="h-[260px] w-full" />
            ) : allZero ? (
                <div className="h-[260px] flex items-center justify-center text-sm text-zinc-500 border border-dashed border-white/[0.06] rounded-lg">
                    {t("drawer.noMovement", {
                        defaultValue: "No movement in this period",
                    })}
                </div>
            ) : (
                <div className="h-[260px]" data-testid="history-chart">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={chartData}
                            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid
                                stroke="#27272a"
                                strokeDasharray="3 3"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="date"
                                tick={{ fill: "#71717a", fontSize: 10 }}
                                axisLine={{ stroke: "#27272a" }}
                                tickLine={false}
                                minTickGap={24}
                            />
                            <YAxis
                                tick={{ fill: "#71717a", fontSize: 10 }}
                                axisLine={{ stroke: "#27272a" }}
                                tickLine={false}
                                width={36}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "#18181b",
                                    border: "1px solid #27272a",
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
                                labelStyle={{ color: "#a1a1aa" }}
                            />
                            <Bar
                                dataKey="outbound"
                                fill="#71717a"
                                radius={[0, 0, 2, 2]}
                                isAnimationActive={false}
                            />
                            <Bar
                                dataKey="inbound"
                                fill="#10b981"
                                radius={[2, 2, 0, 0]}
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="on_hand"
                                stroke="#6366f1"
                                fill="#6366f1"
                                fillOpacity={0.15}
                                strokeWidth={2}
                                isAnimationActive={false}
                            />
                            {reorderT != null && (
                                <ReferenceLine
                                    y={reorderT}
                                    stroke="#f59e0b"
                                    strokeDasharray="4 4"
                                    data-testid="ref-reorder"
                                />
                            )}
                            {criticalT != null && (
                                <ReferenceLine
                                    y={criticalT}
                                    stroke="#ef4444"
                                    strokeDasharray="4 4"
                                    data-testid="ref-critical"
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};
