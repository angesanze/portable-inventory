import type { TFunction } from "i18next";
import { Package, Box, Plus, Minus, Trash2 } from "lucide-react";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { SkeletonList } from "../../../components/ui/Skeleton";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InfoTip } from "../../../components/ui/InfoTip";
import type {
    WorkOrderRecord,
    WorkOrderContentItem,
    LineItemType,
} from "./showTypes";

interface WorkOrderLineItemsProps {
    t: TFunction;
    order: WorkOrderRecord | undefined;
    contents: WorkOrderContentItem[];
    isLoadingContents: boolean;
    isUpdating: boolean;
    onAddClick: () => void;
    onAdjustment: (item: WorkOrderContentItem, delta: number) => void;
}

export const WorkOrderLineItems = ({
    t,
    order,
    contents,
    isLoadingContents,
    isUpdating,
    onAddClick,
    onAdjustment,
}: WorkOrderLineItemsProps) => {
    return (
        <Card
            padding="none"
            header={
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                        <Package size={16} className="text-emerald-400" />
                        {t("workOrders.lineItems")}
                    </h3>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                            {t("workOrders.itemCount", {
                                count: contents.length,
                            })}
                        </span>
                        {order?.status === "OPEN" && (
                            <>
                                <Button
                                    variant="secondary"
                                    icon={Plus}
                                    onClick={onAddClick}
                                >
                                    {t("workOrders.addItem")}
                                </Button>
                                <InfoTip content={t("workOrders.addItemHelp")} />
                            </>
                        )}
                    </div>
                </div>
            }
        >
            {isLoadingContents ? (
                <SkeletonList items={3} />
            ) : contents.length === 0 ? (
                <div className="p-8 text-center">
                    <Box size={32} className="mx-auto mb-3 text-zinc-600" />
                    <p className="text-zinc-500">
                        {t("workOrders.noLineItems")}
                    </p>
                    {order?.status === "OPEN" && (
                        <p className="text-zinc-500 text-sm mt-2">
                            {t("workOrders.emptyLineItems")}
                        </p>
                    )}
                </div>
            ) : (
                <div>
                    {(["BULK", "BATCH", "SERIAL"] as const).map((type) => {
                        const items = contents.filter(
                            (item) => item.type === type,
                        );
                        if (items.length === 0) return null;
                        const sectionLabel =
                            type === "BULK"
                                ? t("workOrders.bulkItems")
                                : type === "BATCH"
                                  ? t("workOrders.batchItems")
                                  : t("workOrders.serializedItems");
                        const sectionVariant: BadgeVariant =
                            type === "BATCH"
                                ? "amber"
                                : type === "SERIAL"
                                  ? "cyan"
                                  : "indigo";
                        return (
                            <div key={type}>
                                <div className="px-5 py-2 bg-zinc-800/40 border-y border-white/[0.04] flex items-center gap-2">
                                    <Badge variant={sectionVariant} size="sm">
                                        {type}
                                    </Badge>
                                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                        {sectionLabel}
                                    </span>
                                    <span className="text-xs text-zinc-600">
                                        ({items.length})
                                    </span>
                                </div>
                                <div className="divide-y divide-white/[0.06]">
                                    {items.map((item, idx) => (
                                        <LineItemRow
                                            key={idx}
                                            t={t}
                                            type={type}
                                            item={item}
                                            isUpdating={isUpdating}
                                            onAdjustment={onAdjustment}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {/* Total items summary */}
                    {(() => {
                        const uniqueProducts = new Set(
                            contents.map(
                                (item) => item.product_name || item.sku,
                            ),
                        ).size;
                        const totalUnits = contents.reduce(
                            (sum, item) => sum + Number(item.quantity || 0),
                            0,
                        );
                        return (
                            <div className="px-5 py-3 bg-zinc-800/30 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
                                <span>
                                    {t("workOrders.totalSummary", {
                                        products: uniqueProducts,
                                        units: totalUnits.toLocaleString(),
                                    })}
                                </span>
                            </div>
                        );
                    })()}
                </div>
            )}
        </Card>
    );
};

interface LineItemRowProps {
    t: TFunction;
    type: LineItemType;
    item: WorkOrderContentItem;
    isUpdating: boolean;
    onAdjustment: (item: WorkOrderContentItem, delta: number) => void;
}

const LineItemRow = ({
    t,
    type,
    item,
    isUpdating,
    onAdjustment,
}: LineItemRowProps) => {
    return (
        <div className="px-5 py-4 hover:bg-white/5 transition-colors flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-3">
                <div>
                    <div className="text-sm font-medium text-zinc-200">
                        {item.product_name}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">
                        {item.sku}
                    </div>
                    {type === "BULK" && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                            {Number(item.quantity).toLocaleString()}{" "}
                            {item.unit || t("workOrders.units")}
                        </div>
                    )}
                    {type === "BATCH" && (
                        <>
                            <div className="text-xs text-zinc-500 mt-0.5">
                                {t("workOrders.qtyLabel")}{" "}
                                {Number(item.quantity).toLocaleString()}
                            </div>
                            {item.batch_identifier &&
                                ![
                                    "AGGREGATED",
                                    "General",
                                    "Standard",
                                ].includes(item.batch_identifier) && (
                                    <div className="text-xs text-zinc-600 mt-0.5">
                                        {t("workOrders.lotLabel")}{" "}
                                        {item.batch_identifier}
                                    </div>
                                )}
                        </>
                    )}
                    {type === "SERIAL" && (
                        <div className="flex items-center gap-2 mt-0.5">
                            {item.identifier && (
                                <span className="text-xs text-zinc-500 font-mono">
                                    {t("workOrders.snLabel")} {item.identifier}
                                </span>
                            )}
                            <Badge variant="emerald" size="sm">
                                ACTIVE
                            </Badge>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
                {["BATCH", "BULK"].includes(item.type) && (
                    <>
                        <button
                            disabled={isUpdating}
                            onClick={() => onAdjustment(item, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                        >
                            <Minus size={14} />
                        </button>
                        <span className="text-lg font-bold text-zinc-50 min-w-[30px] text-center font-mono">
                            {Number(item.quantity).toLocaleString()}
                        </span>
                        <button
                            disabled={isUpdating}
                            onClick={() => onAdjustment(item, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                        >
                            <Plus size={14} />
                        </button>
                    </>
                )}
                {item.type === "SERIAL" && (
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-zinc-50 font-mono">
                            {Number(item.quantity).toLocaleString()}
                        </span>
                        <button
                            disabled={isUpdating}
                            onClick={() => onAdjustment(item, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50"
                            title={t("workOrders.removeFromBatch")}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
