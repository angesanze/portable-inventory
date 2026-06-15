import { useCallback, useMemo, useState } from "react";

export interface UseTableSelectionResult {
    /** Set of currently selected row ids. */
    selectedIds: Set<string>;
    /** Flip selection for a single row. */
    toggleOne: (id: string) => void;
    /**
     * Header-checkbox handler. When every visible row is selected (or every
     * visible row plus extras carried over from a prior view), clear all.
     * Otherwise select every visible row.
     */
    toggleAll: () => void;
    /** True when every visible row is selected and at least one exists. */
    isAllSelected: boolean;
    /** True when some — but not all — visible rows are selected (tri-state). */
    isPartial: boolean;
    /** Drop every selection. */
    clear: () => void;
}

/**
 * Generic, resource-agnostic multi-select state for table rows.
 *
 * Caller passes the *currently visible* rows (after pagination + filtering);
 * `toggleAll` and the `isAllSelected`/`isPartial` flags are evaluated against
 * that view, so a partial selection on page 1 does not block selecting page 2.
 */
export const useTableSelection = (
    rows: ReadonlyArray<{ id: string }>,
): UseTableSelectionResult => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

    const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);

    const selectedVisibleCount = useMemo(
        () => visibleIds.reduce((n, id) => (selectedIds.has(id) ? n + 1 : n), 0),
        [visibleIds, selectedIds],
    );

    const isAllSelected =
        visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    const isPartial =
        selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;

    const toggleOne = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setSelectedIds((prev) => {
            const allSelected =
                visibleIds.length > 0 &&
                visibleIds.every((id) => prev.has(id));
            if (allSelected) {
                // Clear only the visible ids — preserve any out-of-view picks.
                const next = new Set(prev);
                for (const id of visibleIds) {
                    next.delete(id);
                }
                return next;
            }
            const next = new Set(prev);
            for (const id of visibleIds) {
                next.add(id);
            }
            return next;
        });
    }, [visibleIds]);

    const clear = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    return { selectedIds, toggleOne, toggleAll, isAllSelected, isPartial, clear };
};
