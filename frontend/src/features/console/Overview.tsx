import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
} from "recharts";
import {
    Building2,
    Briefcase,
    Code2,
    PauseCircle,
    Users,
    KeyRound,
    AlertTriangle,
} from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/dashboard/StatCard";
import { usePlatformStats } from "./hooks";

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-800 border border-white/[0.08] rounded-lg shadow-xl px-3 py-2 text-xs">
            <p className="text-zinc-300 mb-1 font-medium">{label}</p>
            {payload.map((entry: any) => (
                <p key={entry.dataKey} style={{ color: entry.color }}>
                    {entry.name}: {entry.value}
                </p>
            ))}
        </div>
    );
};

/**
 * Platform overview dashboard for the superadmin console. Renders the headline
 * KPI cards (company tier breakdown, users, API keys, open alerts) plus a
 * growth area chart of new companies + movement volume per day. Data comes from
 * {@link usePlatformStats} (`/platform/stats/` + `/platform/stats/growth/`);
 * cards show skeletons while loading and the whole page fails closed to an
 * error card if either fetch rejects. Mounted only behind `RequireSuperuser`.
 */
export const Overview = () => {
    const { t } = useTranslation("nav");
    const { stats, growth, isLoading, isError } = usePlatformStats();

    // Localised x-axis labels; the API already returns a dense, gap-filled
    // series so we only reshape the date for display.
    const chartData = useMemo(
        () =>
            growth.map((point) => {
                const d = new Date(point.date);
                return {
                    name: d.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                    }),
                    companies: point.companies,
                    movements: point.movements,
                };
            }),
        [growth],
    );

    return (
        <div>
            <PageHeader title={t("consoleOverview")} subtitle={t("consoleTitle")} />

            {isError ? (
                <Card>
                    <p className="text-sm text-red-400">{t("consoleLoadError")}</p>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <StatCard
                            title={t("consoleKpiCompanies")}
                            value={stats?.companies.total ?? 0}
                            icon={<Building2 className="w-5 h-5" />}
                            iconColor="bg-indigo-500/15 text-indigo-400"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title={t("consoleKpiManagers")}
                            value={stats?.companies.by_tier.manager ?? 0}
                            icon={<Briefcase className="w-5 h-5" />}
                            iconColor="bg-sky-500/15 text-sky-400"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title={t("consoleKpiDevelopers")}
                            value={stats?.companies.by_tier.developer ?? 0}
                            icon={<Code2 className="w-5 h-5" />}
                            iconColor="bg-violet-500/15 text-violet-400"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title={t("consoleKpiSuspended")}
                            value={stats?.companies.suspended ?? 0}
                            icon={<PauseCircle className="w-5 h-5" />}
                            iconColor="bg-amber-500/15 text-amber-400"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title={t("consoleKpiUsers")}
                            value={stats?.users_total ?? 0}
                            icon={<Users className="w-5 h-5" />}
                            iconColor="bg-emerald-500/15 text-emerald-400"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title={t("consoleKpiApiKeys")}
                            value={stats?.api_keys_total ?? 0}
                            icon={<KeyRound className="w-5 h-5" />}
                            iconColor="bg-teal-500/15 text-teal-400"
                            isLoading={isLoading}
                        />
                        <StatCard
                            title={t("consoleKpiOpenAlerts")}
                            value={stats?.open_events_total ?? 0}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            iconColor="bg-red-500/15 text-red-400"
                            isLoading={isLoading}
                        />
                    </div>

                    <Card padding="none" className="flex flex-col">
                        <div className="px-5 py-4 border-b border-white/[0.06]">
                            <h3 className="text-sm font-semibold text-zinc-200">
                                {t("consoleGrowthTitle")}
                            </h3>
                        </div>
                        <div className="p-5 flex-1 min-h-0" style={{ height: 320 }}>
                            {isLoading ? (
                                <Skeleton className="h-full w-full" />
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={chartData}
                                        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                                    >
                                        <defs>
                                            <linearGradient id="consoleCompanies" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="consoleMovements" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
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
                                            minTickGap={24}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: "#71717a", fontSize: 12 }}
                                            width={32}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey="companies"
                                            name={t("consoleGrowthCompanies")}
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            fill="url(#consoleCompanies)"
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="movements"
                                            name={t("consoleGrowthMovements")}
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            fill="url(#consoleMovements)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
};

export default Overview;
