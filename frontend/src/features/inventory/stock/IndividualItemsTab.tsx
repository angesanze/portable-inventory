import {
    Eye, Edit2, Trash2, ArrowRightLeft, MoreVertical,
    Package, Layers, MapPin, Download,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import {
    itemStatusVariant as statusVariant,
    itemStatusLabel as statusLabel,
} from "../../../utils/inventoryBadges";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { BulkActionsBar } from "../../../components/ui/BulkActionsBar";
import { BulkDeleteModal } from "../../../components/ui/BulkDeleteModal";
import { DropdownMenu } from "../../../components/ui/DropdownMenu";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState, FilteredEmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { STOCK_EXPORT_COLUMNS, STOCK_EXPORT_FILENAME } from "./exportColumns";
import { statusOptions, formatRelativeTime } from "./helpers";
import { useIndividualItems } from "./useIndividualItems";

// ── Individual Items Tab (existing PhysicalProduct list) ───────────────

export const IndividualItemsTab = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const navigate = useNavigate();
    const {
        filters,
        updateFilter,
        items,
        isLoading,
        isError,
        refetch,
        hasProducts,
        deleteItem,
        bulkDelete,
        confirm,
        dialogProps,
        bulkDeleteOpen,
        setBulkDeleteOpen,
        exporting,
        exportAll,
        selection,
        selectedItems,
    } = useIndividualItems();

    const filterConfigs: FilterConfig[] = [
        {
            key: "identifier",
            label: t("stock.identifierSn"),
            type: "text",
            placeholder: t("stock.searchIdentifier"),
            value: filters.identifier,
            onChange: (v) => updateFilter("identifier", v),
        },
        {
            key: "product_model",
            label: t("stock.productModel"),
            type: "text",
            placeholder: t("stock.filterByProduct"),
            value: filters.product_model,
            onChange: (v) => updateFilter("product_model", v),
        },
        {
            key: "status",
            label: t("common:status"),
            type: "select",
            options: statusOptions(t),
            value: filters.status,
            onChange: (v) => updateFilter("status", v),
        },
        {
            key: "location",
            label: t("stock.location"),
            type: "text",
            placeholder: t("stock.filterByLocation"),
            value: filters.location,
            onChange: (v) => updateFilter("location", v),
        },
    ];

    return (
        <>
            <div className="flex justify-end mb-3">
                <Button
                    variant="secondary"
                    icon={Download}
                    disabled={isLoading || exporting}
                    onClick={exportAll}
                >
                    {t("common:downloadExcel")}
                </Button>
            </div>
            <FilterBar filters={filterConfigs} className="mb-4" />

            {isError ? (
                <ErrorState
                    title={t("stock.failedToLoadStock")}
                    message={t("stock.failedToLoadStockDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>{t("stock.identifierName")}</TableHead>
                            <TableHead>{t("stock.productModel")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead>{t("stock.location")}</TableHead>
                            <TableHead>{t("stock.batch")}</TableHead>
                            <TableHead>{t("common:updated")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={8} />
                    </TableBody>
                </Table>
            ) : items.length === 0 ? (
                Object.values(filters).some((v) => v) ? (
                    <FilteredEmptyState />
                ) : (
                    <EmptyState
                        icon={Package}
                        title={t("stock.emptyTitle")}
                        description={t("stock.emptyDesc")}
                        helpItems={[
                            { icon: Layers, text: t("stock.productsDefine") },
                            { icon: MapPin, text: t("stock.stockRepresents") },
                        ]}
                        actionLabel={hasProducts ? t("stock.registerStockItem") : t("stock.createProductFirst")}
                        onAction={() => navigate(hasProducts ? "/stock/create" : "/products/create")}
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
                                        items.filter((it) =>
                                            selection.selectedIds.has(it.id),
                                        ),
                                        STOCK_EXPORT_COLUMNS,
                                        `${STOCK_EXPORT_FILENAME}-selected.xlsx`,
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
                            <TableHead>{t("stock.identifierName")}</TableHead>
                            <TableHead>{t("stock.productModel")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead>{t("stock.location")}</TableHead>
                            <TableHead>{t("stock.batch")}</TableHead>
                            <TableHead>{t("common:updated")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow
                                key={item.id}
                                className="cursor-pointer"
                                onClick={() => navigate(`/stock/${item.id}`)}
                            >
                                <TableCell
                                    className="w-10"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Checkbox
                                        aria-label={t("common:selectRow", {
                                            name: item.identifier,
                                        })}
                                        checked={selection.selectedIds.has(item.id)}
                                        onChange={() => selection.toggleOne(item.id)}
                                    />
                                </TableCell>
                                <TableCell className="font-medium text-zinc-200">
                                    <span className="font-mono">{item.identifier}</span>
                                </TableCell>
                                <TableCell className="text-zinc-400">
                                    {item.product_model_name || t("stock.unknownModel")}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={statusVariant(item.status)} dot>
                                        {statusLabel(item.status, t)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-zinc-400">
                                    {item.location_name || t("stock.notAssigned")}
                                </TableCell>
                                <TableCell className="text-zinc-400 font-mono text-sm">
                                    {item.batch_identifier
                                        ? <>
                                            {item.batch_identifier}
                                            {item.quantity != null && (
                                                <span className="ml-1 text-zinc-500">
                                                    (×{item.quantity})
                                                </span>
                                            )}
                                          </>
                                        : "—"}
                                </TableCell>
                                <TableCell className="text-zinc-400 text-sm">
                                    {item.updated_at
                                        ? formatRelativeTime(item.updated_at, t)
                                        : "—"}
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
                                                label: t("stock.view"),
                                                icon: Eye,
                                                onClick: () => navigate(`/stock/${item.id}`),
                                            },
                                            {
                                                label: t("stock.editStatus"),
                                                icon: Edit2,
                                                onClick: () => navigate(`/stock/edit/${item.id}`),
                                            },
                                            {
                                                label: t("stock.transfer"),
                                                icon: ArrowRightLeft,
                                                onClick: () => navigate(`/stock/edit/${item.id}`),
                                            },
                                            { type: "divider" as const },
                                            {
                                                label: t("common:delete"),
                                                icon: Trash2,
                                                danger: true,
                                                onClick: async () => {
                                                    if (
                                                        await confirm({
                                                            title: t("stock.deleteItemTitle"),
                                                            message: t("stock.deleteItemConfirm"),
                                                            variant: "danger",
                                                            confirmLabel: t("common:delete"),
                                                        })
                                                    ) {
                                                        deleteItem({
                                                            resource: "physical-products",
                                                            id: item.id,
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
                cascadeLabel={t("stock.bulkDeleteKeepHistory")}
                cascadeDefault
                onConfirm={async (preserveCascade) => {
                    await bulkDelete({
                        url: `${API_URL}/api/v1/physical-products/bulk-delete/`,
                        method: "post",
                        values: {
                            ids: Array.from(selection.selectedIds),
                            preserve_movements: preserveCascade,
                        },
                        successNotification: () => ({
                            message: t("stock.bulkDeleteSuccess", {
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
        </>
    );
};
