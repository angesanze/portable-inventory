import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import { Edit2, Trash2, Plus, MoreVertical, Truck, Download } from "lucide-react";
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
    SUPPLIER_EXPORT_COLUMNS,
    SUPPLIER_EXPORT_FILENAME,
    type SupplierExportRow,
} from "./exportColumns";
import type { SupplierRow } from "./types";

export const SupplierList = () => {
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

    const { data: listData, isLoading, isError, refetch } = useList<SupplierRow>({
        resource: "suppliers",
        filters: crudFilters,
        sorters: [{ field: "name", order: "asc" }],
    });

    const navigate = useNavigate();
    const { mutate: deleteSupplier } = useDelete();
    const { mutateAsync: bulkDelete } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const suppliers: SupplierRow[] = Array.isArray(listData?.data) ? listData.data : [];

    const [exporting, setExporting] = useState(false);
    // Export must cover the full filtered dataset, not the visible page —
    // `suppliers` is one server page.
    const exportAll = async () => {
        setExporting(true);
        try {
            const params: Record<string, string> = {};
            if (search) params.search = search;
            const all = await fetchAllPages<SupplierExportRow>(`${API_URL}/api/v1/suppliers/`, params);
            exportToExcel(all, SUPPLIER_EXPORT_COLUMNS, `${SUPPLIER_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const selection = useTableSelection(suppliers);
    const selectedItems = useMemo(
        () =>
            suppliers
                .filter((s) => selection.selectedIds.has(s.id))
                .map((s) => ({ id: String(s.id), label: s.name })),
        [suppliers, selection.selectedIds],
    );

    const filterConfigs: FilterConfig[] = [
        {
            key: "search",
            label: t("common:name"),
            type: "text",
            placeholder: t("suppliers.searchByName"),
            value: search,
            onChange: (v) => updateSearch("search", v),
        },
    ];

    return (
        <div>
            <PageHeader
                title={t("suppliers.title")}
                subtitle={t("suppliers.subtitle")}
                count={suppliers.length}
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
                        <Link to="/suppliers/create">
                            <Button variant="primary" icon={Plus}>
                                {t("suppliers.newSupplier")}
                            </Button>
                        </Link>
                    </>
                }
            />

            <FilterBar filters={filterConfigs} className="mb-4" />

            {isError ? (
                <ErrorState
                    title={t("suppliers.failedToLoad")}
                    message={t("suppliers.failedToLoadDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>{t("suppliers.nameColumn")}</TableHead>
                            <TableHead>{t("suppliers.vatNumber")}</TableHead>
                            <TableHead>{t("suppliers.contact")}</TableHead>
                            <TableHead>{t("suppliers.status")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={6} />
                    </TableBody>
                </Table>
            ) : suppliers.length === 0 ? (
                <EmptyState
                    icon={Truck}
                    title={t("suppliers.emptyTitle")}
                    description={t("suppliers.emptyDesc")}
                    actionLabel={t("suppliers.addSupplier")}
                    onAction={() => navigate("/suppliers/create")}
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
                                        suppliers.filter((s) =>
                                            selection.selectedIds.has(s.id),
                                        ),
                                        SUPPLIER_EXPORT_COLUMNS,
                                        `${SUPPLIER_EXPORT_FILENAME}-selected.xlsx`,
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
                                <TableHead>{t("suppliers.nameColumn")}</TableHead>
                                <TableHead>{t("suppliers.vatNumber")}</TableHead>
                                <TableHead>{t("suppliers.contact")}</TableHead>
                                <TableHead>{t("suppliers.status")}</TableHead>
                                <TableHead className="text-right">{t("common:actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {suppliers.map((s) => (
                                <TableRow
                                    key={s.id}
                                    className="cursor-pointer"
                                    onClick={() => navigate(`/suppliers/edit/${s.id}`)}
                                >
                                    <TableCell
                                        className="w-10"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Checkbox
                                            aria-label={t("common:selectRow", { name: s.name })}
                                            checked={selection.selectedIds.has(s.id)}
                                            onChange={() => selection.toggleOne(s.id)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium text-zinc-200">
                                        {s.name}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm font-mono">
                                        {s.vat_number || "—"}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {s.email || s.phone || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={s.is_active ? "emerald" : "neutral"}>
                                            {s.is_active ? t("suppliers.active") : t("suppliers.inactive")}
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
                                                    onClick: () => navigate(`/suppliers/edit/${s.id}`),
                                                },
                                                { type: "divider" as const },
                                                {
                                                    label: t("common:delete"),
                                                    icon: Trash2,
                                                    danger: true,
                                                    onClick: async () => {
                                                        if (
                                                            await confirm({
                                                                title: t("suppliers.deleteTitle"),
                                                                message: t("suppliers.deleteConfirm"),
                                                                variant: "danger",
                                                                confirmLabel: t("common:delete"),
                                                            })
                                                        ) {
                                                            deleteSupplier({
                                                                resource: "suppliers",
                                                                id: s.id,
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
                cascadeLabel={t("suppliers.bulkDeleteKeepHistory")}
                cascadeDefault
                onConfirm={async (preserveCascade) => {
                    await bulkDelete({
                        url: `${API_URL}/api/v1/suppliers/bulk-delete/`,
                        method: "post",
                        values: {
                            ids: Array.from(selection.selectedIds),
                            preserve_movements: preserveCascade,
                        },
                        successNotification: () => ({
                            message: t("suppliers.bulkDeleteSuccess", {
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
