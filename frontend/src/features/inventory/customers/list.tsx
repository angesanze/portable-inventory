import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import { Edit2, Trash2, Plus, MoreVertical, Users, Download } from "lucide-react";
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
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { BulkActionsBar } from "../../../components/ui/BulkActionsBar";
import { BulkDeleteModal } from "../../../components/ui/BulkDeleteModal";
import { DropdownMenu } from "../../../components/ui/DropdownMenu";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useTableSelection } from "../../../hooks/useTableSelection";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { fetchAllPages } from "../../../utils/fetchAllPages";
import {
    CUSTOMER_EXPORT_COLUMNS,
    CUSTOMER_EXPORT_FILENAME,
    type CustomerExportRow,
} from "./exportColumns";
import type { CustomerRow } from "./types";

export const CustomerList = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const [search, setSearch] = useState("");

    const updateSearch = useCallback((_key: string, value: string) => {
        setSearch(value);
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (search) {
            result.push({ field: "search", operator: "contains", value: search });
        }
        return result;
    }, [search]);

    const { data: listData, isLoading, isError, refetch } = useList<CustomerRow>({
        resource: "customers",
        filters: crudFilters,
        sorters: [{ field: "name", order: "asc" }],
    });

    const navigate = useNavigate();
    const { mutate: deleteCustomer } = useDelete();
    const { mutateAsync: bulkDelete } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const customers: CustomerRow[] = Array.isArray(listData?.data) ? listData.data : [];

    const [exporting, setExporting] = useState(false);
    const exportAll = async () => {
        setExporting(true);
        try {
            const params: Record<string, string> = {};
            if (search) params.search = search;
            const all = await fetchAllPages<CustomerExportRow>(`${API_URL}/api/v1/customers/`, params);
            exportToExcel(all, CUSTOMER_EXPORT_COLUMNS, `${CUSTOMER_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const selection = useTableSelection(customers);
    const selectedItems = useMemo(
        () =>
            customers
                .filter((c) => selection.selectedIds.has(c.id))
                .map((c) => ({ id: String(c.id), label: c.name })),
        [customers, selection.selectedIds],
    );

    const filterConfigs: FilterConfig[] = [
        {
            key: "search",
            label: t("common:name"),
            type: "text",
            placeholder: t("customers.searchByName"),
            value: search,
            onChange: (v) => updateSearch("search", v),
        },
    ];

    return (
        <div>
            <PageHeader
                title={t("customers.title")}
                subtitle={t("customers.subtitle")}
                count={customers.length}
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
                        <Link to="/customers/create">
                            <Button variant="primary" icon={Plus}>
                                {t("customers.newCustomer")}
                            </Button>
                        </Link>
                    </>
                }
            />

            <FilterBar filters={filterConfigs} className="mb-4" />

            {isError ? (
                <ErrorState
                    title={t("customers.failedToLoad")}
                    message={t("customers.failedToLoadDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>{t("customers.nameColumn")}</TableHead>
                            <TableHead>{t("customers.vatNumber")}</TableHead>
                            <TableHead>{t("customers.contact")}</TableHead>
                            <TableHead>{t("customers.status")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={6} />
                    </TableBody>
                </Table>
            ) : customers.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title={t("customers.emptyTitle")}
                    description={t("customers.emptyDesc")}
                    actionLabel={t("customers.addCustomer")}
                    onAction={() => navigate("/customers/create")}
                />
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
                                        customers.filter((c) =>
                                            selection.selectedIds.has(c.id),
                                        ),
                                        CUSTOMER_EXPORT_COLUMNS,
                                        `${CUSTOMER_EXPORT_FILENAME}-selected.xlsx`,
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
                                <TableHead>{t("customers.nameColumn")}</TableHead>
                                <TableHead>{t("customers.vatNumber")}</TableHead>
                                <TableHead>{t("customers.contact")}</TableHead>
                                <TableHead>{t("customers.status")}</TableHead>
                                <TableHead className="text-right">{t("common:actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.map((c) => (
                                <TableRow
                                    key={c.id}
                                    className="cursor-pointer"
                                    onClick={() => navigate(`/customers/edit/${c.id}`)}
                                >
                                    <TableCell
                                        className="w-10"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Checkbox
                                            aria-label={t("common:selectRow", { name: c.name })}
                                            checked={selection.selectedIds.has(c.id)}
                                            onChange={() => selection.toggleOne(c.id)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium text-zinc-200">
                                        {c.name}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm font-mono">
                                        {c.vat_number || "—"}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {c.email || c.phone || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={c.is_active ? "emerald" : "neutral"}>
                                            {c.is_active ? t("customers.active") : t("customers.inactive")}
                                        </Badge>
                                    </TableCell>
                                    <TableCell
                                        className="text-right"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <DropdownMenu
                                            trigger={
                                                <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" aria-label={t("common:moreActions")}>
                                                    <MoreVertical size={16} />
                                                </button>
                                            }
                                            align="end"
                                            items={[
                                                {
                                                    label: t("common:edit"),
                                                    icon: Edit2,
                                                    onClick: () => navigate(`/customers/edit/${c.id}`),
                                                },
                                                { type: "divider" as const },
                                                {
                                                    label: t("common:delete"),
                                                    icon: Trash2,
                                                    danger: true,
                                                    onClick: async () => {
                                                        if (
                                                            await confirm({
                                                                title: t("customers.deleteTitle"),
                                                                message: t("customers.deleteConfirm"),
                                                                variant: "danger",
                                                                confirmLabel: t("common:delete"),
                                                            })
                                                        ) {
                                                            deleteCustomer({
                                                                resource: "customers",
                                                                id: c.id,
                                                            });
                                                        }
                                                    },
                                                },
                                            ]}
                                        />
                                    </TableCell>
                                </TableRow>
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
                cascadeLabel={t("customers.bulkDeleteKeepHistory")}
                cascadeDefault
                onConfirm={async (preserveCascade) => {
                    await bulkDelete({
                        url: `${API_URL}/api/v1/customers/bulk-delete/`,
                        method: "post",
                        values: {
                            ids: Array.from(selection.selectedIds),
                            preserve_movements: preserveCascade,
                        },
                        successNotification: () => ({
                            message: t("customers.bulkDeleteSuccess", {
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
