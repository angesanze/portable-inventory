import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
    AlertOctagon,
    AlertTriangle,
    Info,
    ChevronRight,
    CheckCircle2,
    ArrowRight,
} from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge, type BadgeVariant } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Skeleton";
import {
    usePlatformInsights,
    type AnomalySeverity,
    type PlatformAnomaly,
} from "./hooks";

// Severity → visual treatment. Ordered most → least urgent so the grouped
// render walks them top-down (critical first), mirroring the server's intent.
const SEVERITY_ORDER: AnomalySeverity[] = ["critical", "warning", "info"];

const SEVERITY_META: Record<
    AnomalySeverity,
    { icon: typeof AlertTriangle; iconClass: string; badge: BadgeVariant; labelKey: string }
> = {
    critical: { icon: AlertOctagon, iconClass: "text-rose-400", badge: "error", labelKey: "consoleSeverityCritical" },
    warning: { icon: AlertTriangle, iconClass: "text-amber-400", badge: "warning", labelKey: "consoleSeverityWarning" },
    info: { icon: Info, iconClass: "text-cyan-400", badge: "info", labelKey: "consoleSeverityInfo" },
};

/** A health score's badge colour: green when healthy, amber mid, rose poor. */
const healthVariant = (score: number): BadgeVariant =>
    score >= 80 ? "success" : score >= 50 ? "warning" : "error";

/**
 * Platform intelligence view for the superadmin console (`/console/insights`).
 * Wraps the SUPERADMIN-05 insights APIs via {@link usePlatformInsights}: the
 * anomaly feed (`/platform/insights/`) rendered grouped by severity — each card
 * showing the company, the detail, the suggested action and a deep-link to that
 * company's detail drawer — and the per-company health list
 * (`/platform/insights/health/`) surfaced worst-first as a "needs attention"
 * panel with a score badge. Mirrors the {@link AttentionItems} visual pattern
 * (icon + description + chevron, divided list). Fails closed to an error card if
 * either fetch rejects. Mounted only behind `RequireSuperuser`.
 */
export const Insights = () => {
    const { t } = useTranslation("nav");
    const navigate = useNavigate();
    const { anomalies, health, isLoading, isError } = usePlatformInsights();

    // Bucket the flat anomaly feed by severity so each group renders under its
    // own heading; severities with no anomalies are dropped.
    const grouped = useMemo(() => {
        const buckets: Record<AnomalySeverity, PlatformAnomaly[]> = {
            critical: [],
            warning: [],
            info: [],
        };
        for (const anomaly of anomalies) {
            (buckets[anomaly.severity] ?? buckets.info).push(anomaly);
        }
        return buckets;
    }, [anomalies]);

    return (
        <div>
            <PageHeader title={t("consoleInsights")} subtitle={t("consoleTitle")} />

            {isError ? (
                <Card>
                    <p className="text-sm text-red-400">{t("consoleInsightsError")}</p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Anomaly feed (wider column) */}
                    <div className="lg:col-span-2 space-y-4">
                        {isLoading ? (
                            <Card>
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-16" />
                                    ))}
                                </div>
                            </Card>
                        ) : anomalies.length === 0 ? (
                            <Card>
                                <div className="p-2 flex flex-col items-center gap-3 text-center">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                                    <p className="text-sm text-zinc-300">
                                        {t("consoleAnomaliesAllClear")}
                                    </p>
                                </div>
                            </Card>
                        ) : (
                            SEVERITY_ORDER.filter((s) => grouped[s].length > 0).map((severity) => {
                                const meta = SEVERITY_META[severity];
                                const Icon = meta.icon;
                                return (
                                    <Card
                                        key={severity}
                                        padding="none"
                                        header={
                                            <div className="flex items-center gap-2">
                                                <Icon className={`w-4 h-4 ${meta.iconClass}`} />
                                                <h3 className="text-sm font-semibold text-zinc-200">
                                                    {t(meta.labelKey)}
                                                </h3>
                                                <Badge variant={meta.badge} className="ml-1">
                                                    {grouped[severity].length}
                                                </Badge>
                                            </div>
                                        }
                                    >
                                        <ul className="divide-y divide-white/[0.06]">
                                            {grouped[severity].map((anomaly) => (
                                                <li
                                                    key={`${anomaly.kind}-${anomaly.company_id}-${anomaly.detail}`}
                                                    className="px-5 py-4"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <Icon
                                                            className={`w-4 h-4 mt-0.5 flex-shrink-0 ${meta.iconClass}`}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <Link
                                                                to={`/console/companies/${anomaly.company_id}`}
                                                                className="text-sm font-medium text-zinc-100 hover:text-indigo-300 transition-colors"
                                                            >
                                                                {anomaly.company_name}
                                                            </Link>
                                                            <p className="text-sm text-zinc-400 mt-0.5">
                                                                {anomaly.detail}
                                                            </p>
                                                            <p className="text-xs text-zinc-500 mt-1.5">
                                                                <span className="text-zinc-400 font-medium">
                                                                    {t("consoleSuggestedAction")}:
                                                                </span>{" "}
                                                                {anomaly.suggested_action}
                                                            </p>
                                                            <Link
                                                                to={`/console/companies/${anomaly.company_id}`}
                                                                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-2"
                                                            >
                                                                {t("consoleViewCompany")}
                                                                <ArrowRight className="w-3 h-3" />
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </Card>
                                );
                            })
                        )}
                    </div>

                    {/* Needs-attention health list */}
                    <Card
                        padding="none"
                        header={
                            <h3 className="text-sm font-semibold text-zinc-200">
                                {t("consoleHealthTitle")}
                            </h3>
                        }
                    >
                        {isLoading ? (
                            <div className="p-5 space-y-3">
                                {[1, 2, 3, 4].map((i) => (
                                    <Skeleton key={i} className="h-10" />
                                ))}
                            </div>
                        ) : health.length === 0 ? (
                            <div className="p-6 flex flex-col items-center gap-3 text-center">
                                <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                                <p className="text-sm text-zinc-300">{t("consoleHealthAllClear")}</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-white/[0.06]">
                                {health.map((entry) => (
                                    <li key={entry.company_id}>
                                        <button
                                            onClick={() =>
                                                navigate(`/console/companies/${entry.company_id}`)
                                            }
                                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors text-left group"
                                        >
                                            <span className="flex-1 text-sm text-zinc-300 truncate">
                                                {entry.company_name}
                                            </span>
                                            <Badge variant={healthVariant(entry.score)}>
                                                {entry.score}
                                            </Badge>
                                            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
};

export default Insights;
