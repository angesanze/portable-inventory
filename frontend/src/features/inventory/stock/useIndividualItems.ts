import { useState, useMemo, useCallback } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import { useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useTableSelection } from "../../../hooks/useTableSelection";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { fetchAllPages } from "../../../utils/fetchAllPages";
import { STOCK_EXPORT_COLUMNS, STOCK_EXPORT_FILENAME } from "./exportColumns";
import type { PhysicalProductRow } from "./types";

// ── Individual Items tab: data fetching, filters, selection & mutations ─

export interface IndividualItemsFilters {
    identifier: string;
    product_model: string;
    status: string;
    location: string;
}

export function useIndividualItems() {
    const [filters, setFilters] = useState<IndividualItemsFilters>({
        identifier: "",
        product_model: "",
        status: "",
        location: "",
    });

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

    const { data: listData, isLoading, isError, refetch } = useList<PhysicalProductRow>({
        resource: "physical-products",
        filters: crudFilters,
    });

    const { data: productsCheck } = useList<{ id: string }>({
        resource: "product-models",
        pagination: { pageSize: 1 },
    });
    const hasProducts = (productsCheck?.data?.length ?? 0) > 0;

    const { mutate: deleteItem } = useDelete();
    const { mutateAsync: bulkDelete } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const items: PhysicalProductRow[] = listData?.data ?? [];

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
            const all = await fetchAllPages<PhysicalProductRow>(
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
                .filter((it) => selection.selectedIds.has(it.id))
                .map((it) => ({
                    id: String(it.id),
                    label: it.identifier || String(it.id),
                })),
        [items, selection.selectedIds],
    );

    return {
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
    };
}
