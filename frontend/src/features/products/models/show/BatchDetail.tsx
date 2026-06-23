import { useTranslation } from "react-i18next";
import { MapPin, Hash } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { getExpiryInfo } from "./expiry";
import type { StockBatch } from "./types";

/** Batch/lot table for BATCH-mode stock (adds expiry columns when perishable). */
export function BatchDetail({
    batches,
    profile,
}: {
    batches: StockBatch[];
    profile: string;
}) {
    const { t } = useTranslation("products");
    const isPerishable = profile === "PERISHABLE";

    if (batches.length === 0) {
        return <p className="text-sm text-zinc-500">{t("noActiveBatches")}</p>;
    }

    return (
        <div className="mt-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {t("batchesCount", { value: batches.length })}
            </h4>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-white/[0.06]">
                            <th className="pb-2 pr-4 font-semibold">
                                {t("batchId")}
                            </th>
                            <th className="pb-2 pr-4 font-semibold">
                                {t("quantity")}
                            </th>
                            <th className="pb-2 pr-4 font-semibold">
                                {t("location")}
                            </th>
                            {isPerishable && (
                                <>
                                    <th className="pb-2 pr-4 font-semibold">{t("expiry")}</th>
                                    <th className="pb-2 font-semibold">{t("daysRemaining")}</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                        {batches.map((b) => {
                            const expiry = b.data?.expiry_date;
                            const expiryInfo = isPerishable
                                ? getExpiryInfo(expiry)
                                : null;
                            return (
                                <tr
                                    key={b.id}
                                    data-testid={`batch-row-${b.id}`}
                                    className="hover:bg-white/5 transition-colors"
                                >
                                    <td className="py-2.5 pr-4">
                                        <div className="flex items-center gap-1.5 text-zinc-200">
                                            <Hash
                                                size={12}
                                                className="text-zinc-500"
                                            />
                                            {b.batch_identifier}
                                        </div>
                                    </td>
                                    <td className="py-2.5 pr-4 font-mono font-bold text-zinc-50">
                                        {Number(
                                            b.quantity,
                                        ).toLocaleString()}
                                    </td>
                                    <td className="py-2.5 pr-4">
                                        <div className="flex items-center gap-1.5 text-zinc-300">
                                            <MapPin
                                                size={12}
                                                className="text-zinc-500"
                                            />
                                            {b.location || "—"}
                                        </div>
                                    </td>
                                    {isPerishable && (
                                        <>
                                            <td className="py-2.5 pr-4">
                                                {expiry ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-zinc-300">
                                                            {new Date(
                                                                expiry,
                                                            ).toLocaleDateString()}
                                                        </span>
                                                        {expiryInfo?.labelKey && (
                                                            <Badge
                                                                variant={expiryInfo.variant}
                                                            >
                                                                {t(expiryInfo.labelKey)}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-zinc-500">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                            <td
                                                className="py-2.5"
                                                data-testid={`days-remaining-${b.id}`}
                                                data-expiry-bucket={expiryInfo?.bucket ?? "none"}
                                            >
                                                {expiryInfo ? (
                                                    <span className={expiryInfo.textClass}>
                                                        {expiryInfo.daysText(t)}
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-500">—</span>
                                                )}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
