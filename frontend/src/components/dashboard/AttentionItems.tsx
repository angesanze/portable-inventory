import { useList } from "@refinedev/core";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import {
    AlertTriangle,
    Clock,
    ClipboardList,
    CheckCircle2,
    ChevronRight,
    ArrowRight,
} from "lucide-react";

type AttentionItem = {
    id: string;
    icon: React.ReactNode;
    description: string;
    link: string;
};

/** Product-model row fields read for the low-stock alerts. */
interface ProductRow {
    id: string;
    name?: string;
    stock_status?: { status?: string; quantity?: number; threshold?: number };
}

/** Batch row fields read for the expiring-batch alerts. */
interface BatchRow {
    id: string;
    batch_identifier?: string;
    work_order?: string | null;
    product_model?: string;
    data?: { expiry_date?: string };
}

/** Work-order row fields read for the open-work-order alerts. */
interface WorkOrderRow {
    id: string;
    name?: string;
}

export const AttentionItems = () => {
    const navigate = useNavigate();
    const { t } = useTranslation("dashboard");

    // Low stock: fetch product models and filter for LOW status
    const { data: productsData, isLoading: isLoadingProducts } = useList<ProductRow>({
        resource: "product-models",
        pagination: { mode: "off" as const },
    });

    // Expiring batches: fetch batches, filter client-side for expiry within 30 days
    const { data: batchesData, isLoading: isLoadingBatches } = useList<BatchRow>({
        resource: "batches",
        pagination: { mode: "off" as const },
    });

    // Open work orders
    const { data: workOrdersData, isLoading: isLoadingWorkOrders } = useList<WorkOrderRow>({
        resource: "work-orders",
        filters: [{ field: "status", operator: "eq", value: "OPEN" }],
        sorters: [{ field: "created_at", order: "desc" }],
        pagination: { current: 1, pageSize: 10 },
    });

    // Movements count (for contextual suggestions in empty state)
    const { data: movementsData, isLoading: isLoadingMovements } = useList({
        resource: "movements",
        pagination: { pageSize: 1 },
    });

    const isLoading = isLoadingProducts || isLoadingBatches || isLoadingWorkOrders || isLoadingMovements;

    const items = useMemo<AttentionItem[]>(() => {
        const result: AttentionItem[] = [];

        // Low stock alerts
        if (productsData?.data) {
            for (const product of productsData.data) {
                if (product.stock_status?.status === "LOW") {
                    result.push({
                        id: `low-stock-${product.id}`,
                        icon: (
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                        ),
                        description: t("lowStock", {
                            name: product.name,
                            quantity: product.stock_status.quantity,
                            threshold: product.stock_status.threshold,
                        }),
                        link: `/restock?focus=${product.id}`,
                    });
                }
            }
        }

        // Expiring batches (within 30 days)
        if (batchesData?.data) {
            const now = new Date();
            const thirtyDaysFromNow = new Date(
                now.getTime() + 30 * 24 * 60 * 60 * 1000
            );

            for (const batch of batchesData.data) {
                const expiryStr = batch.data?.expiry_date;
                if (!expiryStr) continue;
                const expiryDate = new Date(expiryStr);
                if (expiryDate <= thirtyDaysFromNow && expiryDate >= now) {
                    const daysLeft = Math.ceil(
                        (expiryDate.getTime() - now.getTime()) /
                            (1000 * 60 * 60 * 24)
                    );
                    result.push({
                        id: `expiring-${batch.id}`,
                        icon: <Clock className="w-4 h-4 text-orange-400" />,
                        description: t("expiringBatch", {
                            identifier: batch.batch_identifier,
                            count: daysLeft,
                        }),
                        link: batch.work_order
                            ? `/work-orders/show/${batch.work_order}`
                            : `/product-models/show/${batch.product_model}`,
                    });
                }
            }
        }

        // Open work orders
        if (workOrdersData?.data) {
            for (const wo of workOrdersData.data) {
                result.push({
                    id: `wo-${wo.id}`,
                    icon: (
                        <ClipboardList className="w-4 h-4 text-indigo-400" />
                    ),
                    description: t("workOrderOpen", { name: wo.name }),
                    link: `/work-orders/show/${wo.id}`,
                });
            }
        }

        return result;
    }, [productsData, batchesData, workOrdersData, t]);

    const suggestions = useMemo(() => {
        if (items.length > 0) return [];

        const result: { text: string; link: string }[] = [];
        const productCount = productsData?.data?.length ?? 0;
        const movementCount = movementsData?.total ?? 0;

        if (productCount > 0 && movementCount === 0) {
            result.push({
                text: t("suggestStockCheck", { count: productCount }),
                link: "/movements/create",
            });
        } else if (productCount === 0) {
            result.push({
                text: t("suggestFirstProduct"),
                link: "/products/create",
            });
        }

        if (productCount > 0 && movementCount > 0 && (!workOrdersData?.data || workOrdersData.data.length === 0)) {
            result.push({
                text: t("suggestWorkOrder"),
                link: "/work-orders/create",
            });
        }

        return result.slice(0, 2);
    }, [items, productsData, movementsData, workOrdersData, t]);

    return (
        <Card
            header={
                <h3 className="text-sm font-semibold text-zinc-200">
                    {t("attentionItems")}
                </h3>
            }
            padding="none"
        >
            {isLoading ? (
                <div className="p-5 space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-10" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="p-6 flex flex-col items-center gap-3 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                    <p className="text-sm text-zinc-300">{t("allClear")}</p>
                    {suggestions.length > 0 && (
                        <div className="w-full mt-2 space-y-2">
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion.link}
                                    onClick={() => navigate(suggestion.link)}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left group"
                                >
                                    <span className="flex-1 text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">
                                        {suggestion.text}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <ul className="divide-y divide-white/[0.06]">
                    {items.map((item) => (
                        <li key={item.id}>
                            <button
                                onClick={() => navigate(item.link)}
                                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors text-left group"
                            >
                                <div className="flex-shrink-0">{item.icon}</div>
                                <span className="flex-1 text-sm text-zinc-300 truncate">
                                    {item.description}
                                </span>
                                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};
