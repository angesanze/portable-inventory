import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
} from "recharts";
import { KeyRound, MoonStar, Layers } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/dashboard/StatCard";
import { usePlatformApiUsage } from "./hooks";

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-800 border border-white/[0.08] rounded-lg shadow-xl px-3 py-2 text-xs">
            {label != null && <p className="text-zinc-300 mb-1 font-medium">{label}</p>}
            {payload.map((entry: any) => (
                <p key={entry.dataKey ?? entry.name} style={{ color: entry.color ?? entry.payload?.fill }}>
                    {entry.name}: {entry.value}
                </p>
            ))}
        </div>
    );
};

// Stable colour per rate-limit tier so the pie legend stays readable.
const TIER_COLORS: Record<string, string> = {
    free: "#71717a",
    standard: "#6366f1",
    premium: "#10b981",
};
const TIER_FALLBACK = "#a78bfa";

/**
 * API-usage analytics view for the superadmin console (`/console/api-usage`).
 * Wraps `GET /platform/stats/api-usage/` (SUPERADMIN-03) via
 * {@link usePlatformApiUsage}: a bar chart of the top API consumers (companies
 * by summed key usage), a pie of the rate-tier key distribution, and a dormant-
 * keys stat card. Charts show skeletons while loading and the whole page fails
 * closed to an error card if the fetch rejects. Mounted only behind
 * `RequireSuperuser`.
 */
export const ApiUsage = () => {
    const { t } = useTranslation("nav");
    const { usage, isLoading, isError } = usePlatformApiUsage();

    // Top consumers, truncated label-side so the y-axis stays tidy.
    const consumerData = useMemo(
        () =>
            (usage?.top_consumers ?? []).map((row) => ({
                name:
                    row.company_name.length > 22
                        ? `${row.company_name.slice(0, 21)}…`
                        : row.company_name,
                usage: row.usage_count,
            })),
        [usage],
    );

    // Rate-tier distribution → pie slices; drop empty tiers so the chart isn't
    // cluttered with zero-value wedges.
    const tierData = useMemo(
        () =>
            Object.entries(usage?.rate_tier_distribution ?? {})
                .map(([tier, count]) => ({ name: tier, value: count }))
                .filter((slice) => slice.value > 0),
        [usage],
    );

    const totalKeys = useMemo(
        () => tierData.reduce((sum, slice) => sum + slice.value, 0),
        [tierData],
    );

    return (
        <div>
            <PageHeader title={t("consoleApiUsage")} subtitle={t("consoleTitle")} />

            {isError ? (
                <Card>
                    <p className="text-sm text-red-400">{t("consoleApiUsageError")}</p>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        <StatCard
                            title={t("consoleApiKeysTotal")}
                            value={totalKeys}
                            icon={<KeyRound className="w-5 h-5" />}
                            iconColor="bg-teal-500/15 text-teal-400"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title={t("consoleDormantKeys")}
                            value={usage?.dormant_keys ?? 0}
                            icon={<MoonStar className="w-5 h-5" />}
                            iconColor="bg-amber-500/15 text-amber-400"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title={t("consoleTopConsumersStat")}
                            value={usage?.top_consumers.length ?? 0}
                            icon={<Layers className="w-5 h-5" />}
                            iconColor="bg-indigo-500/15 text-indigo-400"
                            isLoading={isLoading}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Top consumers (wider column) */}
                        <Card padding="none" className="lg:col-span-2 flex flex-col">
                            <div className="px-5 py-4 border-b border-white/[0.06]">
                                <h3 className="text-sm font-semibold text-zinc-200">
                                    {t("consoleTopConsumersTitle")}
                                </h3>
                            </div>
                            <div className="p-5 flex-1 min-h-0" style={{ height: 360 }}>
                                {isLoading ? (
                                    <Skeleton className="h-full w-full" />
                                ) : consumerData.length === 0 ? (
                                    <div className="h-full flex items-center justify-center">
                                        <p className="text-sm text-zinc-500">
                                            {t("consoleApiUsageEmpty")}
                                        </p>
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={consumerData}
                                            layout="vertical"
                                            margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="rgba(255,255,255,0.04)"
                                                horizontal={false}
                                            />
                                            <XAxis
                                                type="number"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: "#71717a", fontSize: 12 }}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: "#a1a1aa", fontSize: 12 }}
                                                width={140}
                                            />
                                            <Tooltip
                                                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                                                content={<CustomTooltip />}
                                            />
                                            <Bar
                                                dataKey="usage"
                                                name={t("consoleColUsage")}
                                                fill="#6366f1"
                                                radius={[0, 4, 4, 0]}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </Card>

                        {/* Rate-tier distribution */}
                        <Card padding="none" className="flex flex-col">
                            <div className="px-5 py-4 border-b border-white/[0.06]">
                                <h3 className="text-sm font-semibold text-zinc-200">
                                    {t("consoleRateTierTitle")}
                                </h3>
                            </div>
                            <div className="p-5 flex-1 min-h-0" style={{ height: 360 }}>
                                {isLoading ? (
                                    <Skeleton className="h-full w-full" />
                                ) : tierData.length === 0 ? (
                                    <div className="h-full flex items-center justify-center">
                                        <p className="text-sm text-zinc-500">
                                            {t("consoleApiUsageEmpty")}
                                        </p>
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={tierData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={55}
                                                outerRadius={90}
                                                paddingAngle={2}
                                                stroke="none"
                                            >
                                                {tierData.map((slice) => (
                                                    <Cell
                                                        key={slice.name}
                                                        fill={TIER_COLORS[slice.name] ?? TIER_FALLBACK}
                                                    />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                                {!isLoading && tierData.length > 0 && (
                                    <ul className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
                                        {tierData.map((slice) => (
                                            <li
                                                key={slice.name}
                                                className="flex items-center gap-1.5 text-xs text-zinc-400 capitalize"
                                            >
                                                <span
                                                    className="w-2.5 h-2.5 rounded-sm"
                                                    style={{
                                                        backgroundColor:
                                                            TIER_COLORS[slice.name] ?? TIER_FALLBACK,
                                                    }}
                                                />
                                                {slice.name} ({slice.value})
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
};

export default ApiUsage;
