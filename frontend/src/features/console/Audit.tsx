import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge, type BadgeVariant } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { FilterBar, type FilterConfig } from "../../components/ui/FilterBar";
import { useCompanies, usePlatformAudit } from "./hooks";

// The audit actions the backend records (``AuditLog.Action``). Each maps to a
// human label (i18n) and a badge colour so the timeline reads at a glance.
const ACTION_META: Record<string, { labelKey: string; badge: BadgeVariant }> = {
    COMPANY_PROVISIONED: { labelKey: "consoleActionProvisioned", badge: "success" },
    TIER_CHANGED: { labelKey: "consoleActionTierChanged", badge: "indigo" },
    COMPANY_SUSPENDED: { labelKey: "consoleActionSuspended", badge: "warning" },
    COMPANY_REACTIVATED: { labelKey: "consoleActionReactivated", badge: "success" },
    USER_INVITED: { labelKey: "consoleActionUserInvited", badge: "info" },
    LOGIN: { labelKey: "consoleActionLogin", badge: "neutral" },
};

const ACTION_ORDER = Object.keys(ACTION_META);

/**
 * Render an audit entry's ``metadata`` blob into a compact, human-readable
 * summary. A ``{from, to}`` pair (e.g. a tier change) renders as ``from → to``;
 * any other keys render as ``key: value`` fragments. Returns ``null`` for an
 * empty blob so the row simply omits the line.
 */
const renderMetadata = (metadata: Record<string, unknown>) => {
    const entries = Object.entries(metadata ?? {});
    if (entries.length === 0) return null;

    if ("from" in metadata && "to" in metadata) {
        return (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-300">
                <span className="text-zinc-400">{String(metadata.from)}</span>
                <ArrowRight className="w-3 h-3 text-zinc-500" />
                <span className="text-zinc-200">{String(metadata.to)}</span>
            </span>
        );
    }

    return (
        <span className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-zinc-400">
            {entries.map(([key, value]) => (
                <span key={key}>
                    <span className="text-zinc-500">{key}:</span>{" "}
                    <span className="text-zinc-300">{String(value)}</span>
                </span>
            ))}
        </span>
    );
};

/**
 * Platform audit-log view for the superadmin console (`/console/audit`). Wraps
 * the paginated `GET /platform/audit/` viewset (SUPERADMIN-04) via
 * {@link usePlatformAudit} and renders a reverse-chronological timeline: each
 * entry shows the actor, an action badge, the target company (deep-linked to its
 * detail drawer), the metadata diff (e.g. a tier `from → to`) and the timestamp.
 * The action and target-company selects drive the viewset's `?action=` /
 * `?target_company=` filters (the company options reuse {@link useCompanies}),
 * and prev/next buttons page through the trail. Skeletons while loading, an
 * {@link EmptyState} when nothing matches, and a fail-closed error card.
 * Mounted only behind `RequireSuperuser`.
 */
export const Audit = () => {
    const { t } = useTranslation("nav");

    const [actionFilter, setActionFilter] = useState("");
    const [companyFilter, setCompanyFilter] = useState("");
    const [page, setPage] = useState(1);

    // Reset to the first page whenever a filter changes so an out-of-range page
    // can't strand the user on an empty result.
    const setActionAndReset = (value: string) => {
        setActionFilter(value);
        setPage(1);
    };
    const setCompanyAndReset = (value: string) => {
        setCompanyFilter(value);
        setPage(1);
    };

    const { entries, count, hasNext, hasPrevious, isLoading, isError } = usePlatformAudit({
        action: actionFilter,
        target_company: companyFilter,
        page,
    });

    // Populate the target-company select from the full company list; the audit
    // view is superuser-only, so the unscoped list is appropriate here.
    const { companies } = useCompanies({});

    const filters: FilterConfig[] = useMemo(
        () => [
            {
                key: "action",
                label: t("consoleColAction"),
                type: "select",
                value: actionFilter,
                onChange: setActionAndReset,
                options: ACTION_ORDER.map((action) => ({
                    value: action,
                    label: t(ACTION_META[action].labelKey),
                })),
            },
            {
                key: "target_company",
                label: t("consoleColTarget"),
                type: "select",
                value: companyFilter,
                onChange: setCompanyAndReset,
                options: companies.map((c) => ({ value: c.id, label: c.name })),
            },
        ],
        [t, actionFilter, companyFilter, companies],
    );

    const formatTimestamp = (value: string) =>
        new Date(value).toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

    return (
        <div>
            <PageHeader title={t("consoleAudit")} subtitle={t("consoleTitle")} />

            <FilterBar filters={filters} className="mb-4" />

            {isError ? (
                <Card>
                    <p className="text-sm text-red-400">{t("consoleAuditError")}</p>
                </Card>
            ) : (
                <Card padding="none">
                    {isLoading ? (
                        <div className="p-5 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-14" />
                            ))}
                        </div>
                    ) : entries.length === 0 ? (
                        <EmptyState
                            icon={ScrollText}
                            title={t("consoleAuditEmpty")}
                            description={t("consoleAuditEmptyDesc")}
                        />
                    ) : (
                        <ul className="divide-y divide-white/[0.06]">
                            {entries.map((entry) => {
                                const meta =
                                    ACTION_META[entry.action] ?? {
                                        labelKey: "",
                                        badge: "neutral" as BadgeVariant,
                                    };
                                const metadataNode = renderMetadata(entry.metadata);
                                return (
                                    <li key={entry.id} className="px-5 py-4">
                                        <div className="flex items-start gap-3">
                                            <Badge variant={meta.badge} className="mt-0.5 flex-shrink-0">
                                                {meta.labelKey ? t(meta.labelKey) : entry.action}
                                            </Badge>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                                                    <span className="font-medium text-zinc-100">
                                                        {entry.actor_username ?? t("consoleAuditSystemActor")}
                                                    </span>
                                                    {entry.target_company_name && (
                                                        <>
                                                            <span className="text-zinc-500">→</span>
                                                            {entry.target_company ? (
                                                                <Link
                                                                    to={`/console/companies/${entry.target_company}`}
                                                                    className="text-zinc-300 hover:text-indigo-300 transition-colors"
                                                                >
                                                                    {entry.target_company_name}
                                                                </Link>
                                                            ) : (
                                                                <span className="text-zinc-300">
                                                                    {entry.target_company_name}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                                {metadataNode && <div className="mt-1.5">{metadataNode}</div>}
                                            </div>
                                            <time className="text-xs text-zinc-500 flex-shrink-0 tabular-nums">
                                                {formatTimestamp(entry.created_at)}
                                            </time>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {/* Pagination footer — shown whenever the trail spans more than one page. */}
                    {!isLoading && (hasNext || hasPrevious) && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
                            <span className="text-xs text-zinc-500 tabular-nums">
                                {t("consoleAuditCount", { count })}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={ChevronLeft}
                                    disabled={!hasPrevious}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    {t("consolePrev")}
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={ChevronRight}
                                    disabled={!hasNext}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    {t("consoleNext")}
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

export default Audit;
