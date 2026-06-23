import { useState, useCallback, useMemo } from "react";
import { useList } from "@refinedev/core";
import type { ProductStockRow } from "./types";

// ── All Products tab: data fetching, filtering & KPI derivation ────────

export interface AllProductsFilters {
    name: string;
    profile: string;
}

export function useAllProducts() {
    const [filters, setFilters] = useState<AllProductsFilters>({
        name: "",
        profile: "",
    });

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

    return {
        filters,
        updateFilter,
        isLoading,
        isError,
        refetch,
        allProducts,
        productsWithStock,
        locationsWithInventory,
        zeroStockCount,
    };
}
