import { useState } from "react";
import { useList } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { StatCard } from "../../../components/dashboard/StatCard";
import { RecentMovements } from "../../../components/dashboard/RecentMovements";
import { MovementChart } from "../../../components/dashboard/MovementChart";
import { AttentionItems } from "../../../components/dashboard/AttentionItems";
import { QuickActions } from "./QuickActions";
import { GettingStartedChecklist } from "./GettingStartedChecklist";
import { Package, Activity, BarChart3, ClipboardList, Command } from "lucide-react";
import { DismissableHint } from "../../../components/ui/DismissableHint";

export const Dashboard = () => {
    const { t } = useTranslation("dashboard");
    const [checklistDismissed] = useState(
        () => localStorage.getItem("gettingStartedDismissed") === "true"
    );

    // KPI Queries
    const { data: productsData, isLoading: isLoadingProducts } = useList({
        resource: "product-models",
        pagination: { pageSize: 1 },
    }) as any;

    const { data: itemsData, isLoading: isLoadingItems } = useList({
        resource: "physical-products",
        pagination: { pageSize: 1 },
    }) as any;

    const { data: pendingWorkOrdersData, isLoading: isLoadingWorkOrders } = useList({
        resource: "work-orders",
        pagination: { pageSize: 1 },
        filters: [
            { field: "status", operator: "eq", value: "OPEN" },
        ],
    }) as any;

    return (
        <div className="w-full">
            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-zinc-50">{t("title")}</h1>
                <p className="text-sm text-zinc-400 mt-1">{t("subtitle")}</p>
            </div>

            {/* Getting Started Checklist (conditional) */}
            <GettingStartedChecklist />

            {checklistDismissed && (
                <DismissableHint id="dashboard-keyboard-shortcut" icon={Command} className="mb-4">
                    {t("hintCmdK")}
                </DismissableHint>
            )}

            {/* Quick Actions */}
            <QuickActions />

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard
                    title={t("totalProducts")}
                    value={productsData?.total || 0}
                    icon={<Package className="w-4 h-4" />}
                    iconColor="bg-indigo-500/15 text-indigo-400"
                    isLoading={isLoadingProducts}
                    href="/products"
                />
                <StatCard
                    title={t("activeItems")}
                    value={itemsData?.total || 0}
                    icon={<Activity className="w-4 h-4" />}
                    iconColor="bg-emerald-500/15 text-emerald-400"
                    isLoading={isLoadingItems}
                    href="/stock"
                />
                <StatCard
                    title={t("totalStock")}
                    value={itemsData?.total || 0}
                    icon={<BarChart3 className="w-4 h-4" />}
                    iconColor="bg-cyan-500/15 text-cyan-400"
                    isLoading={isLoadingItems}
                    href="/stock"
                />
                <StatCard
                    title={t("pendingWorkOrders")}
                    value={pendingWorkOrdersData?.total || 0}
                    icon={<ClipboardList className="w-4 h-4" />}
                    iconColor="bg-amber-500/15 text-amber-400"
                    isLoading={isLoadingWorkOrders}
                    href="/work-orders"
                />
            </div>

            {/* Main Content: Left 2/3 (Chart + Activity), Right 1/3 (Attention) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <MovementChart />
                    <RecentMovements />
                </div>

                <div className="lg:col-span-1">
                    <AttentionItems />
                </div>
            </div>

        </div>
    );
};
