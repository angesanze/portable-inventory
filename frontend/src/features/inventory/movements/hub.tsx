import { useList } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { PageHeader } from "../../../components/ui/PageHeader";
import { MovementTypePicker } from "./components/MovementTypePicker";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import type { MovementListRow } from "./listTypes";

/** Minimal shape needed to derive a movement's direction (location routing). */
type MovementDirectionInput = Pick<MovementListRow, "from_location" | "to_location">;

function directionBadge(move: MovementDirectionInput, t: TFunction): { label: string; variant: BadgeVariant } {
    const fromType = move.from_location?.type;
    const toType = move.to_location?.type;

    const isRealFrom = fromType && fromType !== "VIRTUAL" && fromType !== "LOSS";
    const isRealTo = toType && toType !== "VIRTUAL" && toType !== "LOSS";
    if (isRealFrom && isRealTo) {
        return { label: t("movements.transfer"), variant: "cyan" };
    }
    if (isRealFrom) {
        return { label: t("movements.outboundShort"), variant: "rose" };
    }
    if (isRealTo) {
        return { label: t("movements.inboundShort"), variant: "emerald" };
    }
    return { label: t("movements.movement"), variant: "neutral" };
}

export const MovementHub = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const { data: listData, isLoading } = useList<MovementListRow>({
        resource: "movements",
        sorters: [{ field: "occurred_at", order: "desc" }],
        pagination: { pageSize: 5 },
    });

    const movements = Array.isArray(listData?.data) ? listData.data : [];

    return (
        <div>
            <PageHeader
                title={t("movements.title")}
                subtitle={t("movements.hubDesc")}
            />

            <MovementTypePicker />

            {/* Recent Movements */}
            <div className="mt-8">
                <h2 className="text-lg font-medium text-zinc-200 mb-3">
                    {t("movements.recentMovements")}
                </h2>

                {isLoading ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("movements.timestamp")}</TableHead>
                                <TableHead>{t("movements.product")}</TableHead>
                                <TableHead>{t("movements.direction")}</TableHead>
                                <TableHead className="text-right">{t("movements.qty")}</TableHead>
                                <TableHead>{t("movements.from")}</TableHead>
                                <TableHead>{t("movements.to")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <SkeletonRow columns={6} />
                        </TableBody>
                    </Table>
                ) : movements.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4">
                        {t("movements.hubEmpty")}
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("movements.timestamp")}</TableHead>
                                <TableHead>{t("movements.product")}</TableHead>
                                <TableHead>{t("movements.direction")}</TableHead>
                                <TableHead className="text-right">{t("movements.qty")}</TableHead>
                                <TableHead>{t("movements.from")}</TableHead>
                                <TableHead>{t("movements.to")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {movements.map((move) => {
                                const dir = directionBadge(move, t);
                                const qty = move.quantity ?? move.delta ?? 0;
                                const isNegative = Number(qty) < 0;

                                return (
                                    <TableRow key={move.id}>
                                        <TableCell className="font-mono text-zinc-400 text-xs whitespace-nowrap">
                                            {new Date(move.occurred_at).toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-medium text-zinc-200">
                                                {move.product_name || move.product_model?.name || t("movements.unknown")}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={dir.variant} dot>
                                                {dir.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span
                                                className={`inline-flex items-center gap-1 font-semibold ${
                                                    isNegative ? "text-rose-400" : "text-emerald-400"
                                                }`}
                                            >
                                                {isNegative ? (
                                                    <ArrowDownLeft size={14} />
                                                ) : (
                                                    <ArrowUpRight size={14} />
                                                )}
                                                {isNegative ? "" : "+"}
                                                {qty}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-zinc-400 text-sm">
                                            {move.from_location?.name || t("movements.external")}
                                        </TableCell>
                                        <TableCell className="text-zinc-400 text-sm">
                                            {move.to_location?.name || t("movements.external")}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
};
