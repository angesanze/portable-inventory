import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Users, KeyRound, Building2, ScrollText } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonCard } from "../../components/ui/Skeleton";
import {
    ConfirmDialog,
    useConfirmDialog,
} from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useActingTenant } from "../../context/ActingTenantProvider";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../components/ui/Table";
import {
    useCompanyDetail,
    setCompanyTier,
    suspendCompany,
    reactivateCompany,
    extractLifecycleError,
    type PlatformActivityEntry,
} from "./hooks";

const formatDateTime = (value: string | null, fallback: string) =>
    value
        ? new Date(value).toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          })
        : fallback;

/** Render a single audit entry's action as a human-readable label. */
const formatAction = (entry: PlatformActivityEntry) =>
    entry.action
        .toLowerCase()
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

/**
 * Company drill-down for the superadmin console (`/console/companies/:id`).
 * Wraps the SUPERADMIN-02 retrieve endpoint via {@link useCompanyDetail} and
 * lays out the company's users, API keys (with usage telemetry), owned tenants
 * (developers only) and recent audit activity. The header carries the lifecycle
 * action buttons — Suspend/Reactivate, Change tier, Act as — whose handlers are
 * wired in the following console phases. Mounted only behind `RequireSuperuser`.
 */
export const CompanyDetail = () => {
    const { t } = useTranslation("nav");
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { company, isLoading, isError, refetch } = useCompanyDetail(id);
    const { toast } = useToast();
    const { confirm, dialogProps } = useConfirmDialog();
    const { setActingTenant } = useActingTenant();
    const [isBusy, setIsBusy] = useState(false);

    const backLink = (
        <Link
            to="/console/companies"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-4"
        >
            <ArrowLeft size={14} />
            {t("consoleDetailBack")}
        </Link>
    );

    if (isLoading) {
        return (
            <div>
                {backLink}
                <SkeletonCard />
            </div>
        );
    }

    if (isError || !company) {
        return (
            <div>
                {backLink}
                <Card>
                    <p className="text-sm text-red-400">
                        {isError ? t("consoleDetailError") : t("consoleDetailNotFound")}
                    </p>
                </Card>
            </div>
        );
    }

    const isDeveloper = company.account_type === "developer";

    // Promote manager→developer / demote developer→manager. The backend runs the
    // model invariant on demote (a manager may not own children) and returns 400;
    // surface that message verbatim so the operator knows to reassign the tenants.
    const handleSetTier = async () => {
        const target: "manager" | "developer" = isDeveloper ? "manager" : "developer";
        const ok = await confirm({
            title: isDeveloper ? t("consoleTierDemoteTitle") : t("consoleTierPromoteTitle"),
            message: isDeveloper
                ? t("consoleTierDemoteMessage", { name: company.name })
                : t("consoleTierPromoteMessage", { name: company.name }),
            confirmLabel: isDeveloper
                ? t("consoleTierDemoteConfirm")
                : t("consoleTierPromoteConfirm"),
            variant: isDeveloper ? "danger" : "default",
        });
        if (!ok) return;
        setIsBusy(true);
        try {
            await setCompanyTier(company.id, target);
            toast({ message: t("consoleTierSuccess"), variant: "success" });
            refetch();
        } catch (err) {
            toast({
                message: extractLifecycleError(err, t("consoleTierFailed")),
                variant: "error",
            });
        } finally {
            setIsBusy(false);
        }
    };

    // Toggle suspension. Suspending blocks the company's users from login/API.
    const handleToggleActive = async () => {
        const suspending = company.is_active;
        const ok = await confirm({
            title: suspending ? t("consoleSuspendTitle") : t("consoleReactivateTitle"),
            message: suspending
                ? t("consoleSuspendMessage", { name: company.name })
                : t("consoleReactivateMessage", { name: company.name }),
            confirmLabel: suspending
                ? t("consoleActionSuspend")
                : t("consoleActionReactivate"),
            variant: suspending ? "danger" : "default",
        });
        if (!ok) return;
        setIsBusy(true);
        try {
            await (suspending ? suspendCompany(company.id) : reactivateCompany(company.id));
            toast({
                message: suspending
                    ? t("consoleSuspendSuccess")
                    : t("consoleReactivateSuccess"),
                variant: "success",
            });
            refetch();
        } catch (err) {
            toast({
                message: extractLifecycleError(err, t("consoleLifecycleFailed")),
                variant: "error",
            });
        } finally {
            setIsBusy(false);
        }
    };

    // Act as this company: persist its id as the acting tenant (the axios
    // interceptor then attaches `X-Acting-Company` to every dashboard request)
    // and drop the operator into the normal dashboard, where the loud
    // ActingTenantBanner offers the exit. Superusers may act-as any company —
    // the backend scope layer already allows it.
    const handleActAs = async () => {
        const ok = await confirm({
            title: t("consoleActAsTitle"),
            message: t("consoleActAsMessage", { name: company.name }),
            confirmLabel: t("consoleActAsConfirm"),
            variant: "default",
        });
        if (!ok) return;
        setActingTenant(company.id);
        toast({ message: t("consoleActAsToast", { name: company.name }), variant: "success" });
        navigate("/");
    };

    // Lifecycle controls — Act as, tier promote/demote, suspend/reactivate —
    // each behind a confirmation dialog.
    const actions = (
        <div className="flex items-center gap-2">
            <Button
                variant="secondary"
                size="sm"
                disabled={isBusy}
                onClick={handleActAs}
            >
                {t("consoleActionActAs")}
            </Button>
            <Button
                variant="secondary"
                size="sm"
                disabled={isBusy}
                onClick={handleSetTier}
            >
                {isDeveloper ? t("consoleActionDemote") : t("consoleActionPromote")}
            </Button>
            <Button
                variant={company.is_active ? "danger" : "primary"}
                size="sm"
                disabled={isBusy}
                onClick={handleToggleActive}
            >
                {company.is_active
                    ? t("consoleActionSuspend")
                    : t("consoleActionReactivate")}
            </Button>
        </div>
    );

    return (
        <div>
            {backLink}

            <ConfirmDialog {...dialogProps} />

            <PageHeader title={company.name} actions={actions} />

            <div className="flex flex-wrap items-center gap-2 mb-6 -mt-2">
                <Badge variant={isDeveloper ? "indigo" : "cyan"}>
                    {isDeveloper ? t("consoleTierDeveloper") : t("consoleTierManager")}
                </Badge>
                <Badge variant={company.is_active ? "success" : "warning"} dot>
                    {company.is_active
                        ? t("consoleStatusActive")
                        : t("consoleStatusSuspended")}
                </Badge>
                {company.vat && (
                    <span className="text-sm text-zinc-400">
                        {t("consoleColVat")}: {company.vat}
                    </span>
                )}
            </div>

            {/* Users */}
            <SectionCard icon={Users} title={t("consoleSectionUsers")} count={company.users.length}>
                {company.users.length === 0 ? (
                    <EmptyState icon={Users} title={t("consoleNoUsers")} />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("consoleColUsername")}</TableHead>
                                <TableHead>{t("consoleColEmail")}</TableHead>
                                <TableHead>{t("consoleColRole")}</TableHead>
                                <TableHead>{t("consoleColStatus")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {company.users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium text-zinc-100">
                                        {user.username}
                                    </TableCell>
                                    <TableCell className="text-zinc-400">
                                        {user.email || "—"}
                                    </TableCell>
                                    <TableCell className="text-zinc-400">
                                        {user.role || t("consoleRoleNone")}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={user.is_active ? "success" : "warning"}
                                            dot
                                        >
                                            {user.is_active
                                                ? t("consoleStatusActive")
                                                : t("consoleStatusSuspended")}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </SectionCard>

            {/* API keys */}
            <SectionCard icon={KeyRound} title={t("consoleSectionApiKeys")} count={company.api_keys.length}>
                {company.api_keys.length === 0 ? (
                    <EmptyState icon={KeyRound} title={t("consoleNoApiKeys")} />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("consoleColKeyLabel")}</TableHead>
                                <TableHead>{t("consoleColRateLimit")}</TableHead>
                                <TableHead className="text-right">
                                    {t("consoleColUsage")}
                                </TableHead>
                                <TableHead>{t("consoleColLastUsed")}</TableHead>
                                <TableHead>{t("consoleColStatus")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {company.api_keys.map((key) => (
                                <TableRow key={key.id}>
                                    <TableCell className="font-medium text-zinc-100">
                                        {key.label}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="slate">{key.rate_limit_tier}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-zinc-300">
                                        {key.usage_count.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-zinc-400">
                                        {formatDateTime(key.last_used_at, t("consoleNever"))}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={key.is_active ? "success" : "warning"}
                                            dot
                                        >
                                            {key.is_active
                                                ? t("consoleStatusActive")
                                                : t("consoleStatusSuspended")}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </SectionCard>

            {/* Owned tenants (developers only) */}
            {isDeveloper && (
                <SectionCard
                    icon={Building2}
                    title={t("consoleSectionChildren")}
                    count={company.children_summary?.length ?? 0}
                >
                    {!company.children_summary || company.children_summary.length === 0 ? (
                        <EmptyState icon={Building2} title={t("consoleNoChildren")} />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("consoleColName")}</TableHead>
                                    <TableHead>{t("consoleColStatus")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {company.children_summary.map((child) => (
                                    <TableRow key={child.id}>
                                        <TableCell className="font-medium text-zinc-100">
                                            <Link
                                                to={`/console/companies/${child.id}`}
                                                className="hover:text-indigo-400 transition-colors"
                                            >
                                                {child.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={child.is_active ? "success" : "warning"}
                                                dot
                                            >
                                                {child.is_active
                                                    ? t("consoleStatusActive")
                                                    : t("consoleStatusSuspended")}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </SectionCard>
            )}

            {/* Recent activity */}
            <SectionCard
                icon={ScrollText}
                title={t("consoleSectionActivity")}
                count={company.recent_activity.length}
            >
                {company.recent_activity.length === 0 ? (
                    <EmptyState icon={ScrollText} title={t("consoleNoActivity")} />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("consoleColAction")}</TableHead>
                                <TableHead>{t("consoleColActor")}</TableHead>
                                <TableHead>{t("consoleColWhen")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {company.recent_activity.map((entry) => (
                                <TableRow key={entry.id}>
                                    <TableCell className="text-zinc-200">
                                        {formatAction(entry)}
                                    </TableCell>
                                    <TableCell className="text-zinc-400">
                                        {entry.actor_username || "—"}
                                    </TableCell>
                                    <TableCell className="text-zinc-400">
                                        {formatDateTime(entry.created_at, "—")}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </SectionCard>
        </div>
    );
};

interface SectionCardProps {
    icon: typeof Users;
    title: string;
    count: number;
    children: React.ReactNode;
}

/** A titled, counted card wrapper for one drill-down section. */
const SectionCard = ({ icon: Icon, title, count, children }: SectionCardProps) => (
    <Card padding="none" className="mb-6">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <Icon size={16} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
            <Badge variant="neutral">{count.toLocaleString()}</Badge>
        </div>
        {children}
    </Card>
);

export default CompanyDetail;
