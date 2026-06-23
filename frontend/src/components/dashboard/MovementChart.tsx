import { useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
} from "recharts";
import { Card } from "../ui/Card";

type Period = "7d" | "30d" | "90d";

const PERIOD_DAYS: Record<Period, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
};

/** Minimal shape of a recharts tooltip series entry that this component reads. */
interface TooltipPayloadEntry {
    name?: string | number;
    value?: string | number;
    color?: string;
    dataKey?: string | number;
}

/** Props recharts injects into a custom `content` element (cloned with extras). */
interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
    label?: string | number;
}

/** Movement row fields consumed by the chart bucketing logic. */
interface MovementRow {
    id?: string;
    occurred_at?: string;
    quantity?: number | string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-800 border border-white/[0.08] rounded-lg shadow-xl px-3 py-2 text-xs">
            <p className="text-zinc-300 mb-1 font-medium">{label}</p>
            {payload.map((entry) => (
                <p key={entry.dataKey} style={{ color: entry.color }}>
                    {entry.name}: {entry.value}
                </p>
            ))}
        </div>
    );
};

export const MovementChart = () => {
    const { t } = useTranslation("dashboard");
    const [period, setPeriod] = useState<Period>("7d");
    const days = PERIOD_DAYS[period];

    const { data: movementsData } = useList<MovementRow>({
        resource: "movements",
        pagination: { pageSize: 1000 },
        sorters: [{ field: "occurred_at", order: "desc" }],
    });

    const chartData = useMemo(() => {
        const buckets: {
            dateString: string;
            name: string;
            inbound: number;
            outbound: number;
        }[] = [];

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const fmt =
                days <= 7
                    ? d.toLocaleDateString("en-US", { weekday: "short" })
                    : d.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                      });
            buckets.push({
                dateString: d.toISOString().split("T")[0],
                name: fmt,
                inbound: 0,
                outbound: 0,
            });
        }

        if (movementsData?.data) {
            for (const m of movementsData.data) {
                if (!m.occurred_at) continue;
                const mDate = m.occurred_at.split("T")[0];
                const bucket = buckets.find((b) => b.dateString === mDate);
                if (bucket) {
                    const qty = Number(m.quantity);
                    if (qty > 0) bucket.inbound += qty;
                    else bucket.outbound += Math.abs(qty);
                }
            }
        }

        return buckets;
    }, [movementsData, days]);

    const periods: Period[] = ["7d", "30d", "90d"];

    return (
        <Card padding="none" className="flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-zinc-200">
                    {t("movementChart")}
                </h3>
                <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg p-0.5">
                    {periods.map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                period === p
                                    ? "bg-zinc-700 text-zinc-100"
                                    : "text-zinc-500 hover:text-zinc-300"
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>
            <div className="p-5 flex-1 min-h-0" style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.04)"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "#71717a", fontSize: 12 }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "#71717a", fontSize: 12 }}
                            width={32}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Line
                            type="monotone"
                            dataKey="inbound"
                            name={t("inbound")}
                            stroke="#6366f1"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="outbound"
                            name={t("outbound")}
                            stroke="#71717a"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};
