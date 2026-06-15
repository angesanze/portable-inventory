import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustom, useApiUrl, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import {
    Eye, Edit2, Trash2, ArrowRightLeft, Plus, MoreVertical,
    Package, Layers, MapPin, ChevronUp, ChevronDown,
    BarChart3, AlertTriangle, Boxes, Download,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { PhysicalProduct } from "../../../types/inventory";
import type { InventoryProfile } from "../../../types/api";
import { PROFILE_METADATA } from "../../../types/api";
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
import {
    itemStatusVariant as statusVariant,
    itemStatusLabel as statusLabel,
    profileVariant,
} from "../../../utils/inventoryBadges";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Checkbox } from "../../../components/ui/Checkbox";
import { BulkActionsBar } from "../../../components/ui/BulkActionsBar";
import { BulkDeleteModal } from "../../../components/ui/BulkDeleteModal";
import { DropdownMenu } from "../../../components/ui/DropdownMenu";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState, FilteredEmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { StatCard } from "../../../components/dashboard/StatCard";
import { useTableSelection } from "../../../hooks/useTableSelection";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { fetchAllPages } from "../../../utils/fetchAllPages";
import { STOCK_EXPORT_COLUMNS, STOCK_EXPORT_FILENAME } from "./exportColumns";

// ── Types ──────────────────────────────────────────────────────────────

