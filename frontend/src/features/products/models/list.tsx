import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Edit2, Trash2, Plus, MoreVertical, Package, Box, Tag, Hash, Download } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useNotification } from "@refinedev/core";
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
import { useCapabilities } from "../../../hooks/useCapabilities";
import { PROFILE_METADATA } from "../../../types/api";
import type { InventoryProfile } from "../../../types/api";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { fetchAllPages } from "../../../utils/fetchAllPages";
import { profileVariant } from "../../../utils/inventoryBadges";
import {
    PRODUCT_EXPORT_COLUMNS,
    PRODUCT_EXPORT_FILENAME,
    type ProductExportRow,
} from "./exportColumns";
import type { ProductModelRow, ProductStockSummary } from "../types";

/** Maps an inventory profile to its `products:profiles.*` translation key. */
const PROFILE_LABEL_KEYS: Record<InventoryProfile, string> = {
    SIMPLE_COUNT: "simpleCount",
    UNIT_CONVERSION: "unitConversion",
    DIMENSIONAL: "dimensional",
    BATCH_TRACKED: "batchTracked",
    PERISHABLE: "perishable",
    SERIALIZED: "serialized",
    ASSEMBLED: "assembled",
};

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

function profileLabel(model: ProductModelRow, t: TFunction): string {
    const key = PROFILE_LABEL_KEYS[model.profile as InventoryProfile];
    return key ? t(`products:profiles.${key}`) : t("products:unknownProfile");
}

function formatStockDisplay(
    stockSummary: ProductStockSummary | null | undefined,
    t: TFunction,
): { text: string; colorClass: string } {
    if (!stockSummary) return { text: "—", colorClass: "text-zinc-500" };

    const { total, tracking_mode, status, batch_count, unit } = stockSummary;
    const formattedTotal = Number(total).toLocaleString();

    let colorClass: string;
    if (status === "ZERO" || Number(total) <= 0) {
        colorClass = "text-zinc-500";
    } else if (status === "LOW") {
        colorClass = "text-amber-400";
    } else {
        colorClass = "text-emerald-400";
    }

    let text: string;
    if (tracking_mode === "INDIVIDUAL") {
        text = t("products:stockItems", { count: total, formatted: formattedTotal });
    } else if (tracking_mode === "BATCH" && batch_count != null) {
        text = t("products:stockInBatches", { count: batch_count, formatted: formattedTotal });
    } else {
        text = formattedTotal;
    }

    if (unit) {
        text = `${text} ${unit}`;
    }

    return { text, colorClass };
}

