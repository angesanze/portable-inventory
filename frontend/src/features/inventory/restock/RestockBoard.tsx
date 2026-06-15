import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ErrorState } from "../../../components/ui/ErrorState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useCapabilities } from "../../../hooks/useCapabilities";
import { BulkThresholdsModal } from "./BulkThresholdsModal";
import { KanbanColumn } from "./KanbanColumn";
import { ProductDrawer, type Tab as DrawerTab } from "./ProductDrawer";
import { useRestockBoard } from "./hooks";
import type { BoardResponse, Bucket, Card } from "./types";

const BUCKET_ORDER: Bucket[] = [
    "OUT",
    "CRITICAL",
    "REORDER",
    "HEALTHY",
    "OVERSTOCK",
];

const bucketTopBorder: Partial<Record<Bucket, string>> = {
    CRITICAL: "border-t-2 border-red-500/60",
    REORDER: "border-t-2 border-amber-500/60",
};

const SkeletonColumn = () => (
    <div className="flex flex-col min-w-0">
        <div className="px-2 py-2 mb-2 border-b border-white/[0.06]">
            <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="bg-zinc-900/80 border border-white/[0.06] rounded-lg p-3 space-y-2"
                >
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-6 w-1/3" />
                </div>
            ))}
        </div>
    </div>
);

export const RestockBoard = () => {
    const { t } = useTranslation(["restock", "common"]);
    const { capabilities } = useCapabilities();
    const navigate = useNavigate();
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [initialTab, setInitialTab] = useState<DrawerTab | undefined>(undefined);
    const [bulkOpen, setBulkOpen] = useState(false);

    const { data, isLoading, isError, refetch } = useRestockBoard() as {
        data?: { data: BoardResponse };
        isLoading: boolean;
        isError: boolean;
        refetch: () => void;
    };

    const board = data?.data;
    const totals = board?.totals;

    const [searchParams, setSearchParams] = useSearchParams();
    const focusId = searchParams.get("focus");
    const focusHandledRef = useRef<string | null>(null);

    useEffect(() => {
        if (!focusId || !board) return;
        if (focusHandledRef.current === focusId) return;
        for (const bucket of BUCKET_ORDER) {
            const match = board.columns[bucket]?.products.find(
                (c) => c.id === focusId,
            );
            if (match) {
                setInitialTab(undefined);
                setSelectedCard(match);
                focusHandledRef.current = focusId;
                const next = new URLSearchParams(searchParams);
                next.delete("focus");
                setSearchParams(next, { replace: true });
                return;
            }
        }
    }, [focusId, board, searchParams, setSearchParams]);

    const totalsLabel =
        totals != null
            ? t("totalsChip", {
                  needs: totals.needs_attention,
                  total: totals.products,
                  defaultValue: `${totals.needs_attention}/${totals.products} need attention`,
              })
            : null;

    const handleCardClick = (card: Card) => {
        setInitialTab(undefined);
        setSelectedCard(card);
    };

    const handleCardEditThresholds = (card: Card) => {
        setInitialTab("thresholds");
        setSelectedCard(card);
    };

    // "Crea ordine": hand the product off to a prefilled DRAFT purchase
    // order. Suggested qty = max threshold − stock (fallback: reorder
    // threshold − stock), floored at 1.
    const handleCardCreateOrder = (card: Card) => {
        const target = card.max_threshold ?? card.reorder_threshold;
        const suggested = Math.max(1, Math.ceil((target ?? 1) - card.qty));
        navigate(
            `/purchasing/create?product_id=${card.id}&qty=${suggested}`,
        );
    };

    return (
        <div>
            <PageHeader
                title={t("title", { defaultValue: "Restock Board" })}
                subtitle={t("subtitle", {
                    defaultValue: "Triage products by stock urgency",
                })}
                actions={
                    <>
                        {totalsLabel && (
                            <Badge
                                variant={
                                    totals && totals.needs_attention > 0
                                        ? "amber"
                                        : "emerald"
                                }
                            >
                                {totalsLabel}
                            </Badge>
                        )}
                        {capabilities.manage_thresholds && (
                            <Button
                                variant="secondary"
                                icon={SlidersHorizontal}
                                onClick={() => setBulkOpen(true)}
                                disabled={isLoading}
                                data-testid="bulk-thresholds-open"
                            >
                                {t("bulk.openButton")}
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            icon={RefreshCw}
                            onClick={() => refetch()}
                            disabled={isLoading}
                        >
                            {t("common:refresh", { defaultValue: "Refresh" })}
                        </Button>
                    </>
                }
            />

            {isError ? (
                <ErrorState
                    title={t("loadFailed", {
                        defaultValue: "Failed to load restock board",
                    })}
                    message={t("loadFailedDesc", {
                        defaultValue:
                            "Could not fetch restock data. Check your connection and try again.",
                    })}
                    onRetry={() => refetch()}
                />
            ) : isLoading || !board ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {BUCKET_ORDER.map((bucket) => (
                        <SkeletonColumn key={bucket} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {BUCKET_ORDER.map((bucket) => {
                        const col = board.columns[bucket];
                        const accent = bucketTopBorder[bucket] ?? "";
                        return (
                            <div key={bucket} className={`pt-1 ${accent}`}>
                                <KanbanColumn
                                    bucket={bucket}
                                    count={col?.count ?? 0}
                                    cards={col?.products ?? []}
                                    onCardClick={handleCardClick}
                                    onCardEditThresholds={handleCardEditThresholds}
                                    onCardCreateOrder={handleCardCreateOrder}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            <ProductDrawer
                card={selectedCard}
                initialTab={initialTab}
                onClose={() => setSelectedCard(null)}
                onSaved={() => refetch()}
            />

            <BulkThresholdsModal
                isOpen={bulkOpen}
                onClose={() => setBulkOpen(false)}
                onSaved={() => refetch()}
            />
        </div>
    );
};