interface ProductStockRow {
    id: string;
    name: string;
    sku: string;
    profile: InventoryProfile;
    engine_type: string;
    tracking_mode: string;
    stock_value: any;
    stock_total: number;
    stock_breakdown: Record<string, number>;
    unit?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────

function statusOptions(t: TFunction) {
    return [
        { label: t("stock.statusActive"), value: "ACTIVE" },
        { label: t("stock.statusInUse"), value: "IN_USE" },
        { label: t("stock.statusReturned"), value: "RETURNED" },
        { label: t("stock.statusDisposed"), value: "DISPOSED" },
    ];
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

function stockStatusIndicator(total: number, t: TFunction): { color: string; label: string } {
    if (total <= 0) return { color: "text-rose-400", label: t("stock.outOfStock") };
    return { color: "text-emerald-400", label: t("stock.inStock") };
}

function formatStockDisplay(row: ProductStockRow, t: TFunction): string {
    const total = row.stock_total;
    let text: string;
    if (row.tracking_mode === "INDIVIDUAL") {
        text = t("stock.itemCount", { count: total });
    } else if (row.tracking_mode === "BATCH") {
        const batchCount = Array.isArray(row.stock_value) ? row.stock_value.length : 0;
        if (batchCount > 0) {
            text = t("stock.inBatches", { total: Number(total).toLocaleString(), count: batchCount });
        } else {
            text = Number(total).toLocaleString();
        }
    } else {
        text = Number(total).toLocaleString();
    }
    return row.unit ? `${text} ${row.unit}` : text;
}

function getPrimaryLocation(row: ProductStockRow): string {
    const breakdown = row.stock_breakdown;
    if (!breakdown || Object.keys(breakdown).length === 0) return "—";
    const sorted = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
    return sorted[0][0];
}

// ── Expanded Row (per-location breakdown) ──────────────────────────────

const ProductExpandedRow = ({ product }: { product: ProductStockRow }) => {
    const { t } = useTranslation(["inventory", "common"]);
    const breakdown = product.stock_breakdown;
    const entries = Object.entries(breakdown).sort(([, a], [, b]) => b - a);

    if (entries.length === 0) {
        return (
            <div className="p-4 text-center text-zinc-500 italic">
                {t("stock.noStockAnyLocation")}
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/50 p-4 border-t border-indigo-500/20">
            <h4 className="text-xs font-medium text-indigo-400 uppercase mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                {t("stock.perLocationBreakdown")}
            </h4>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("stock.location")}</TableHead>
                        <TableHead className="text-right">{t("stock.quantity")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {entries.map(([locName, qty]) => (
                        <TableRow key={locName}>
                            <TableCell className="text-zinc-200">
                                <span className="flex items-center gap-2">
                                    <MapPin size={14} className="text-zinc-500" />
                                    {locName}
                                </span>
                            </TableCell>
                            <TableCell className="text-right text-indigo-300 font-semibold">
                                {Number(qty).toLocaleString()}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {product.tracking_mode === "BATCH" && Array.isArray(product.stock_value) && product.stock_value.length > 0 && (
                <div className="mt-4">
                    <h4 className="text-xs font-medium text-cyan-400 uppercase mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-500" />
                        {t("stock.batchDetails")}
                    </h4>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("stock.batchId")}</TableHead>
                                <TableHead>{t("stock.location")}</TableHead>
                                <TableHead className="text-right">{t("stock.quantity")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {product.stock_value.map((batch: any) => (
                                <TableRow key={batch.id}>
                                    <TableCell className="text-zinc-200 font-mono text-sm">
                                        {batch.batch_identifier}
                                    </TableCell>
                                    <TableCell className="text-zinc-400">
                                        {batch.location || "—"}
                                    </TableCell>
                                    <TableCell className="text-right text-cyan-300 font-semibold">
                                        {batch.qty}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {product.tracking_mode === "INDIVIDUAL" && (
                <div className="mt-3">
                    <Link
                        to={`/stock?product=${product.id}`}
                        className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                        {t("stock.viewIndividualItems")} →
                    </Link>
                </div>
            )}
        </div>
    );
};

// ── Tab Button ─────────────────────────────────────────────────────────

const TabButton = ({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            active
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
        }`}
    >
        {children}
    </button>
);

// ── All Products Tab ───────────────────────────────────────────────────

const AllProductsTab = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({
        name: "",
        profile: "",
    });
    const navigate = useNavigate();

    const toggleRow = (id: string) => {
        setExpandedRowId(expandedRowId === id ? null : id);
    };

    const updateFilter = useCallback((key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    const { data: listData, isLoading, isError, refetch } = useList<ProductStockRow>({
        resource: "products-poly",
        pagination: { mode: "off" },
    });

    const allProducts: ProductStockRow[] = useMemo(() => {
        const raw = listData?.data ?? [];
        let filtered = raw;
        if (filters.name) {
            const q = filters.name.toLowerCase();
            filtered = filtered.filter(
                (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
            );
        }
        if (filters.profile) {
            filtered = filtered.filter((p) => p.profile === filters.profile);
        }
        return filtered;
    }, [listData, filters]);

    // KPI computations
    const productsWithStock = useMemo(
        () => allProducts.filter((p) => p.stock_total > 0).length,
        [allProducts],
    );
    const locationsWithInventory = useMemo(() => {
        const locs = new Set<string>();
        for (const p of allProducts) {
            for (const loc of Object.keys(p.stock_breakdown || {})) {
                locs.add(loc);
            }
        }
        return locs.size;
    }, [allProducts]);
    const zeroStockCount = useMemo(
        () => allProducts.filter((p) => p.stock_total <= 0).length,
        [allProducts],
    );

    const PROFILE_OPTIONS = useMemo(
        () =>
            Object.entries(PROFILE_METADATA).map(([value, meta]) => ({
                label: meta.label,
                value,
            })),
        [],
    );

    const filterConfigs: FilterConfig[] = [
        {
            key: "name",
            label: t("stock.nameSku"),
            type: "text",
            placeholder: t("stock.searchNameSku"),
            value: filters.name,
            onChange: (v) => updateFilter("name", v),
        },
        {
            key: "profile",
            label: t("stock.profile"),
            type: "select",
            options: PROFILE_OPTIONS,
            value: filters.profile,
            onChange: (v) => updateFilter("profile", v),
        },
    ];

    if (isError) {
        return (
            <ErrorState
                title={t("stock.failedToLoadInventory")}
                message={t("stock.failedToLoadInventoryDesc")}
                onRetry={refetch}
            />
        );
    }

    return (
        <>
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <StatCard
                    title={t("stock.productsInStock")}
                    value={isLoading ? "—" : productsWithStock}
                    icon={<Package className="w-4 h-4" />}
                    iconColor="bg-emerald-500/15 text-emerald-400"
                    isLoading={isLoading}
                />
                <StatCard
                    title={t("stock.activeLocations")}
                    value={isLoading ? "—" : locationsWithInventory}
                    icon={<MapPin className="w-4 h-4" />}
                    iconColor="bg-cyan-500/15 text-cyan-400"
                    isLoading={isLoading}
                />
                <StatCard
                    title={t("stock.zeroStock")}
                    value={isLoading ? "—" : zeroStockCount}
                    icon={<AlertTriangle className="w-4 h-4" />}
                    iconColor={zeroStockCount > 0 ? "bg-amber-500/15 text-amber-400" : "bg-zinc-500/15 text-zinc-400"}
                    isLoading={isLoading}
                />
            </div>

            <FilterBar filters={filterConfigs} className="mb-4" />

            {isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("stock.product")}</TableHead>
                            <TableHead>{t("stock.sku")}</TableHead>
                            <TableHead>{t("stock.profile")}</TableHead>
                            <TableHead className="text-right">{t("stock.totalStock")}</TableHead>
                            <TableHead>{t("stock.primaryLocation")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead className="text-right w-12" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={7} />
                    </TableBody>
                </Table>
            ) : allProducts.length === 0 ? (
                Object.values(filters).some((v) => v) ? (
                    <FilteredEmptyState />
                ) : (
                    <EmptyState
                        icon={Boxes}
                        title={t("stock.noProductsTitle")}
                        description={t("stock.noProductsDesc")}
                        helpItems={[
                            { icon: Package, text: t("stock.productsDefineProfile") },
                            { icon: Layers, text: t("stock.stockLevelsCalculated") },
                        ]}
                        actionLabel={t("stock.createProduct")}
                        onAction={() => navigate("/products/create")}
                    />
                )
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("stock.product")}</TableHead>
                            <TableHead>{t("stock.sku")}</TableHead>
                            <TableHead>{t("stock.profile")}</TableHead>
                            <TableHead className="text-right">{t("stock.totalStock")}</TableHead>
                            <TableHead>{t("stock.primaryLocation")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead className="text-right w-12" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {allProducts.map((product) => {
                            const indicator = stockStatusIndicator(product.stock_total, t);
                            const isExpanded = expandedRowId === product.id;
                            return (
                                <React.Fragment key={product.id}>
                                    <TableRow
                                        className={`cursor-pointer ${isExpanded ? "bg-white/[0.03]" : ""}`}
                                        onClick={() => navigate(`/products/${product.id}`)}
                                    >
                                        <TableCell className="font-medium text-zinc-200">
                                            {product.name}
                                        </TableCell>
                                        <TableCell className="text-zinc-400 font-mono text-sm">
                                            {product.sku}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={profileVariant(product.profile)}>
                                                {PROFILE_METADATA[product.profile]?.label ?? product.profile}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-zinc-200">
                                            {formatStockDisplay(product, t)}
                                        </TableCell>
                                        <TableCell className="text-zinc-400">
                                            {getPrimaryLocation(product)}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`flex items-center gap-1.5 text-sm ${indicator.color}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                    product.stock_total > 0 ? "bg-emerald-400" : "bg-rose-400"
                                                }`} />
                                                {indicator.label}
                                            </span>
                                        </TableCell>
                                        <TableCell
                                            className="text-right"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                onClick={() => toggleRow(product.id)}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    isExpanded
                                                        ? "text-indigo-400 bg-indigo-500/10"
                                                        : "text-zinc-400 hover:text-white hover:bg-white/10"
                                                }`}
                                                title={isExpanded ? t("stock.collapse") : t("stock.expandLocations")}
                                                aria-label={isExpanded ? t("stock.collapseLocations") : t("stock.expandLocations")}
                                            >
                                                {isExpanded ? <ChevronUp size={16} /> : <Eye size={16} />}
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                    {isExpanded && (
                                        <TableRow
                                            className="bg-zinc-900/50 hover:bg-zinc-900/50"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <TableCell colSpan={7} className="p-0">
                                                <ProductExpandedRow product={product} />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </>
    );
};

// ── Individual Items Tab (existing PhysicalProduct list) ───────────────

const IndividualItemsTab = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const [filters, setFilters] = useState<Record<string, string>>({
        identifier: "",
        product_model: "",
        status: "",
        location: "",
    });
    const navigate = useNavigate();

    const updateFilter = useCallback((key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        const searchTerms = [filters.identifier, filters.product_model].filter(Boolean).join(" ");
        if (searchTerms) {
            result.push({ field: "search", operator: "contains", value: searchTerms });
        }
        if (filters.status) {
            result.push({ field: "status", operator: "eq", value: filters.status });
        }
        if (filters.location) {
            result.push({ field: "location", operator: "contains", value: filters.location });
        }
        return result;
    }, [filters]);

    const { data: listData, isLoading, isError, refetch } = useList<PhysicalProduct>({
        resource: "physical-products",
        filters: crudFilters,
    });

    const { data: productsCheck } = useList({
        resource: "product-models",
        pagination: { pageSize: 1 },
    }) as any;
    const hasProducts = (productsCheck?.data?.length ?? 0) > 0;

    const { mutate: deleteItem } = useDelete();
    const { mutateAsync: bulkDelete } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const items = listData?.data ?? [];

    const [exporting, setExporting] = useState(false);
    // Export must cover the full filtered dataset, not the visible page —
    // `items` is one server page.
    const exportAll = async () => {
        setExporting(true);
        try {
            const params: Record<string, string> = {};
            const searchTerms = [filters.identifier, filters.product_model].filter(Boolean).join(" ");
            if (searchTerms) params.search = searchTerms;
            if (filters.status) params.status = filters.status;
            if (filters.location) params.search = params.search
                ? `${params.search} ${filters.location}`
                : filters.location;
            const all = await fetchAllPages<PhysicalProduct>(
                `${API_URL}/api/v1/physical-products/`,
                params,
            );
            exportToExcel(all, STOCK_EXPORT_COLUMNS, `${STOCK_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const selection = useTableSelection(items);
    const selectedItems = useMemo(
        () =>
            items
                .filter((it: PhysicalProduct) => selection.selectedIds.has(it.id))
                .map((it: PhysicalProduct) => ({
                    id: String(it.id),
                    label: (it.identifier as string) || String(it.id),
                })),
        [items, selection.selectedIds],
    );

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
                                        items.filter((it: any) =>
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
                        {items.map((item: PhysicalProduct) => (
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
                                    {(item as any).batch_identifier
                                        ? <>
                                            {(item as any).batch_identifier}
                                            {(item as any).quantity != null && (
                                                <span className="ml-1 text-zinc-500">
                                                    (×{(item as any).quantity})
                                                </span>
                                            )}
                                          </>
                                        : "—"}
                                </TableCell>
                                <TableCell className="text-zinc-400 text-sm">
                                    {(item as any).updated_at
                                        ? formatRelativeTime((item as any).updated_at, t)
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

// ── Main Export ─────────────────────────────────────────────────────────

export const PhysicalProductList = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const [activeTab, setActiveTab] = useState<"all" | "items">("all");

    return (
        <div>
            <PageHeader
                title={t("stock.title")}
                subtitle={t("stock.subtitle")}
                actions={
                    <Link to="/stock/create">
                        <Button variant="primary" icon={Plus}>
                            {t("stock.registerItem")}
                        </Button>
                    </Link>
                }
            />

            {/* Tab switcher */}
            <div className="flex items-center gap-2 mb-6">
                <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
                    {t("stock.allProducts")}
                </TabButton>
                <TabButton active={activeTab === "items"} onClick={() => setActiveTab("items")}>
                    {t("stock.individualItems")}
                </TabButton>
            </div>

            {activeTab === "all" ? <AllProductsTab /> : <IndividualItemsTab />}
        </div>
    );
};
