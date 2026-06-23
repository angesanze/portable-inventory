import { useState, useMemo } from "react";
import {
    Eye, Package, Layers, MapPin, ChevronUp, AlertTriangle, Boxes,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import React from "react";
import { useTranslation } from "react-i18next";
import { PROFILE_METADATA } from "../../../types/api";
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
import { profileVariant } from "../../../utils/inventoryBadges";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState, FilteredEmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { StatCard } from "../../../components/dashboard/StatCard";
import { stockStatusIndicator, formatStockDisplay, getPrimaryLocation } from "./helpers";
import { ProductExpandedRow } from "./ProductExpandedRow";
import { useAllProducts } from "./useAllProducts";

// ── All Products Tab ───────────────────────────────────────────────────

export const AllProductsTab = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const navigate = useNavigate();
    const {
        filters,
        updateFilter,
        isLoading,
        isError,
        refetch,
        allProducts,
        productsWithStock,
        locationsWithInventory,
        zeroStockCount,
    } = useAllProducts();

    const toggleRow = (id: string) => {
        setExpandedRowId(expandedRowId === id ? null : id);
    };

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
