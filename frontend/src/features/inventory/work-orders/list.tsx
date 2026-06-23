import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustom, useCustomMutation, useApiUrl } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Edit2, Trash2, Plus, MoreVertical, Eye, ChevronUp, Archive, CheckCircle, ClipboardList, ListPlus, Package, Zap, Download } from "lucide-react";
import React from "react";
import { PageHeader } from "../../../components/ui/PageHeader";
import { DismissableHint } from "../../../components/ui/DismissableHint";
import { FilterBar, type FilterConfig } from "../../../components/ui/FilterBar";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { BulkActionsBar } from "../../../components/ui/BulkActionsBar";
import { BulkDeleteModal } from "../../../components/ui/BulkDeleteModal";
import { DropdownMenu } from "../../../components/ui/DropdownMenu";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState, FilteredEmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useTableSelection } from "../../../hooks/useTableSelection";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { fetchAllPages } from "../../../utils/fetchAllPages";
import { WORK_ORDER_EXPORT_COLUMNS, WORK_ORDER_EXPORT_FILENAME, type WorkOrderExportRow } from "./exportColumns";
import type { WorkOrderListRow, WorkOrderContentRow } from "./listTypes";

function statusVariant(status: string) {
    switch (status) {
        case "OPEN": return "emerald" as const;
        case "CLOSED": return "neutral" as const;
        case "ARCHIVED": return "amber" as const;
        default: return "neutral" as const;
    }
}

