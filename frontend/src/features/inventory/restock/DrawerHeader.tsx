import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import type { Card } from "./types";
import { bucketVariant, type Tab } from "./drawerTypes";

interface DrawerHeaderProps {
    card: Card;
    tab: Tab;
    setTab: (t: Tab) => void;
    onClose: () => void;
}

/** Drawer chrome: identity header (SKU / name / bucket badge / close) and the
 * tab strip. Markup is unchanged from the original ``DrawerBody`` header. */
export const DrawerHeader = ({
    card,
    tab,
    setTab,
    onClose,
}: DrawerHeaderProps) => {
    const { t } = useTranslation(["restock", "common"]);
    return (
        <>
            <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
                <div className="min-w-0">
                    <div className="text-[11px] font-mono text-zinc-500 truncate">
                        {card.sku}
                    </div>
                    <div className="text-base font-semibold text-zinc-100 truncate">
                        {card.name}
                    </div>
                    <div className="mt-1">
                        <Badge variant={bucketVariant[card.bucket]}>
                            {t(`columns.${card.bucket}`, card.bucket)}
                        </Badge>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("common:close", { defaultValue: "Close" })}
                    className="shrink-0 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg p-1 transition-colors"
                    data-testid="drawer-close"
                >
                    <X size={18} />
                </button>
            </header>

            <nav role="tablist" className="flex border-b border-white/[0.06] px-2">
                {(
                    [
                        ["history", t("drawer.tabHistory")],
                        ["velocity", t("drawer.tabVelocity")],
                        ["thresholds", t("drawer.tabThreshold")],
                    ] as const
                ).map(([key, label]) => (
                    <button
                        key={key}
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={`px-3 py-2 text-sm transition-colors ${
                            tab === key
                                ? "text-indigo-400 border-b-2 border-indigo-500"
                                : "text-zinc-400 hover:text-zinc-200 border-b-2 border-transparent"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </nav>
        </>
    );
};
