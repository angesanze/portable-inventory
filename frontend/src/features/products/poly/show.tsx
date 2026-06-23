import { useShow, useList } from "@refinedev/core";
import type { PolyMovementRow, PolyStockBatch, PolyShowProduct } from "../types";
import { useParams } from "react-router-dom";
import {
    Settings,
    Box,
    Zap,
    Activity,
    ChevronLeft
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Strategy Views
import { QuickAdjust } from "../../../components/strategy-views/QuickAdjust";
import { BatchManager } from "../../../components/strategy-views/BatchManager";
import { MonitoringPanel } from "../../../components/strategy-views/MonitoringPanel";
import { useState, useMemo } from "react";

function formatTimeAgo(date: Date, t: TFunction): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t("common:justNow");
    if (diffMin < 60) return t("common:minutesAgo", { count: diffMin });
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return t("common:hoursAgo", { count: diffHrs });
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return t("common:yesterday");
    return t("common:daysAgo", { count: diffDays });
}

export const ProductPolyShow = () => {
    const { t } = useTranslation(["products", "common"]);
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState<'overview' | 'manage' | 'batches' | 'settings'>('overview');

    const { queryResult } = useShow<PolyShowProduct>({
        resource: "products-poly",
        id: id,
        meta: {
            populate: ['product_model'] // We need the strategy info from the model
        }
    });

    const { data, isLoading } = queryResult;
    const product = data?.data;

    const { data: movementsData, isLoading: isLoadingMovements } = useList<PolyMovementRow>({
        resource: "movements",
        filters: [{ field: "product_model", operator: "eq", value: id }],
        sorters: [{ field: "occurred_at", order: "desc" }],
        pagination: { current: 1, pageSize: 50 },
    });

    const movements: PolyMovementRow[] = Array.isArray(movementsData?.data) ? movementsData.data : [];

    const chartData = useMemo(() => {
        if (!movements.length) return [];

        const days: { dateString: string; name: string; inbound: number; outbound: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push({
                dateString: d.toISOString().split('T')[0],
                name: d.toLocaleDateString('en-US', { weekday: 'short' }),
                inbound: 0,
                outbound: 0,
            });
        }

        movements.forEach((m) => {
            if (!m.occurred_at) return;
            const mDate = m.occurred_at.split('T')[0];
            const dayEntry = days.find(d => d.dateString === mDate);
            if (dayEntry) {
                const qty = Number(m.quantity);
                if (qty > 0) dayEntry.inbound += qty;
                else dayEntry.outbound += Math.abs(qty);
            }
        });

        return days;
    }, [movements]);

    if (isLoading || !product) {
        return <div className="p-8 text-center text-zinc-500">{t("products:poly.loadingContext")}</div>;
    }

    // Determine Strategy
    const isBucket = product.engine_type?.toLowerCase() === 'bucket';
    const isTracker = product.engine_type?.toLowerCase() === 'tracker';

    return (
        <div className="min-h-screen bg-zinc-950 p-6 md:p-12 pb-32">
            {/* Header */}
            <div className="max-w-6xl mx-auto mb-8">
                <Link to="/products-poly" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors font-medium text-sm">
                    <ChevronLeft size={16} /> {t("products:poly.backToProducts")}
                </Link>

                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-4xl font-bold text-white mb-2">{product.name}</h1>
                        <div className="flex gap-4 text-sm font-mono">
                            <span className="text-indigo-400 bg-indigo-900/20 px-2 py-0.5 rounded border border-indigo-500/30">
                                {product.engine_type.toUpperCase()}
                            </span>
                            <span className="text-zinc-500">
                                ID: {String(product.id).split('-')[0]}...
                            </span>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-zinc-400 text-sm uppercase tracking-wider mb-1">{t("products:poly.totalStock")}</div>
                        <div className="text-3xl font-bold text-white">
                            {/* Logic to show total sum if bucket or tracker */}
                            {(() => {
                                if (isBucket || isTracker) {
                                    return Array.isArray(product.stock_value)
                                        ? product.stock_value.reduce((acc: number, b: PolyStockBatch) => acc + (b.quantity || b.qty || 0), 0)
                                        : 0;
                                }
                                // Handle Counter/Converter (Scalar)
                                if (typeof product.stock_value === 'number') return product.stock_value;
                                if (typeof product.stock_value === 'string') return product.stock_value;
                                // If it's an object (default dict {}) or null, show 0
                                return 0;
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto">
                {/* 1. Monitoring Layer (Always visible if active) */}
                <MonitoringPanel productId={String(product.id)} />

                {/* 2. Navigation Tabs */}
                <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl w-fit mb-8 border border-white/5">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-150 ${activeTab === 'overview' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Activity size={16} /> {t("products:poly.tabOverview")}
                    </button>
                    <button
                        onClick={() => setActiveTab('manage')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-150 ${activeTab === 'manage' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                    >
                        {(isBucket || isTracker) ? <Box size={16} /> : <Zap size={16} />}
                        {(isBucket || isTracker) ? t("products:poly.tabActions") : t("products:poly.tabQuickAdjust")}
                    </button>
                    <button
                        onClick={() => setActiveTab('batches')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-150 ${activeTab === 'batches' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Box size={16} /> {isBucket ? t("products:poly.tabBatchesAllocations") : isTracker ? t("products:poly.tabItemsAssets") : t("products:poly.tabAllocations")}
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-150 ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Settings size={16} /> {t("products:poly.tabSettings")}
                    </button>
                </div>

                {/* 3. Content Area */}
                <div className="animate-fadeIn">

                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="md:col-span-2 bg-zinc-900 border border-white/[0.06] rounded-xl p-6 h-[400px] flex flex-col">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-300 mb-4">{t("products:poly.activity7Day")}</h3>
                                {isLoadingMovements ? (
                                    <div className="flex-1 flex items-center justify-center text-zinc-500">{t("products:poly.loadingChart")}</div>
                                ) : chartData.every(d => d.inbound === 0 && d.outbound === 0) ? (
                                    <div className="flex-1 flex items-center justify-center text-zinc-500">{t("products:poly.noMovements7Day")}</div>
                                ) : (
                                    <div className="flex-1 min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="polyColorInbound" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8} />
                                                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="polyColorOutbound" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#c084fc" stopOpacity={0.8} />
                                                        <stop offset="95%" stopColor="#c084fc" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.5rem' }}
                                                    itemStyle={{ color: '#e2e8f0' }}
                                                />
                                                <Area type="monotone" dataKey="inbound" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#polyColorInbound)" />
                                                <Area type="monotone" dataKey="outbound" stroke="#c084fc" strokeWidth={3} fillOpacity={1} fill="url(#polyColorOutbound)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                            <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-6">
                                <h3 className="text-white font-bold mb-4">{t("products:poly.recentActivity")}</h3>
                                {isLoadingMovements ? (
                                    <div className="text-zinc-500 text-sm">{t("common:loading")}</div>
                                ) : movements.length === 0 ? (
                                    <div className="text-zinc-500 text-sm">{t("products:poly.noMovementsYet")}</div>
                                ) : (
                                    <div className="space-y-3 max-h-[320px] overflow-y-auto">
                                        {movements.slice(0, 10).map((m: PolyMovementRow, i: number) => {
                                            const qty = Number(m.quantity);
                                            const isPositive = qty > 0;
                                            const occurredAt = m.occurred_at ? new Date(m.occurred_at) : null;
                                            const timeAgo = occurredAt
                                                ? formatTimeAgo(occurredAt, t)
                                                : '';
                                            return (
                                                <div key={m.id || i} className="p-3 bg-white/5 rounded-lg text-sm text-zinc-300">
                                                    <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                                                        {isPositive ? '+' : ''}{qty}
                                                    </span>
                                                    {m.reason && (
                                                        <span className="text-zinc-500 ml-2 text-xs">{m.reason}</span>
                                                    )}
                                                    <span className="text-zinc-500 text-xs block mt-1">{timeAgo}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'manage' && (
                        <div>
                            {/* DYNAMIC RENDERING BASED ON STRATEGY */}
                            {(isBucket || isTracker) ? (
                                <div className="text-zinc-400 italic">
                                    {isTracker
                                        ? t("products:poly.manageItemsHint", { tab: t("products:poly.tabItemsAssets") })
                                        : t("products:poly.manageBatchesHint", { tab: t("products:poly.tabBatchesAllocations") })}
                                </div>
                            ) : (
                                <div className="max-w-xl">
                                    <QuickAdjust product={product} onUpdate={() => queryResult.refetch()} />
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'batches' && (
                        <div>
                            {(isBucket || isTracker) ? (
                                <BatchManager
                                    product={product}
                                    onUpdate={() => queryResult.refetch()}
                                    variant={isTracker ? 'ITEM' : 'BATCH'}
                                />
                            ) : (
                                <div className="p-8 text-center text-zinc-500 bg-zinc-900 rounded-xl border border-white/[0.06]">
                                    {t("products:poly.noBatchesItems", { engine: product.engine_type })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-6">
                            <h3 className="text-white font-bold mb-4">{t("products:poly.configuration")}</h3>
                            <pre className="text-xs text-zinc-500 bg-black p-4 rounded-lg overflow-auto">
                                {JSON.stringify(product, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
