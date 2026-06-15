import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation, useCustom } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import {
    Trash2,
    Plus,
    MoreVertical,
    Truck,
    Send,
    PackageCheck,
    XCircle,
    Clock,
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

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    DRAFT: "neutral",
    IN_TRANSIT: "amber",
    PARTIALLY_RECEIVED: "cyan",
    RECEIVED: "emerald",
    CANCELLED: "red",
};

const RECEIVABLE = ["IN_TRANSIT", "PARTIALLY_RECEIVED"];

function daysSince(iso?: string | null): number | null {
    if (!iso) return null;
    const shipped = new Date(iso).getTime();
    if (Number.isNaN(shipped)) return null;
    return Math.max(0, Math.floor((Date.now() - shipped) / 86_400_000));
}

/** Widget reading the virtual In Transit location explicitly. */
const InTransitWidget = () => {
    const { t } = useTranslation(["transfers"]);
    const { data } = useCustom({
        url: `${API_URL}/api/v1/transfer-orders/in_transit/`,
        method: "get",
    }) as any;
    const report = data?.data;
    const total = report?.total ?? "0";
    const rows: any[] = report?.by_product ?? [];
    if (!rows.length) return null;
    return (
        <div
            className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4"
            data-testid="in-transit-widget"
        >
            <div className="flex items-center gap-2 mb-2">
                <Truck size={16} className="text-amber-400" />
                <span className="text-sm font-medium text-zinc-200">
                    {t("widget.title")}
                </span>
                <Badge variant="amber">{total}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
                {rows.map((r) => (
                    <span
                        key={r.product_id}
                        className="text-xs text-zinc-300 bg-white/[0.04] rounded-md px-2 py-1"
                    >
                        {r.name} · <span className="font-mono text-amber-300">{r.quantity}</span>
                    </span>
                ))}
            </div>
        </div>
    );
};

export const TransferOrderList = () => {
    const { t } = useTranslation(["transfers", "common"]);
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

    const { data: listData, isLoading, isError, refetch } = useList({
        resource: "transfer-orders",
        filters: crudFilters,
        sorters: [{ field: "created_at", order: "desc" }],
    }) as any;

    const orders = Array.isArray(listData?.data) ? listData.data : [];

    const { mutate: deleteOrder } = useDelete();
    const { mutateAsync: postAction } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();

    const runAction = async (id: string, action: "ship" | "cancel", successMessage: string) => {
        try {
            await postAction({
                url: `${API_URL}/api/v1/transfer-orders/${id}/${action}/`,
                method: "post",
                values: {},
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: successMessage, variant: "success" });
            refetch();
        } catch {
            toast({ message: t("actionFailed"), variant: "error" });
        }
    };

    const statusOptions = ["DRAFT", "IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];
    const filterConfigs: FilterConfig[] = [
        {
            key: "search",
            label: t("colNumber"),
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
                ...statusOptions.map((s) => ({ value: s, label: t(`status.${s}`) })),
            ],
        },
    ];

    return (
        <div>
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                count={orders.length}
                actions={
                    <Link to="/transfers/create">
                        <Button variant="primary" icon={Plus}>
                            {t("newOrder")}
                        </Button>
                    </Link>
                }
            />

            <InTransitWidget />

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
                            <TableHead>{t("colNumber")}</TableHead>
                            <TableHead>{t("colRoute")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colTransit")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={6} />
                    </TableBody>
                </Table>
            ) : orders.length === 0 ? (
                <EmptyState
                    icon={Truck}
                    title={t("emptyTitle")}
                    description={t("emptyDesc")}
                    actionLabel={t("newOrder")}
                    onAction={() => navigate("/transfers/create")}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("colNumber")}</TableHead>
                            <TableHead>{t("colRoute")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colTransit")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((to: any) => {
                            const isDraft = to.status === "DRAFT";
                            const isReceivable = RECEIVABLE.includes(to.status);
                            const days = isReceivable ? daysSince(to.shipped_at) : null;
                            return (
                                <TableRow
                                    key={to.id}
                                    className="cursor-pointer"
                                    onClick={() =>
                                        navigate(
                                            isDraft
                                                ? `/transfers/edit/${to.id}`
                                                : `/transfers/receive/${to.id}`,
                                        )
                                    }
                                >
                                    <TableCell className="font-mono text-zinc-200">
                                        {to.number}
                                    </TableCell>
                                    <TableCell className="text-zinc-300 text-sm">
                                        {to.from_location_name} → {to.to_location_name}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANTS[to.status] ?? "neutral"}>
                                            {t(`status.${to.status}`, to.status)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {days !== null ? (
                                            <span
                                                className="inline-flex items-center gap-1 text-xs text-amber-300"
                                                data-testid={`transit-days-${to.id}`}
                                            >
                                                <Clock size={12} />
                                                {t("inTransitDays", { count: days })}
                                            </span>
                                        ) : (
                                            <span className="text-zinc-600">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {to.lines?.length ?? 0}
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
                                                    data-testid={`to-actions-${to.id}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                            }
                                            align="end"
                                            items={[
                                                ...(isDraft
                                                    ? [
                                                          {
                                                              label: t("shipAction"),
                                                              icon: Send,
                                                              onClick: () =>
                                                                  runAction(to.id, "ship", t("shipSuccess")),
                                                          },
                                                      ]
                                                    : []),
                                                ...(isReceivable
                                                    ? [
                                                          {
                                                              label: t("receiveAction"),
                                                              icon: PackageCheck,
                                                              onClick: () =>
                                                                  navigate(`/transfers/receive/${to.id}`),
                                                          },
                                                      ]
                                                    : []),
                                                ...(isDraft
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
                                                                      runAction(to.id, "cancel", t("cancelSuccess"));
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
                                                                      deleteOrder({
                                                                          resource: "transfer-orders",
                                                                          id: to.id,
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
                            );
                        })}
                    </TableBody>
                </Table>
            )}

            <ConfirmDialog {...dialogProps} />
        </div>
    );
};
