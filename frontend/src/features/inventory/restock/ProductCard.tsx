import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Pencil, ShoppingCart } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { useTranslation } from "react-i18next";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { useCapabilities } from "../../../hooks/useCapabilities";
import type { Bucket, Card } from "./types";

const bucketVariant: Record<Bucket, BadgeVariant> = {
    HEALTHY: "emerald",
    REORDER: "amber",
    CRITICAL: "red",
    OUT: "slate",
    OVERSTOCK: "cyan",
};

const bucketStroke: Record<Bucket, string> = {
    HEALTHY: "#10b981",
    REORDER: "#f59e0b",
    CRITICAL: "#ef4444",
    OUT: "#71717a",
    OVERSTOCK: "#06b6d4",
};

/** Buckets where ordering more stock is the natural next action. */
const ORDERABLE_BUCKETS: Bucket[] = ["OUT", "CRITICAL", "REORDER"];

interface ProductCardProps {
    card: Card;
    onClick: () => void;
    onEditThresholds?: () => void;
    /** "Crea ordine" handoff to /purchasing/create (PURCHASE-ORDERS-03). */
    onCreateOrder?: () => void;
}

export const ProductCard = ({
    card,
    onClick,
    onEditThresholds,
    onCreateOrder,
}: ProductCardProps) => {
    const { t } = useTranslation(["inventory", "common"]);
    const { capabilities } = useCapabilities();
    const sparkData = card.sparkline.map((v) => ({ v }));
    const stroke = bucketStroke[card.bucket];
    const canEdit = capabilities.manage_own_inventory && !!onEditThresholds;
    const canOrder =
        capabilities.manage_own_inventory &&
        !!onCreateOrder &&
        ORDERABLE_BUCKETS.includes(card.bucket);

    const handleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={handleKey}
            className="group relative w-full text-left bg-zinc-900/80 border border-white/[0.06] hover:border-white/[0.12] hover:bg-zinc-900 rounded-lg p-3 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
        >
            {(canEdit || canOrder) && (
                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                    {canOrder && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCreateOrder?.();
                            }}
                            aria-label={t("restock.createOrder", {
                                defaultValue: "Create order",
                            })}
                            data-testid="card-create-order"
                            className="p-1 rounded text-zinc-500 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-emerald-300 hover:bg-white/5 transition-opacity"
                        >
                            <ShoppingCart size={12} />
                        </button>
                    )}
                    {canEdit && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditThresholds?.();
                            }}
                            aria-label={t("restock.editThresholds", {
                                defaultValue: "Edit thresholds",
                            })}
                            data-testid="card-edit-thresholds"
                            className="p-1 rounded text-zinc-500 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-indigo-300 hover:bg-white/5 transition-opacity"
                        >
                            <Pencil size={12} />
                        </button>
                    )}
                </div>
            )}
            <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-mono text-zinc-500 truncate">
                    {card.sku}
                </span>
                <Badge variant={bucketVariant[card.bucket]}>
                    {t(`restock.bucket.${card.bucket}`, card.bucket)}
                </Badge>
            </div>

            <div className="text-sm font-medium text-zinc-200 truncate mb-2">
                {card.name}
            </div>

            <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-2xl font-semibold text-zinc-100 leading-none">
                        {card.qty}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                        {card.reorder_threshold != null
                            ? t("restock.reorderAt", {
                                  threshold: card.reorder_threshold,
                                  defaultValue: `Reorder at ${card.reorder_threshold}`,
                              })
                            : t("restock.noThreshold", {
                                  defaultValue: "No threshold",
                              })}
                    </div>
                </div>
                <div className="w-[120px] h-[32px] shrink-0">
                    {sparkData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={sparkData}>
                                <Line
                                    type="monotone"
                                    dataKey="v"
                                    stroke={stroke}
                                    strokeWidth={1.5}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600">
                            —
                        </div>
                    )}
                </div>
            </div>

            <div className="text-[11px] text-zinc-500 mt-2">
                {card.velocity_7d > 0
                    ? t("restock.velocityLine", {
                          rate: card.velocity_7d.toFixed(1),
                          days: card.days_to_runout ?? "∞",
                          defaultValue: `${card.velocity_7d.toFixed(1)}/day · ${card.days_to_runout ?? "∞"}d to runout`,
                      })
                    : t("restock.noMovement", {
                          defaultValue: "No recent movement",
                      })}
            </div>
        </div>
    );
};
