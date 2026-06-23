import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Card } from "./types";
import type { Tab } from "./drawerTypes";
import { useProductDrawer } from "./useProductDrawer";
import { DrawerHeader } from "./DrawerHeader";
import { HistoryTab } from "./HistoryTab";
import { VelocityTab } from "./VelocityTab";
import { ThresholdsTab } from "./ThresholdsTab";

export type { Tab } from "./drawerTypes";

interface ProductDrawerProps {
    card: Card | null;
    onClose: () => void;
    onSaved?: () => void;
    initialTab?: Tab;
}

export const ProductDrawer = ({
    card,
    onClose,
    onSaved,
    initialTab,
}: ProductDrawerProps) => {
    useEffect(() => {
        if (!card) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [card, onClose]);

    if (!card) return null;
    return (
        <DrawerBody
            key={card.id}
            card={card}
            onClose={onClose}
            onSaved={onSaved}
            initialTab={initialTab}
        />
    );
};

interface DrawerBodyProps {
    card: Card;
    onClose: () => void;
    onSaved?: () => void;
    initialTab?: Tab;
}

const DrawerBody = ({ card, onClose, onSaved, initialTab }: DrawerBodyProps) => {
    const { t } = useTranslation(["restock", "common"]);
    const [tab, setTab] = useState<Tab>(initialTab ?? "history");
    const {
        period,
        setPeriod,
        payload,
        isLoading,
        chartData,
        allZero,
        reorderT,
        criticalT,
    } = useProductDrawer(card);

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            data-testid="drawer-overlay"
        >
            <aside
                role="dialog"
                aria-label={t("drawer.title", { name: card.name })}
                className="w-[480px] max-w-full h-full bg-zinc-950 border-l border-white/[0.06] shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
                data-testid="product-drawer"
            >
                <DrawerHeader
                    card={card}
                    tab={tab}
                    setTab={setTab}
                    onClose={onClose}
                />

                <div className="flex-1 overflow-y-auto p-5">
                    {tab === "history" && (
                        <HistoryTab
                            isLoading={isLoading}
                            chartData={chartData}
                            allZero={allZero}
                            period={period}
                            setPeriod={setPeriod}
                            reorderT={reorderT}
                            criticalT={criticalT}
                        />
                    )}
                    {tab === "velocity" && (
                        <VelocityTab
                            isLoading={isLoading}
                            payload={payload}
                            t={t}
                        />
                    )}
                    {tab === "thresholds" && (
                        <ThresholdsTab card={card} onSaved={onSaved} />
                    )}
                </div>
            </aside>
        </div>,
        document.body,
    );
};
