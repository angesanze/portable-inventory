import { useList } from "@refinedev/core";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card } from "../ui/Card";
import { SkeletonList } from "../ui/Skeleton";

function formatRelativeTime(dateString: string, t: TFunction): string {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return t("justNow");
    if (diffMinutes < 60) return t("minutesAgo", { count: diffMinutes });
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t("hoursAgo", { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t("daysAgo", { count: diffDays });
    return date.toLocaleDateString();
}

type MovementType = "inbound" | "outbound" | "transfer";

/** A location as populated on a movement row (object form via `meta.populate`). */
interface PopulatedLocation {
    name?: string;
    [key: string]: unknown;
}

/** A product model as populated on a movement row. */
interface PopulatedProduct {
    name?: string;
    [key: string]: unknown;
}

/** Movement row as consumed by this widget (locations/product expanded). */
interface MovementRow {
    id: string | number;
    quantity: number | string;
    occurred_at: string;
    from_location?: PopulatedLocation | string | null;
    to_location?: PopulatedLocation | string | null;
    product_model?: PopulatedProduct | string | null;
}

/** Narrow a possibly-string location reference to its populated object form. */
function locationName(loc: MovementRow["from_location"]): string | undefined {
    return loc && typeof loc === "object" ? loc.name : undefined;
}

function getMovementType(item: MovementRow): MovementType {
    const qty = Number(item.quantity);
    if (item.from_location && item.to_location) return "transfer";
    if (qty > 0) return "inbound";
    return "outbound";
}

const dotColors: Record<MovementType, string> = {
    inbound: "bg-green-500",
    outbound: "bg-orange-500",
    transfer: "bg-blue-500",
};

function getMovementDescription(item: MovementRow, type: MovementType, t: TFunction): string {
    const qty = Math.abs(Number(item.quantity));
    const fromName = locationName(item.from_location);
    const toName = locationName(item.to_location);

    switch (type) {
        case "transfer":
            return t("movementTransfer", { qty, from: fromName, to: toName });
        case "inbound":
            return toName
                ? t("movementReceivedAt", { qty, to: toName })
                : t("movementReceived", { qty });
        case "outbound":
            return fromName
                ? t("movementDispatchedFrom", { qty, from: fromName })
                : t("movementDispatched", { qty });
    }
}

interface RecentMovementsViewProps {
    movements: MovementRow[];
    isLoading: boolean;
}

export const RecentMovementsView: React.FC<RecentMovementsViewProps> = ({ movements, isLoading }) => {
    const navigate = useNavigate();
    const { t } = useTranslation("dashboard");

    return (
        <Card padding="none" className="flex flex-col">
            <div className="px-6 py-4 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-zinc-200">{t("recentMovements")}</h3>
            </div>

            <div className="flex-1 overflow-auto">
                {isLoading ? (
                    <SkeletonList items={5} />
                ) : movements.length === 0 ? (
                    <div className="px-6 py-12 text-center text-zinc-500 text-sm">
                        {t("noRecentMovements")}
                    </div>
                ) : (
                    <ul role="list" className="divide-y divide-white/[0.04]">
                        {movements.slice(0, 10).map((item) => {
                            const type = getMovementType(item);
                            const productName =
                                item.product_model && typeof item.product_model === "object"
                                    ? item.product_model.name
                                    : undefined;
                            return (
                                <li key={item.id} className="px-6 py-3 flex items-start gap-3">
                                    <span
                                        className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColors[type]}`}
                                        aria-hidden="true"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-zinc-200 text-sm truncate">
                                            {productName || t("unknownProduct")}
                                        </p>
                                        <p className="text-sm text-zinc-400 truncate">
                                            {getMovementDescription(item, type, t)}
                                        </p>
                                    </div>
                                    <span className="text-xs text-zinc-500 shrink-0 mt-0.5">
                                        {formatRelativeTime(item.occurred_at, t)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <button
                onClick={() => navigate("/movements")}
                className="px-6 py-3 border-t border-white/[0.06] text-xs text-center text-zinc-500 hover:text-zinc-300 transition-colors"
            >
                {t("viewAll")} &rarr;
            </button>
        </Card>
    );
};

export const RecentMovements: React.FC = () => {
    const { data, isLoading } = useList<MovementRow>({
        resource: "movements",
        pagination: {
            current: 1,
            pageSize: 10,
        },
        sorters: [
            {
                field: "occurred_at",
                order: "desc",
            },
        ],
        meta: {
            populate: ["product_model", "from_location", "to_location"],
        }
    });

    const listData = data?.data;
    const movements: MovementRow[] = Array.isArray(listData) ? listData : [];

    return <RecentMovementsView movements={movements} isLoading={isLoading} />;
};