export const ProductModelList = () => {
    const { t } = useTranslation(["products", "common"]);
    // Cost columns are gated on the warehouse capability (COSTING-06).
    const { capabilities } = useCapabilities();
    const showCost = capabilities.manage_own_inventory;
    const [filters, setFilters] = useState<Record<string, string>>({
        name: "",
        profile: "",
    });

    const PROFILE_OPTIONS = useMemo(
        () =>
            Object.keys(PROFILE_METADATA).map((value) => ({
                label: t(`products:profiles.${PROFILE_LABEL_KEYS[value as InventoryProfile]}`),
                value,
            })),
        [t],
    );

    const updateFilter = useCallback((key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (filters.name) {
            result.push({ field: "search", operator: "contains", value: filters.name });
        }
        if (filters.profile) {
            result.push({ field: "profile", operator: "eq", value: filters.profile });
        }
        return result;
    }, [filters]);

    const { data: listData, isLoading, isError, refetch } = useList<ProductModelRow>({
        resource: "product-models",
        filters: crudFilters,
        sorters: [{ field: "name", order: "asc" }],
    });

    const navigate = useNavigate();
    const { open: notify } = useNotification();
    const { mutate: deleteModel } = useDelete();
    const { mutateAsync: bulkDelete } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const models: ProductModelRow[] = Array.isArray(listData?.data) ? listData.data : [];

    const [exporting, setExporting] = useState(false);
    // Export must cover the full filtered dataset, not the visible page —
    // `models` is one server page.
    const exportAll = async () => {
        setExporting(true);
        try {
            const params: Record<string, string> = {};
            if (filters.name) params.search = filters.name;
            if (filters.profile) params.profile = filters.profile;
            const all = await fetchAllPages<ProductExportRow>(`${API_URL}/api/v1/product-models/`, params);
            exportToExcel(all, PRODUCT_EXPORT_COLUMNS, `${PRODUCT_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const selection = useTableSelection(models);
    const selectedItems = useMemo(
        () =>
            models
                .filter((m) => selection.selectedIds.has(m.id))
                .map((m) => ({ id: String(m.id), label: m.name as string })),
        [models, selection.selectedIds],
    );

    const filterConfigs: FilterConfig[] = [
        {
            key: "name",
            label: t("common:name"),
            type: "text",
            placeholder: t("products:searchPlaceholder"),
            value: filters.name,
            onChange: (v) => updateFilter("name", v),
        },
        {
            key: "profile",
            label: t("products:profileColumn"),
            type: "select",
            options: PROFILE_OPTIONS,
            value: filters.profile,
            onChange: (v) => updateFilter("profile", v),
        },
    ];

    return (
        <div>
            <PageHeader
                title={t("products:productModels")}
                subtitle={t("products:subtitle")}
                count={models.length}
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
                        <Link to="/products/create">
                            <Button variant="primary" icon={Plus}>
                                {t("products:newProductModel")}
                            </Button>
                        </Link>
                    </>
                }
            />

            <FilterBar filters={filterConfigs} className="mb-4" />

            <DismissableHint id="products-list-intro" icon={Package} className="mb-4">
                {t("common:tip")}: {t("products:hint")}
            </DismissableHint>

            {isError ? (
                <ErrorState
                    title={t("products:loadError")}
                    message={t("products:loadErrorDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>{t("common:name")}</TableHead>
                            <TableHead>{t("products:sku")}</TableHead>
                            <TableHead>{t("products:profileColumn")}</TableHead>
                            <TableHead>{t("products:stockColumn")}</TableHead>
                            {showCost && (
                                <TableHead className="text-right">
                                    {t("products:avgCostColumn")}
                                </TableHead>
                            )}
                            {showCost && (
                                <TableHead className="text-right">
                                    {t("products:stockValueColumn")}
                                </TableHead>
                            )}
                            <TableHead>{t("common:created")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={showCost ? 9 : 7} />
                    </TableBody>
                </Table>
            ) : models.length === 0 ? (
                Object.values(filters).some((v) => v) ? (
                    <FilteredEmptyState />
                ) : (
                    <EmptyState
                        icon={Package}
                        title={t("products:emptyState.title")}
                        description={t("products:emptyState.description")}
                        helpItems={[
                            { icon: Box, text: t("products:emptyState.simpleCountHelp") },
                            { icon: Tag, text: t("products:emptyState.batchTrackedHelp") },
                            { icon: Hash, text: t("products:emptyState.serializedHelp") },
                        ]}
                        actionLabel={t("products:emptyState.createFirst")}
                        onAction={() => navigate("/products/create")}
                        secondaryActionLabel={t("products:emptyState.importCsv")}
                        onSecondaryAction={() => notify?.({ type: "progress", message: t("products:csvComingSoon"), description: t("products:csvComingSoonDesc") })}
                    />
                )
            ) : (
                <>
                    <BulkActionsBar
                        count={selection.selectedIds.size}
                        onClear={selection.clear}
                        actions={[
                            // Delete is gated on the role capability (GOVERNANCE-11):
                            // OPERATOR/VIEWER never see it, matching the backend 403.
                            ...(capabilities.delete_inventory
                                ? [{
                                      label: t("common:delete"),
                                      icon: Trash2,
                                      variant: "danger" as const,
                                      onClick: () => setBulkDeleteOpen(true),
                                  }]
                                : []),
                            {
                                label: t("common:bulkExportSelected"),
                                icon: Download,
                                onClick: () =>
                                    exportToExcel(
                                        models.filter((m) =>
                                            selection.selectedIds.has(m.id),
                                        ),
                                        PRODUCT_EXPORT_COLUMNS,
                                        `${PRODUCT_EXPORT_FILENAME}-selected.xlsx`,
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
                            <TableHead>{t("products:sku")}</TableHead>
                            <TableHead>{t("products:profileColumn")}</TableHead>
                            <TableHead>{t("products:stockColumn")}</TableHead>
                            {showCost && (
                                <TableHead className="text-right">
                                    {t("products:avgCostColumn")}
                                </TableHead>
                            )}
                            {showCost && (
                                <TableHead className="text-right">
                                    {t("products:stockValueColumn")}
                                </TableHead>
                            )}
                            <TableHead>{t("common:created")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {models.map((model) => (
                            <TableRow
                                key={model.id}
                                className="cursor-pointer"
                                onClick={() => navigate(`/products/${model.id}`)}
                            >
                                <TableCell
                                    className="w-10"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Checkbox
                                        aria-label={t("common:selectRow", {
                                            name: model.name,
                                        })}
                                        checked={selection.selectedIds.has(model.id)}
                                        onChange={() => selection.toggleOne(model.id)}
                                    />
                                </TableCell>
                                <TableCell className="font-medium text-zinc-200">
                                    {model.name}
                                </TableCell>
                                <TableCell className="text-zinc-400 font-mono text-sm">
                                    {model.sku}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={profileVariant(model.profile)}>
                                        {profileLabel(model, t)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-sm tabular-nums">
                                    {(() => {
                                        const { text, colorClass } = formatStockDisplay(model.stock_summary, t);
                                        return <span className={colorClass}>{text}</span>;
                                    })()}
                                </TableCell>
                                {showCost && (
                                    <TableCell className="text-right text-sm tabular-nums text-zinc-300">
                                        {model.stock_summary?.avg_unit_cost
                                            ? Number(model.stock_summary.avg_unit_cost).toFixed(2)
                                            : "—"}
                                    </TableCell>
                                )}
                                {showCost && (
                                    <TableCell className="text-right text-sm tabular-nums text-zinc-200 font-medium">
                                        {model.stock_summary?.stock_value
                                            ? Number(model.stock_summary.stock_value).toFixed(2)
                                            : "—"}
                                    </TableCell>
                                )}
                                <TableCell className="text-zinc-400 text-sm">
                                    {model.created_at
                                        ? formatRelativeTime(model.created_at, t)
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
                                                label: t("common:edit"),
                                                icon: Edit2,
                                                onClick: () =>
                                                    navigate(`/products/edit/${model.id}`),
                                            },
                                            ...(capabilities.delete_inventory
                                                ? [
                                                    { type: "divider" as const },
                                                    {
                                                        label: t("common:delete"),
                                                        icon: Trash2,
                                                        danger: true,
                                                        onClick: async () => {
                                                            if (
                                                                await confirm({
                                                                    title: t("products:deleteModelTitle"),
                                                                    message: t("products:deleteModelConfirm"),
                                                                    variant: "danger" as const,
                                                                    confirmLabel: t("common:delete"),
                                                                })
                                                            ) {
                                                                deleteModel({
                                                                    resource: "product-models",
                                                                    id: model.id,
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
                </>
            )}

            <ConfirmDialog {...dialogProps} />
            <BulkDeleteModal
                open={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                items={selectedItems}
                cascadeLabel={t("products:bulkDeleteKeepHistory")}
                cascadeDefault
                onConfirm={async (preserveCascade) => {
                    await bulkDelete({
                        url: `${API_URL}/api/v1/product-models/bulk-delete/`,
                        method: "post",
                        values: {
                            ids: Array.from(selection.selectedIds),
                            preserve_movements: preserveCascade,
                        },
                        successNotification: () => ({
                            message: t("products:bulkDeleteSuccess", {
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
