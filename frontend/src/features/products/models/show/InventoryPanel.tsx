import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import { Card } from "../../../../components/ui/Card";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { InventoryActionButton } from "./InventoryActionButton";
import { LocationBreakdown } from "./LocationBreakdown";
import { BatchDetail } from "./BatchDetail";
import { StatusCountsRow } from "./StatusCountsRow";
import { ItemsDetail } from "./ItemsDetail";
import { QuarantineSection } from "./QuarantineSection";
import type { ProductModelDetail, StockLevel } from "./types";

/**
 * "Current Inventory" card: a profile-aware summary of the stock level
 * (total, physical/reserved/available split, and the appropriate
 * per-location / per-batch / per-item breakdown plus quarantine holdings).
 */
export function InventoryPanel({
    model,
    stock,
    isLoadingStock,
    productId,
    navigate,
}: {
    model: ProductModelDetail | undefined;
    stock: StockLevel | undefined;
    isLoadingStock: boolean;
    productId: string;
    navigate: (path: string) => void;
}) {
    const { t } = useTranslation(["products", "common"]);

    return (
        <Card
            header={
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                        <Layers size={16} className="text-emerald-400" />
                        {t("products:currentInventory")}
                    </h3>
                    {model && (
                        <InventoryActionButton
                            profile={model.profile ?? ""}
                            productId={productId}
                            navigate={navigate}
                        />
                    )}
                </div>
            }
        >
            {isLoadingStock ? (
                <div className="space-y-3">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-20 w-full" />
                </div>
            ) : stock ? (
                <div className="space-y-4">
                    {/* Total */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-baseline gap-3">
                            <span className="text-3xl font-bold text-zinc-50">
                                {Number(stock.total || 0).toLocaleString()}
                            </span>
                            <span className="text-zinc-500 text-sm">
                                {stock.tracking_mode === "INDIVIDUAL"
                                    ? t("products:items")
                                    : t("products:totalUnits")}
                            </span>
                        </div>
                    </div>

                    {/* Physical / Reserved / Available split (RESERVATIONS-01) —
                        rendered only when the level endpoint exposes the fields. */}
                    {stock.reserved != null && stock.available != null && (
                        <div
                            className="grid grid-cols-3 gap-3"
                            data-testid="stock-level-split"
                        >
                            <div className="p-3 bg-white/5 rounded-lg">
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                                    {t("products:physicalStock")}
                                </div>
                                <span className="text-lg font-bold text-zinc-200 font-mono">
                                    {Number(stock.total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="p-3 bg-amber-500/5 rounded-lg">
                                <div className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-1">
                                    {t("products:reservedStock")}
                                </div>
                                <span className="text-lg font-bold text-amber-300 font-mono">
                                    {Number(stock.reserved || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="p-3 bg-emerald-500/5 rounded-lg">
                                <div className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider mb-1">
                                    {t("products:availableStock")}
                                </div>
                                <span
                                    className={`text-lg font-bold font-mono ${
                                        Number(stock.available) > 0
                                            ? "text-emerald-300"
                                            : "text-rose-400"
                                    }`}
                                >
                                    {Number(stock.available || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* BULK: Location breakdown */}
                    {stock.tracking_mode !== "BATCH" &&
                        stock.tracking_mode !== "INDIVIDUAL" &&
                        stock.breakdown &&
                        Object.keys(stock.breakdown).length > 0 && (
                            <LocationBreakdown breakdown={stock.breakdown} />
                        )}

                    {/* BATCH: Batch list */}
                    {stock.tracking_mode === "BATCH" && (
                        <BatchDetail
                            batches={stock.batches || []}
                            profile={stock.profile ?? ""}
                        />
                    )}

                    {/* SERIALIZED: per-status breakdown + items list */}
                    {stock.tracking_mode === "INDIVIDUAL" && (
                        <>
                            {stock.status_counts && (
                                <StatusCountsRow counts={stock.status_counts} />
                            )}
                            <ItemsDetail items={stock.items || []} />
                        </>
                    )}

                    {/* RMA-08: quarantine (non-sellable) holdings */}
                    {Number(stock.quarantine_total || 0) > 0 &&
                        stock.quarantine_breakdown && (
                            <QuarantineSection
                                total={Number(stock.quarantine_total)}
                                breakdown={stock.quarantine_breakdown}
                            />
                        )}
                </div>
            ) : (
                <div className="text-zinc-500">
                    {t("products:noStockData")}
                </div>
            )}
        </Card>
    );
}
