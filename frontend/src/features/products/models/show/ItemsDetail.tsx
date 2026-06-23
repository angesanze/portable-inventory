import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { itemStatusVariant } from "../../../../utils/inventoryBadges";
import type { StockItem } from "./types";

/** Serial-number table for INDIVIDUAL (serialized) stock. */
export function ItemsDetail({ items }: { items: StockItem[] }) {
    const { t } = useTranslation(["products", "common"]);
    if (items.length === 0) {
        return (
            <p className="text-sm text-zinc-500">{t("products:noItems")}</p>
        );
    }

    return (
        <div className="mt-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {t("products:itemsCount", { value: items.length })}
            </h4>
            <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900">
                        <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-white/[0.06]">
                            <th className="pb-2 pr-4 font-semibold">
                                {t("products:serialNumber")}
                            </th>
                            <th className="pb-2 pr-4 font-semibold">{t("common:status")}</th>
                            <th className="pb-2 font-semibold">{t("products:location")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                        {items.map((item) => (
                            <tr
                                key={item.id}
                                className="hover:bg-white/5 transition-colors"
                            >
                                <td className="py-2.5 pr-4 font-mono text-zinc-200">
                                    {item.identifier}
                                </td>
                                <td className="py-2.5 pr-4">
                                    <Badge variant={itemStatusVariant(item.status)}>
                                        {item.status}
                                    </Badge>
                                </td>
                                <td className="py-2.5">
                                    <div className="flex items-center gap-1.5 text-zinc-300">
                                        <MapPin
                                            size={12}
                                            className="text-zinc-500"
                                        />
                                        {item.location || "—"}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