function formatRelativeTime(dateString: string, t: TFunction): string {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t("common:justNow");
    if (diffMins < 60) return t("common:minutesAgo", { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t("common:hoursAgo", { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return t("common:daysAgo", { count: diffDays });
    return date.toLocaleDateString();
}

const ExpandedRow = ({ recordId }: { recordId: string }) => {
    const { t } = useTranslation(["inventory", "common"]);
    const apiUrl = useApiUrl();
    const { data: contentsData, isLoading } = useCustom({
        url: `${apiUrl}/work-orders/${recordId}/contents/`,
        method: "get",
    });

    const rawData = contentsData?.data;
    const contents: WorkOrderContentRow[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.results)
          ? rawData.results
          : [];

    if (isLoading)
        return (
            <div className="bg-zinc-900/50 p-4 border-t border-indigo-500/20 space-y-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-zinc-800" />
                ))}
            </div>
        );
    if (contents.length === 0)
        return (
            <div className="p-4 text-center text-zinc-500 italic">
                {t("workOrders.noContents")}
            </div>
        );

    return (
        <div className="bg-zinc-900/50 p-4 border-t border-indigo-500/20">
            <h4 className="text-xs font-medium text-indigo-400 uppercase mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                {t("workOrders.contentsBreakdown")}
            </h4>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("workOrders.product")}</TableHead>
                        <TableHead>{t("workOrders.sku")}</TableHead>
                        <TableHead className="text-right">{t("workOrders.quantity")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {contents.map((item, idx) => (
                        <TableRow key={idx}>
                            <TableCell className="font-medium text-zinc-200">
                                {item.product_name}
                            </TableCell>
                            <TableCell className="text-zinc-400 font-mono text-xs">
                                {item.sku}
                            </TableCell>
                            <TableCell className="text-right text-indigo-300 font-semibold">
                                {item.quantity}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export const WorkOrderList = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const STATUS_OPTIONS = [
        { label: t("workOrders.open"), value: "OPEN" },
        { label: t("workOrders.closed"), value: "CLOSED" },
        { label: t("workOrders.archived"), value: "ARCHIVED" },
    ];
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({
        name: "",
        status: "",
    });

    const toggleRow = (id: string) => {
        setExpandedRowId(expandedRowId === id ? null : id);
    };

    const updateFilter = useCallback((key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (filters.name) {
            result.push({ field: "search", operator: "contains", value: filters.name });
        }
        if (filters.status) {
            result.push({ field: "status", operator: "eq", value: filters.status });
        }
        return result;
    }, [filters]);

    const { data: listData, isLoading, isError, refetch } = useList<WorkOrderListRow>({
        resource: "work-orders",
        filters: crudFilters,
        sorters: [{ field: "created_at", order: "desc" }],
    });

    const navigate = useNavigate();
    const { mutate: deleteOrder } = useDelete();
    const { mutateAsync: bulkDelete } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const orders = Array.isArray(listData?.data) ? listData.data : [];

    const [exporting, setExporting] = useState(false);
    // Export must cover the full filtered dataset, not the visible page —
    // `orders` is one server page.
    const exportAll = async () => {
        setExporting(true);
        try {
            const params: Record<string, string> = {};
            if (filters.name) params.search = filters.name;
            if (filters.status) params.status = filters.status;
            const all = await fetchAllPages<WorkOrderExportRow>(`${API_URL}/api/v1/work-orders/`, params);
            exportToExcel(all, WORK_ORDER_EXPORT_COLUMNS, `${WORK_ORDER_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const selection = useTableSelection(orders);
    const selectedItems = useMemo(
        () =>
            orders
                .filter((o) => selection.selectedIds.has(o.id))
                .map((o) => ({ id: String(o.id), label: o.name })),
        [orders, selection.selectedIds],
    );

    const filterConfigs: FilterConfig[] = [
        {
            key: "name",
            label: t("common:name"),
            type: "text",
            placeholder: t("workOrders.searchPlaceholder"),
            value: filters.name,
            onChange: (v) => updateFilter("name", v),
        },
        {
            key: "status",
            label: t("common:status"),
            type: "select",
            options: STATUS_OPTIONS,
            value: filters.status,
            onChange: (v) => updateFilter("status", v),
        },
    ];

    return (
        <div>
            <PageHeader
                title={t("workOrders.title")}
                subtitle={t("workOrders.subtitle")}
                count={orders.length}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={Download}
                            disabled={isLoading || exporting}
                            onClick={exportAll}
                        >
                            {t("common:downloadExcel")}
                        </Button>
                        <Link to="/work-orders/create">
                            <Button variant="primary" icon={Plus}>
                                {t("workOrders.newWorkOrder")}
                            </Button>
                        </Link>
                    </>
                }
            />

            <FilterBar filters={filterConfigs} className="mb-4" />

            <DismissableHint id="work-orders-list-purpose" icon={ClipboardList} className="mb-4">
                {t("workOrders.hintExplanation")}
            </DismissableHint>

            {isError ? (
                <ErrorState
                    title={t("workOrders.failedToLoad")}
                    message={t("workOrders.failedToLoadDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>{t("common:name")}</TableHead>
                            <TableHead>{t("workOrders.productModel")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead>{t("workOrders.lineItems")}</TableHead>
                            <TableHead>{t("common:created")}</TableHead>
                            <TableHead>{t("common:updated")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={8} />
                    </TableBody>
                </Table>
            ) : orders.length === 0 ? (
                Object.values(filters).some((v) => v) ? (
                    <FilteredEmptyState />
                ) : (
                    <EmptyState
                        icon={ClipboardList}
                        title={t("workOrders.emptyTitle")}
                        description={t("workOrders.emptyDesc")}
                        helpItems={[
                            { icon: Zap, text: t("workOrders.assemblyHelp") },
                            { icon: Package, text: t("workOrders.kittingHelp") },
                            { icon: ListPlus, text: t("workOrders.fulfillmentHelp") },
                        ]}
                        actionLabel={t("workOrders.createWorkOrder")}
                        onAction={() => navigate("/work-orders/create")}
                    />
                )
            ) : (
                <>
                    <BulkActionsBar
                        count={selection.selectedIds.size}
                        onClear={selection.clear}
                        actions={[
                            {
                                label: t("common:delete"),
                                icon: Trash2,
                                variant: "danger",
                                onClick: () => setBulkDeleteOpen(true),
                            },
                            {
                                label: t("common:bulkExportSelected"),
                                icon: Download,
                                onClick: () =>
                                    exportToExcel(
                                        orders.filter((o) =>
                                            selection.selectedIds.has(o.id),
                                        ),
                                        WORK_ORDER_EXPORT_COLUMNS,
                                        `${WORK_ORDER_EXPORT_FILENAME}-selected.xlsx`,
                                    ),
                            },
                        ]}
                    />
                    <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10">
                                <Checkbox
                                    aria-label={t("common:selectAll")}
                                    checked={
                                        selection.isPartial
                                            ? "indeterminate"
                                            : selection.isAllSelected
                                    }
                                    onChange={() => selection.toggleAll()}
                                />
                            </TableHead>
                            <TableHead>{t("common:name")}</TableHead>
                            <TableHead>{t("workOrders.productModel")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead>{t("workOrders.lineItems")}</TableHead>
                            <TableHead>{t("common:created")}</TableHead>
                            <TableHead>{t("common:updated")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order) => (
                            <React.Fragment key={order.id}>
                                <TableRow
                                    className={`cursor-pointer ${expandedRowId === order.id ? "bg-white/[0.03]" : ""}`}
                                    onClick={() => navigate(`/work-orders/${order.id}`)}
                                >
                                    <TableCell
                                        className="w-10"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Checkbox
                                            aria-label={t("common:selectRow", { name: order.name })}
                                            checked={selection.selectedIds.has(order.id)}
                                            onChange={() => selection.toggleOne(order.id)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium text-zinc-200">
                                        {order.name}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {order.product_model_name || order.product_model_sku || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={statusVariant(order.status)}
                                            dot={order.status === "OPEN"}
                                        >
                                            {order.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {order.contents_summary?.total_items ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {order.created_at
                                            ? formatRelativeTime(order.created_at, t)
                                            : "—"}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {order.updated_at
                                            ? formatRelativeTime(order.updated_at, t)
                                            : "—"}
                                    </TableCell>
                                    <TableCell
                                        className="text-right"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => toggleRow(order.id)}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    expandedRowId === order.id
                                                        ? "text-indigo-400 bg-indigo-500/10"
                                                        : "text-zinc-400 hover:text-white hover:bg-white/10"
                                                }`}
                                                title={
                                                    expandedRowId === order.id
                                                        ? t("workOrders.collapse")
                                                        : t("workOrders.expandContents")
                                                }
                                                aria-label={
                                                    expandedRowId === order.id
                                                        ? t("workOrders.collapseContents")
                                                        : t("workOrders.expandContents")
                                                }
                                            >
                                                {expandedRowId === order.id ? (
                                                    <ChevronUp size={16} />
                                                ) : (
                                                    <Eye size={16} />
                                                )}
                                            </button>
                                            <DropdownMenu
                                                trigger={
                                                    <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" aria-label={t("common:moreActions")}>
                                                        <MoreVertical size={16} />
                                                    </button>
                                                }
                                                align="end"
                                                items={[
                                                    {
                                                        label: t("common:view"),
                                                        icon: Eye,
                                                        onClick: () =>
                                                            navigate(`/work-orders/${order.id}`),
                                                    },
                                                    {
                                                        label: t("common:edit"),
                                                        icon: Edit2,
                                                        onClick: () =>
                                                            navigate(
                                                                `/work-orders/edit/${order.id}`,
                                                            ),
                                                    },
                                                    ...(order.status === "OPEN"
                                                        ? [
                                                              {
                                                                  label: t("workOrders.complete"),
                                                                  icon: CheckCircle,
                                                                  onClick: () =>
                                                                      navigate(
                                                                          `/work-orders/edit/${order.id}`,
                                                                      ),
                                                              },
                                                          ]
                                                        : []),
                                                    ...(order.status === "CLOSED"
                                                        ? [
                                                              {
                                                                  label: t("workOrders.archive"),
                                                                  icon: Archive,
                                                                  onClick: () =>
                                                                      navigate(
                                                                          `/work-orders/edit/${order.id}`,
                                                                      ),
                                                              },
                                                          ]
                                                        : []),
                                                    { type: "divider" as const },
                                                    {
                                                        label: t("common:delete"),
                                                        icon: Trash2,
                                                        danger: true,
                                                        onClick: async () => {
                                                            if (
                                                                await confirm({
                                                                    title: t("workOrders.deleteWorkOrder"),
                                                                    message:
                                                                        t("workOrders.deleteConfirmList"),
                                                                    variant: "danger",
                                                                    confirmLabel: t("common:delete"),
                                                                })
                                                            ) {
                                                                deleteOrder({
                                                                    resource: "work-orders",
                                                                    id: order.id,
                                                                });
                                                            }
                                                        },
                                                    },
                                                ]}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                                {expandedRowId === order.id && (
                                    <TableRow
                                        className="bg-zinc-900/50 hover:bg-zinc-900/50"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <TableCell colSpan={8} className="p-0">
                                            <ExpandedRow recordId={order.id} />
                                        </TableCell>
                                    </TableRow>
                                )}
                            </React.Fragment>
                        ))}
                    </TableBody>
                </Table>
                </>
            )}

            <ConfirmDialog {...dialogProps} />
            <BulkDeleteModal
                open={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                items={selectedItems}
                cascadeLabel={t("workOrders.bulkDeleteCascadeChildren")}
                onConfirm={async (preserveCascade) => {
                    if (preserveCascade) {
                        setBulkDeleteOpen(false);
                        const ok = await confirm({
                            title: t("workOrders.bulkDeleteCascadeConfirmTitle"),
                            message: t("workOrders.bulkDeleteCascadeConfirmMessage"),
                            variant: "danger",
                            confirmLabel: t("common:delete"),
                        });
                        if (!ok) return;
                    }
                    await bulkDelete({
                        url: `${API_URL}/api/v1/work-orders/bulk-delete/`,
                        method: "post",
                        values: {
                            ids: Array.from(selection.selectedIds),
                            cascade: preserveCascade,
                        },
                        successNotification: () => ({
                            message: t("workOrders.bulkDeleteSuccess", {
                                count: selectedItems.length,
                            }),
                            type: "success",
                        }),
                        errorNotification: () => ({
                            message: t("common:bulkDeleteFailed"),
                            type: "error",
                        }),
                    });
                    selection.clear();
                    setBulkDeleteOpen(false);
                    refetch();
                }}
            />
        </div>
    );
};
