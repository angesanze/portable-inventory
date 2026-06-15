import { useMemo } from 'react';
import type { PhysicalProduct } from "../../../types/inventory";

type StockStatus = {
    color: "success" | "warning" | "error" | "default";
    label: string;
};

export const useStockStatus = (status: PhysicalProduct['status']): StockStatus => {
    return useMemo(() => {
        const s = status as string;
        switch (s) {
            case "ACTIVE":
                return { color: "success", label: "Active" };
            case "IN_TRANSIT":
                return { color: "warning", label: "In Transit" };
            case "CONSUMED":
                return { color: "default", label: "Consumed" };
            case "LOST":
                return { color: "error", label: "Lost" };
            case "DAMAGED":
                return { color: "error", label: "Damaged" };
            default:
                return { color: "default", label: s || "Unknown" };
        }
    }, [status]);
};
