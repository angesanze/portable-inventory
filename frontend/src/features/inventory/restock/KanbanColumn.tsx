import { useTranslation } from "react-i18next";
import { ProductCard } from "./ProductCard";
import type { Bucket, Card } from "./types";

const bucketAccent: Record<Bucket, string> = {
    HEALTHY: "text-emerald-400",
    REORDER: "text-amber-400",
    CRITICAL: "text-red-400",
    OUT: "text-zinc-400",
    OVERSTOCK: "text-cyan-400",
};

const bucketCountBg: Record<Bucket, string> = {
    HEALTHY: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    REORDER: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    CRITICAL: "bg-red-500/10 text-red-300 border-red-500/20",
    OUT: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
    OVERSTOCK: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
};

const bucketDefaultLabel: Record<Bucket, string> = {
    HEALTHY: "Healthy",
    REORDER: "Reorder",
    CRITICAL: "Critical",
    OUT: "Out of stock",
    OVERSTOCK: "Overstock",
};

interface KanbanColumnProps {
    bucket: Bucket;
    count: number;
    cards: Card[];
    onCardClick: (card: Card) => void;
    onCardEditThresholds?: (card: Card) => void;
    onCardCreateOrder?: (card: Card) => void;
}

export const KanbanColumn = ({
    bucket,
    count,
    cards,
    onCardClick,
    onCardEditThresholds,
    onCardCreateOrder,
}: KanbanColumnProps) => {
    const { t } = useTranslation(["inventory", "common"]);

    return (
        <div className="flex flex-col min-w-0">
            <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/70 border-b border-white/[0.06] px-2 py-2 flex items-center justify-between gap-2">
                <span
                    className={`text-xs font-semibold uppercase tracking-wider ${bucketAccent[bucket]}`}
                >
                    {t(`restock.column.${bucket}`, bucketDefaultLabel[bucket])}
                </span>
                <span
                    className={`inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full text-[11px] font-medium border ${bucketCountBg[bucket]}`}
                >
                    {count}
                </span>
            </div>

            <div className="flex flex-col gap-2 mt-2 pr-1 max-h-[calc(100vh-220px)] overflow-y-auto">
                {cards.length === 0 ? (
                    <div className="border border-dashed border-white/[0.08] rounded-lg p-6 text-center text-xs text-zinc-500">
                        {t("restock.column.empty", {
                            defaultValue: "No products",
                        })}
                    </div>
                ) : (
                    cards.map((card) => (
                        <ProductCard
                            key={card.id}
                            card={card}
                            onClick={() => onCardClick(card)}
                            onEditThresholds={
                                onCardEditThresholds
                                    ? () => onCardEditThresholds(card)
                                    : undefined
                            }
                            onCreateOrder={
                                onCardCreateOrder
                                    ? () => onCardCreateOrder(card)
                                    : undefined
                            }
                        />
                    ))
                )}
            </div>
        </div>
    );
};
