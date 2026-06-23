import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Activity, ArrowRight } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { SkeletonList } from "../../../../components/ui/Skeleton";
import type { MovementRow } from "./types";

/** "Recent Movements" card: the latest stock movements for this model. */
export function MovementsList({
    movements,
    isLoading,
    productId,
}: {
    movements: MovementRow[];
    isLoading: boolean;
    productId: string | undefined;
}) {
    const { t } = useTranslation(["products", "common"]);

    return (
        <Card
            padding="none"
            header={
                <div className="flex justify-between items-center gap-3">
                    <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                        <Activity size={16} className="text-cyan-400" />
                        {t("products:recentMovements")}
                    </h3>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                            {t("products:lastN", { value: movements.length })}
                        </span>
                        {productId && (
                            <Link
                                to={`/movements?product_model=${productId}`}
                                className="text-xs text-indigo-400 hover:text-indigo-300"
                            >
                                {t("products:movementsSeeAll")}
                            </Link>
                        )}
                    </div>
                </div>
            }
        >
            {isLoading ? (
                <SkeletonList items={3} />
            ) : movements.length === 0 ? (
                <div className="p-8 text-center">
                    <Activity size={32} className="mx-auto mb-3 text-zinc-600" />
                    <p className="text-zinc-500">{t("products:noMovements")}</p>
                </div>
            ) : (
                <div className="divide-y divide-white/[0.06]">
                    {movements.map((m) => {
                        const qty = Number(m.quantity);
                        const isPositive = qty > 0;
                        return (
                            <div
                                key={m.id}
                                className="px-5 py-4 hover:bg-white/5 transition-colors"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="min-w-0 pr-4">
                                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-300">
                                                {m.supplier_name ||
                                                    m.from_location?.name || "—"}
                                            </span>
                                            <ArrowRight
                                                size={12}
                                                className="text-zinc-600"
                                            />
                                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-300">
                                                {m.to_location?.name || "—"}
                                            </span>
                                        </div>
                                        {m.reason && (
                                            <p className="text-xs text-zinc-500 mt-1 truncate">
                                                {m.reason}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <Badge
                                            variant={isPositive ? "emerald" : "rose"}
                                            className="px-2 py-0.5"
                                        >
                                            {isPositive ? "+" : ""}
                                            {qty.toLocaleString()}
                                        </Badge>
                                        <div className="text-[10px] text-zinc-600 mt-1 font-mono">
                                            {new Date(
                                                m.occurred_at,
                                            ).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
