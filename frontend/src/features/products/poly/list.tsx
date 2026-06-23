
import { useList, useDelete } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import type { PolyProductRow, PolyStockBatch, PolyKitRef } from "../types";

export const ProductPolyList = () => {
    const { t } = useTranslation(["products", "common"]);
    const { data: productsData, isLoading, isError, refetch } = useList<PolyProductRow>({
        resource: "products-poly",
    });

    const navigate = useNavigate();
    const { mutate: deleteProduct } = useDelete();
    const { confirm, dialogProps } = useConfirmDialog();

    const listData = productsData?.data;
    const products: PolyProductRow[] = Array.isArray(listData) ? listData : [];

    if (isError) {
        return (
            <ErrorState
                title={t("products:loadError")}
                message={t("products:poly.loadErrorDesc")}
                onRetry={refetch}
            />
        );
    }

    if (isLoading) {
        return (
            <div className="bg-zinc-900 border border-white/[0.06] rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-white/5 border-b border-white/[0.06]">
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("common:name")}</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("products:poly.engine")}</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("products:poly.batchKit")}</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-right">{t("products:stockColumn")}</th>
                            <th className="px-6 py-4 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("common:actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <SkeletonRow columns={5} rows={5} />
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">{t("products:poly.title")}</h1>
                    <p className="text-zinc-400 mt-1">{t("products:poly.subtitle")}</p>
                </div>
                <button
                    onClick={() => navigate("/products-poly/create")}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium shadow-lg shadow-emerald-900/20"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    {t("products:poly.newInstance")}
                </button>
            </div>

            {products.length === 0 ? (
                <EmptyState
                    icon={Package}
                    title={t("products:poly.emptyTitle")}
                    description={t("products:poly.emptyDesc")}
                    actionLabel={t("products:poly.newInstance")}
                    onAction={() => navigate("/products-poly/create")}
                />
            ) : (
            <div className="bg-zinc-900 border border-white/[0.06] rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-white/5 border-b border-white/[0.06]">
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("common:name")}</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("products:poly.engine")}</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("products:poly.batchKit")}</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-right">{t("products:stockColumn")}</th>
                            <th className="px-6 py-4 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t("common:actions")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {products.map((product) => (
                            <tr key={product.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4 text-white font-medium">{product.name}</td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                        {product.engine_type}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    {/* Batches / Kits Membership */}
                                    {(() => {
                                        const stock = product.stock_value;
                                        if (Array.isArray(stock)) {
                                            if (stock.length === 0) return <span className="text-zinc-500 italic">-</span>;

                                            // Extract unique Kits
                                            const kits: PolyKitRef[] = Array.from(new Set(stock.map((b: PolyStockBatch) => ({ name: b.work_order, id: b.work_order_id })))).filter(k => k.name);

                                            if (kits.length > 0) {
                                                return (
                                                    <div className="flex flex-wrap gap-2">
                                                        {kits.map((kit: PolyKitRef, i) => (
                                                            <a key={i} href={`/work-orders/show/${kit.id}`} className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30 hover:bg-amber-500/30 transition-colors">
                                                                📦 {kit.name}
                                                            </a>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            return <span className="text-zinc-500 text-xs text-center block">-</span>;
                                        }
                                        return <span className="text-zinc-500 text-xs text-center block">-</span>;
                                    })()}
                                </td>
                                <td className="px-6 py-4 text-right text-zinc-300 font-mono text-sm font-bold">
                                    {(() => {
                                        const stock = product.stock_value;
                                        // 1. Array (Bucket/Batches) --> Sum
                                        if (Array.isArray(stock)) {
                                            const total = stock.reduce((acc, b) => acc + (b.qty || 0), 0);
                                            return <span>{total}</span>;
                                        }
                                        // 2. Scalar (Bulk/Tracker)
                                        return typeof stock === 'object' ?
                                            (stock?.total ?? 0) :
                                            stock;
                                    })()}
                                </td>
                                <td className="px-6 py-4 text-right space-x-3">
                                    <button
                                        onClick={() => navigate(`/products-poly/${product.id}`)}
                                        className="text-emerald-400 hover:text-emerald-300 text-sm font-bold uppercase transition-colors"
                                    >
                                        {t("products:details")}
                                    </button>
                                    <button
                                        onClick={() => navigate(`/products-poly/edit/${product.id}`)}
                                        className="text-indigo-400 hover:text-indigo-300 text-sm font-bold uppercase transition-colors"
                                    >
                                        {t("common:edit")}
                                    </button>
                                    <button
                                        onClick={() => window.open(`/p-widget/${product.id}`, '_blank')}
                                        className="text-amber-400 hover:text-amber-300 text-sm font-bold uppercase"
                                    >
                                        {t("products:poly.widget")}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (await confirm({ title: t("products:deleteProduct"), message: t("products:poly.deleteInstanceConfirm"), variant: "danger", confirmLabel: t("common:delete") })) {
                                                deleteProduct({ resource: "products-poly", id: product.id });
                                            }
                                        }}
                                        className="text-zinc-500 hover:text-red-400 transition-colors text-sm"
                                    >
                                        {t("common:delete")}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            )}
            <ConfirmDialog {...dialogProps} />
        </div>
    );
};
