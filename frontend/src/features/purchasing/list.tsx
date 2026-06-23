import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import {
    Edit2,
    Trash2,
    Plus,
    MoreVertical,
    ShoppingCart,
    Download,
    CheckCircle2,
    PackageCheck,
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
    PURCHASE_ORDER_EXPORT_COLUMNS,
    PURCHASE_ORDER_EXPORT_FILENAME,
    type PurchaseOrderExportRow,
} from "./exportColumns";
import type { PurchaseOrderRecord } from "./types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    DRAFT: "neutral",
    CONFIRMED: "amber",
    PARTIALLY_RECEIVED: "cyan",
    RECEIVED: "emerald",
    CANCELLED: "red",
};

const RECEIVABLE = ["CONFIRMED", "PARTIALLY_RECEIVED"];

export const PurchaseOrderList = () => {
    const { t } = useTranslation(["purchasing", "common"]);
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

    const { data: listData, isLoading, isError, refetch } = useList<PurchaseOrderRecord>({
        resource: "purchase-orders",
        filters: crudFilters,
        sorters: [{ field: "created_at", order: "desc" }],
    });

    const orders: PurchaseOrderRecord[] = Array.isArray(listData?.data)
        ? listData.data
        : [];

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
            const all = await fetchAllPages<PurchaseOrderExportRow>(`${API_URL}/api/v1/purchase-orders/`, params);
            exportToExcel(all, PURCHASE_ORDER_EXPORT_COLUMNS, `${PURCHASE_ORDER_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const runAction = async (id: string, action: "confirm" | "cancel", successMessage: string) => {
        try {
            await postAction({
                url: `${API_URL}/api/v1/purchase-orders/${id}/${action}/`,
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

    const statusOptions = ["DRAFT", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];
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
                        <Link to="/purchasing/create">
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
                            <TableHead>{t("colSupplier")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead>{t("colExpected")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={6} />
                    </TableBody>
                </Table>
            ) : orders.length === 0 ? (
                <EmptyState
                    icon={ShoppingCart}
                    title={t("emptyTitle")}
                    description={t("emptyDesc")}
                    actionLabel={t("newOrder")}
                    onAction={() => navigate("/purchasing/create")}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("colNumber")}</TableHead>
                            <TableHead>{t("colSupplier")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead>{t("colExpected")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((po) => {
                            const isDraft = po.status === "DRAFT";
                            const isReceivable = RECEIVABLE.includes(po.status);
                            return (
                                <TableRow
                                    key={po.id}
                                    className="cursor-pointer"
                                    onClick={() =>
                                        navigate(
                                            isDraft
                                                ? `/purchasing/edit/${po.id}`
                                                : `/purchasing/receive/${po.id}`,
                                        )
                                    }
                                >
                                    <TableCell className="font-mono text-zinc-200">
                                        {po.number}
                                    </TableCell>
                                    <TableCell className="text-zinc-300">
                                        {po.supplier_name || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANTS[po.status] ?? "neutral"}>
                                            {t(`status.${po.status}`, String(po.status))}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {po.lines?.length ?? 0}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {po.expected_at || "—"}
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
                                                    data-testid={`po-actions-${po.id}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                            }
                                            align="end"
                                            items={[
                                                ...(isDraft
                                                    ? [
                                                          {
                                                              label: t("common:edit"),
                                                              icon: Edit2,
                                                              onClick: () =>
                                                                  navigate(`/purchasing/edit/${po.id}`),
                                                          },
                                                          {
                                                              label: t("confirmAction"),
                                                              icon: CheckCircle2,
                                                              onClick: () =>
                                                                  runAction(po.id, "confirm", t("confirmSuccess")),
                                                          },
                                                      ]
                                                    : []),
                                                ...(isReceivable
                                                    ? [
                                                          {
                                                              label: t("receiveAction"),
                                                              icon: PackageCheck,
                                                              onClick: () =>
                                                                  navigate(`/purchasing/receive/${po.id}`),
                                                          },
                                                      ]
                                                    : []),
                                                ...(po.status === "DRAFT" || po.status === "CONFIRMED"
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
                                                                      runAction(po.id, "cancel", t("cancelSuccess"));
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
                                                                          resource: "purchase-orders",
                                                                          id: po.id,
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
