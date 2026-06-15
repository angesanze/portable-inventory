import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import {
    Edit2,
    Trash2,
    Plus,
    MoreVertical,
    PackageOpen,
    Download,
    Eye,
    XCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/ui/PageHeader";
import { FilterBar, type FilterConfig } from "../../components/ui/FilterBar";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../components/ui/Table";
import { Badge, type BadgeVariant } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DropdownMenu } from "../../components/ui/DropdownMenu";
import { ConfirmDialog, useConfirmDialog } from "../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { useToast } from "../../components/ui/Toast";
import { API_URL } from "../../config";
import { exportToExcel } from "../../utils/exportToExcel";
import { fetchAllPages } from "../../utils/fetchAllPages";
import {
    SALES_ORDER_EXPORT_COLUMNS,
    SALES_ORDER_EXPORT_FILENAME,
} from "./exportColumns";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    DRAFT: "neutral",
    CONFIRMED: "amber",
    PICKING: "cyan",
    PARTIALLY_SHIPPED: "cyan",
    SHIPPED: "emerald",
    CANCELLED: "red",
};

const CANCELLABLE = ["DRAFT", "CONFIRMED", "PICKING"];

export const SalesOrderList = () => {
    const { t } = useTranslation(["sales", "common"]);
    const navigate = useNavigate();
    const { toast } = useToast();

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const updateSearch = useCallback((_key: string, value: string) => {
        setSearch(value);
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (search) {
            result.push({ field: "search", operator: "contains", value: search });
        }
        if (statusFilter) {
            result.push({ field: "status", operator: "eq", value: statusFilter });
        }
        return result;
    }, [search, statusFilter]);

    const { data: listData, isLoading, isError, refetch } = useList({
        resource: "sales-orders",
        filters: crudFilters,
        sorters: [{ field: "created_at", order: "desc" }],
    }) as any;

    const orders = Array.isArray(listData?.data) ? listData.data : [];

    const { mutate: deleteOrder } = useDelete();
    const { mutateAsync: postAction } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();

    const [exporting, setExporting] = useState(false);
    const exportAll = async () => {
        setExporting(true);
        try {
            const params: Record<string, string> = {};
            if (search) params.search = search;
            if (statusFilter) params.status = statusFilter;
            const all = await fetchAllPages<any>(`${API_URL}/api/v1/sales-orders/`, params);
            exportToExcel(all, SALES_ORDER_EXPORT_COLUMNS, `${SALES_ORDER_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const runCancel = async (id: string) => {
        try {
            await postAction({
                url: `${API_URL}/api/v1/sales-orders/${id}/cancel/`,
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

    const statusOptions = ["DRAFT", "CONFIRMED", "PICKING", "PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED"];
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
                    <>
                        <Button
                            variant="secondary"
                            icon={Download}
                            disabled={isLoading || exporting}
                            onClick={exportAll}
                        >
                            {t("common:downloadExcel")}
                        </Button>
                        <Link to="/sales/create">
                            <Button variant="primary" icon={Plus}>
                                {t("newOrder")}
                            </Button>
                        </Link>
                    </>
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
                            <TableHead>{t("colNumber")}</TableHead>
                            <TableHead>{t("colCustomer")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead>{t("colPromised")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={6} />
                    </TableBody>
                </Table>
            ) : orders.length === 0 ? (
                <EmptyState
                    icon={PackageOpen}
                    title={t("emptyTitle")}
                    description={t("emptyDesc")}
                    actionLabel={t("newOrder")}
                    onAction={() => navigate("/sales/create")}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("colNumber")}</TableHead>
                            <TableHead>{t("colCustomer")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead>{t("colPromised")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((so: any) => {
                            const isDraft = so.status === "DRAFT";
                            return (
                                <TableRow
                                    key={so.id}
                                    className="cursor-pointer"
                                    onClick={() =>
                                        navigate(
                                            isDraft ? `/sales/edit/${so.id}` : `/sales/${so.id}`,
                                        )
                                    }
                                >
                                    <TableCell className="font-mono text-zinc-200">
                                        {so.number}
                                    </TableCell>
                                    <TableCell className="text-zinc-300">
                                        {so.customer_name || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANTS[so.status] ?? "neutral"}>
                                            {t(`status.${so.status}`, so.status)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {so.lines?.length ?? 0}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {so.promised_at || "—"}
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
                                                    data-testid={`so-actions-${so.id}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                            }
                                            align="end"
                                            items={[
                                                {
                                                    label: t("viewAction"),
                                                    icon: Eye,
                                                    onClick: () => navigate(`/sales/${so.id}`),
                                                },
                                                ...(isDraft
                                                    ? [
                                                          {
                                                              label: t("common:edit"),
                                                              icon: Edit2,
                                                              onClick: () =>
                                                                  navigate(`/sales/edit/${so.id}`),
                                                          },
                                                      ]
                                                    : []),
                                                ...(CANCELLABLE.includes(so.status)
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
                                                                      runCancel(so.id);
                                                                  }
                                                              },
                                                          },
                                                      ]
                                                    : []),
                                                ...(isDraft
                                                    ? [
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
                                                                          resource: "sales-orders",
                                                                          id: so.id,
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
