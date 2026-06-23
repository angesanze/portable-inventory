import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import {
    Trash2,
    Plus,
    MoreVertical,
    ClipboardCheck,
    Eye,
    XCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../../components/ui/PageHeader";
import { FilterBar, type FilterConfig } from "../../../components/ui/FilterBar";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { DropdownMenu } from "../../../components/ui/DropdownMenu";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useToast } from "../../../components/ui/Toast";
import { API_URL } from "../../../config";
import type { CountSessionRow } from "./types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    OPEN: "neutral",
    COUNTING: "cyan",
    REVIEW: "amber",
    APPLIED: "emerald",
    CANCELLED: "red",
};

const STATUS_OPTIONS = ["OPEN", "COUNTING", "REVIEW", "APPLIED", "CANCELLED"];
const CANCELLABLE = ["OPEN", "COUNTING", "REVIEW"];

export const StocktakeList = () => {
    const { t } = useTranslation(["stocktake", "common"]);
    const navigate = useNavigate();
    const { toast } = useToast();

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const updateSearch = useCallback((_key: string, value: string) => {
        setSearch(value);
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (search) result.push({ field: "search", operator: "contains", value: search });
        if (statusFilter) result.push({ field: "status", operator: "eq", value: statusFilter });
        return result;
    }, [search, statusFilter]);

    const { data: listData, isLoading, isError, refetch } = useList<CountSessionRow>({
        resource: "count-sessions",
        filters: crudFilters,
        sorters: [{ field: "created_at", order: "desc" }],
    });

    const sessions: CountSessionRow[] = Array.isArray(listData?.data) ? listData.data : [];

    const { mutate: deleteSession } = useDelete();
    const { mutateAsync: postAction } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();

    const runCancel = async (id: string) => {
        try {
            await postAction({
                url: `${API_URL}/api/v1/count-sessions/${id}/cancel/`,
                method: "post",
                values: {},
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("cancelSuccess"), variant: "success" });
            refetch();
        } catch {
            toast({ message: t("actionFailed"), variant: "error" });
        }
    };

    const filterConfigs: FilterConfig[] = [
        {
            key: "search",
            label: t("colLocation"),
            type: "text",
            placeholder: t("searchPlaceholder"),
            value: search,
            onChange: (v) => updateSearch("search", v),
        },
        {
            key: "status",
            label: t("filterStatus"),
            type: "select",
            value: statusFilter,
            onChange: (v) => setStatusFilter(v),
            options: [
                { value: "", label: t("allStatuses") },
                ...STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) })),
            ],
        },
    ];

    return (
        <div>
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                count={sessions.length}
                actions={
                    <Link to="/stocktake/create">
                        <Button variant="primary" icon={Plus}>
                            {t("newSession")}
                        </Button>
                    </Link>
                }
            />

            <FilterBar filters={filterConfigs} className="mb-4" />

            {isError ? (
                <ErrorState
                    title={t("failedToLoad")}
                    message={t("failedToLoadDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("colLocation")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead>{t("colCreated")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={5} />
                    </TableBody>
                </Table>
            ) : sessions.length === 0 ? (
                <EmptyState
                    icon={ClipboardCheck}
                    title={t("emptyTitle")}
                    description={t("emptyDesc")}
                    actionLabel={t("newSession")}
                    onAction={() => navigate("/stocktake/create")}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("colLocation")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead>{t("colCreated")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sessions.map((s) => (
                            <TableRow
                                key={s.id}
                                className="cursor-pointer"
                                onClick={() => navigate(`/stocktake/${s.id}`)}
                                data-testid={`session-row-${s.id}`}
                            >
                                <TableCell className="text-zinc-200">
                                    {s.location_name || "—"}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={STATUS_VARIANTS[s.status] ?? "neutral"}>
                                        {t(`status.${s.status}`, String(s.status))}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-zinc-400 text-sm">
                                    {s.line_count ?? 0}
                                </TableCell>
                                <TableCell className="text-zinc-400 text-sm">
                                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                                </TableCell>
                                <TableCell
                                    className="text-right"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <DropdownMenu
                                        trigger={
                                            <button
                                                className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                aria-label={t("common:moreActions")}
                                                data-testid={`session-actions-${s.id}`}
                                            >
                                                <MoreVertical size={16} />
                                            </button>
                                        }
                                        align="end"
                                        items={[
                                            {
                                                label: t("viewAction"),
                                                icon: Eye,
                                                onClick: () => navigate(`/stocktake/${s.id}`),
                                            },
                                            ...(CANCELLABLE.includes(s.status)
                                                ? [
                                                      {
                                                          label: t("cancelAction"),
                                                          icon: XCircle,
                                                          danger: true,
                                                          onClick: async () => {
                                                              if (
                                                                  await confirm({
                                                                      title: t("cancelTitle"),
                                                                      message: t("cancelMessage"),
                                                                      variant: "danger",
                                                                      confirmLabel: t("cancelAction"),
                                                                  })
                                                              ) {
                                                                  runCancel(s.id);
                                                              }
                                                          },
                                                      },
                                                      { type: "divider" as const },
                                                      {
                                                          label: t("common:delete"),
                                                          icon: Trash2,
                                                          danger: true,
                                                          onClick: async () => {
                                                              if (
                                                                  await confirm({
                                                                      title: t("deleteTitle"),
                                                                      message: t("deleteMessage"),
                                                                      variant: "danger",
                                                                      confirmLabel: t("common:delete"),
                                                                  })
                                                              ) {
                                                                  deleteSession({
                                                                      resource: "count-sessions",
                                                                      id: s.id,
                                                                  });
                                                              }
                                                          },
                                                      },
                                                  ]
                                                : []),
                                        ]}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            <ConfirmDialog {...dialogProps} />
        </div>
    );
};
