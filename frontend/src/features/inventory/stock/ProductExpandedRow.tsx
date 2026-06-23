import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import type { ProductStockRow } from "./types";

// ── Expanded Row (per-location breakdown) ──────────────────────────────

export const ProductExpandedRow = ({ product }: { product: ProductStockRow }) => {
    const { t } = useTranslation(["inventory", "common"]);
    const breakdown = product.stock_breakdown;
    const entries = Object.entries(breakdown).sort(([, a], [, b]) => b - a);

    if (entries.length === 0) {
        return (
            <div className="p-4 text-center text-zinc-500 italic">
                {t("stock.noStockAnyLocation")}
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/50 p-4 border-t border-indigo-500/20">
            <h4 className="text-xs font-medium text-indigo-400 uppercase mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                {t("stock.perLocationBreakdown")}
            </h4>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("stock.location")}</TableHead>
                        <TableHead className="text-right">{t("stock.quantity")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {entries.map(([locName, qty]) => (
                        <TableRow key={locName}>
                            <TableCell className="text-zinc-200">
                                <span className="flex items-center gap-2">
                                    <MapPin size={14} className="text-zinc-500" />
                                    {locName}
                                </span>
                            </TableCell>
                            <TableCell className="text-right text-indigo-300 font-semibold">
                                {Number(qty).toLocaleString()}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {product.tracking_mode === "BATCH" && Array.isArray(product.stock_value) && product.stock_value.length > 0 && (
                <div className="mt-4">
                    <h4 className="text-xs font-medium text-cyan-400 uppercase mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-500" />
                        {t("stock.batchDetails")}
                    </h4>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("stock.batchId")}</TableHead>
                                <TableHead>{t("stock.location")}</TableHead>
                                <TableHead className="text-right">{t("stock.quantity")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {product.stock_value.map((batch) => (
                                <TableRow key={batch.id}>
                                    <TableCell className="text-zinc-200 font-mono text-sm">
                                        {batch.batch_identifier}
                                    </TableCell>
                                    <TableCell className="text-zinc-400">
                                        {batch.location || "—"}
                                    </TableCell>
                                    <TableCell className="text-right text-cyan-300 font-semibold">
                                        {batch.qty}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {product.tracking_mode === "INDIVIDUAL" && (
                <div className="mt-3">
                    <Link
                        to={`/stock?product=${product.id}`}
                        className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                        {t("stock.viewIndividualItems")} →
                    </Link>
                </div>
            )}
        </div>
    );
};
