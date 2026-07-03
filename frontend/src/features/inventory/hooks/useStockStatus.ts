import { useMemo } from 'react';
import type { PhysicalProduct } from "../../../types/inventory";

type StockStatus = {
    color: "success" | "warning" | "error" | "default";
    label: string;
};

export const useStockStatus = (status: PhysicalProduct['status']): StockStatus => {
    return useMemo(() => {
        const s = status as string;
        // Mirror PhysicalProduct.STATUS_CHOICES (models/tracking.py) plus the
        // DAMAGED preset used by the stock forms — previously this listed
        // statuses the backend never emits (IN_TRANSIT/CONSUMED/LOST), so real
        // ones (IN_USE/RETURNED/RECALL/EXPIRED/DISPOSED) rendered as grey (FE-11).
        switch (s) {
            case "ACTIVE":
                return { color: "success", label: "Active" };
            case "IN_USE":
                return { color: "warning", label: "In Use" };
            case "RETURNED":
                return { color: "warning", label: "Returned" };
            case "RECALL":
                return { color: "error", label: "Recall" };
            case "EXPIRED":
                return { color: "error", label: "Expired" };
            case "DISPOSED":
                return { color: "default", label: "Disposed" };
            case "DAMAGED":
                return { color: "error", label: "Damaged" };
            default:
                // Custom tracker-preset statuses (e.g. BROKEN/REPAIRED) land here —
                // show the raw value rather than a misleading fixed label.
                return { color: "default", label: s || "Unknown" };
        }
    }, [status]);
};
