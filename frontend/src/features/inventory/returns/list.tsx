import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import {
    Trash2,
    Plus,
    MoreVertical,
    Undo2,
    PackageCheck,
    Wrench,
    Send,
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
import type { ReturnOrderRow } from "./types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    OPEN: "neutral",
    RECEIVED: "amber",
    RESOLVED: "emerald",
    CANCELLED: "red",
};

const KIND_VARIANTS: Record<string, BadgeVariant> = {
    CUSTOMER_RETURN: "cyan",
    SUPPLIER_RETURN: "amber",
};

export const ReturnOrderList = () => {
    const { t } = useTranslation(["returns", "common"]);
    const navigate = useNavigate();
    const { toast } = useToast();

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [kindFilter, setKindFilter] = useState("");

    const updateSearch = useCallback((_key: string, value: string) => {
        setSearch(value);
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (search) result.push({ field: "search", operator: "contains", value: search });
        if (statusFilter) result.push({ field: "status", operator: "eq", value: statusFilter });
        if (kindFilter) result.push({ field: "kind", operator: "eq", value: kindFilter });
        return result;
    }, [search, statusFilter, kindFilter]);

    const { data: listData, isLoading, isError, refetch } = useList<ReturnOrderRow>({
        resource: "return-orders",
        filters: crudFilters,
        sorters: [{ field: "created_at", order: "desc" }],
    });

    const orders: ReturnOrderRow[] = Array.isArray(listData?.data) ? listData.data : [];

    const { mutate: deleteOrder } = useDelete();
    const { mutateAsync: postAction } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();

    const runAction = async (
        id: string,
        action: "receive" | "ship" | "cancel",
        successMessage: string,
    ) => {
        try {
            await postAction({
                url: `${API_URL}/api/v1/return-orders/${id}/${action}/`,
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

    const statusOptions = ["OPEN", "RECEIVED", "RESOLVED", "CANCELLED"];
    const kindOptions = ["CUSTOMER_RETURN", "SUPPLIER_RETURN"];
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
            key: "kind",
            label: t("filterKind"),
            type: "select",
            value: kindFilter,
            onChange: (v) => setKindFilter(v),
            options: [
                { value: "", label: t("allKinds") },
                ...kindOptions.map((k) => ({ value: k, label: t(`kind.${k}`) })),
            ],
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
                    <Link to="/returns/create">
                        <Button variant="primary" icon={Plus}>
                            {t("newOrder")}
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
                            <TableHead>{t("colNumber")}</TableHead>
                            <TableHead>{t("colKind")}</TableHead>
                            <TableHead>{t("colParty")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colReason")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={7} />
                    </TableBody>
                </Table>
            ) : orders.length === 0 ? (
                <EmptyState
                    icon={Undo2}
                    title={t("emptyTitle")}
                    description={t("emptyDesc")}
                    actionLabel={t("newOrder")}
                    onAction={() => navigate("/returns/create")}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("colNumber")}</TableHead>
                            <TableHead>{t("colKind")}</TableHead>
                            <TableHead>{t("colParty")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colReason")}</TableHead>
                            <TableHead>{t("colLines")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((ro) => {
                            const isOpen = ro.status === "OPEN";
                            const isCustomer = ro.kind === "CUSTOMER_RETURN";
                            const isReceived = ro.status === "RECEIVED";
                            const party = isCustomer ? ro.customer_name : ro.supplier_name;
                            const goTo = isReceived
                                ? `/returns/resolve/${ro.id}`
                                : `/returns/edit/${ro.id}`;
                            return (
                                <TableRow
                                    key={ro.id}
                                    className="cursor-pointer"
                                    onClick={() => navigate(isOpen || isReceived ? goTo : `/returns/resolve/${ro.id}`)}
                                >
                                    <TableCell className="font-mono text-zinc-200">
                                        {ro.number}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={KIND_VARIANTS[ro.kind] ?? "neutral"}>
                                            {t(`kind.${ro.kind}`, String(ro.kind))}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-300 text-sm">
                                        {party || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANTS[ro.status] ?? "neutral"}>
                                            {t(`status.${ro.status}`, String(ro.status))}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {t(`reason.${ro.reason_code}`, String(ro.reason_code))}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {ro.lines?.length ?? 0}
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
                                                    data-testid={`ro-actions-${ro.id}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                            }
                                            align="end"
                                            items={[
                                                ...(isOpen && isCustomer
                                                    ? [
                                                          {
                                                              label: t("receiveAction"),
                                                              icon: PackageCheck,
                                                              onClick: () =>
                                                                  runAction(ro.id, "receive", t("receiveSuccess")),
                                                          },
                                                      ]
                                                    : []),
                                                ...(isOpen && !isCustomer
                                                    ? [
                                                          {
                                                              label: t("shipAction"),
                                                              icon: Send,
                                                              onClick: () =>
                                                                  runAction(ro.id, "ship", t("shipSuccess")),
                                                          },
                                                      ]
                                                    : []),
                                                ...(isReceived
                                                    ? [
                                                          {
                                                              label: t("resolveAction"),
                                                              icon: Wrench,
                                                              onClick: () =>
                                                                  navigate(`/returns/resolve/${ro.id}`),
                                                          },
                                                      ]
                                                    : []),
                                                ...(isOpen
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
                                                                      runAction(ro.id, "cancel", t("cancelSuccess"));
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
                                                                          resource: "return-orders",
                                                                          id: ro.id,
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
