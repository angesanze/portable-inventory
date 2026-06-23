import { useOne, useCustom, useList } from "@refinedev/core";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Edit2, ExternalLink } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { itemStatusVariant as statusVariant } from "../../../utils/inventoryBadges";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { DetailPage } from "../../../components/ui/DetailPage";
import { KeyValueGrid } from "../../../components/ui/KeyValueGrid";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { API_URL } from "../../../config";
import type {
    PhysicalProductDetail,
    StockLevelDetail,
    StockMovementRow,
} from "./types";

type HistoryRow = {
    id: string;
    occurred_at: string;
    reason: string;
    user: string | null;
    from_location: string | null;
    to_location: string | null;
    quantity: number;
};

const STATUS_REASON_RE = /^Status:\s+([A-Z_]+)\s+→\s+([A-Z_]+)(?:\s+—\s+(.+))?$/;

function parseStatusReason(reason: string) {
    const match = reason.match(STATUS_REASON_RE);
    if (!match) return null;
    return { from: match[1], to: match[2], notes: match[3] ?? null };
}

function formatPresetValue(val: unknown, t: (key: string) => string): string {
    if (typeof val === "boolean") return val ? t("common:yes") : t("common:no");
    if (val === null || val === undefined) return "—";
    if (Array.isArray(val))
        return val.length === 0 ? "—" : val.map((v) => formatPresetValue(v, t)).join(", ");
    if (typeof val === "object") {
        const entries = Object.entries(val as Record<string, unknown>);
        if (entries.length === 0) return "—";
        return entries.map(([k, v]) => `${k} → ${formatPresetValue(v, t)}`).join("; ");
    }
    return String(val);
}

export const PhysicalProductShow = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const { id } = useParams();
    const navigate = useNavigate();

    const { data, isLoading, error } = useOne<PhysicalProductDetail>({
        resource: "physical-products",
        id: id as string,
        queryOptions: { enabled: !!id },
    });

    const { data: historyData, isLoading: historyLoading } = useCustom<{
        results?: HistoryRow[];
    }>({
        url: `${API_URL}/api/v1/physical-products/${id}/history/`,
        method: "get",
        queryOptions: { enabled: !!id },
    });

    const itemForLevel = data?.data;
    const modelIdForLevel =
        typeof itemForLevel?.product_model === "string"
            ? itemForLevel.product_model
            : itemForLevel?.product_model?.id;
    const { data: levelData } = useCustom<StockLevelDetail>({
        url: `${API_URL}/api/v1/stock/${modelIdForLevel}/level/`,
        method: "get",
        queryOptions: { enabled: !!modelIdForLevel },
    });
    const statusCounts: Record<string, number> | undefined =
        levelData?.data?.status_counts;

    const { data: movementsData, isLoading: movementsLoading } = useList<StockMovementRow>({
        resource: "movements",
        filters: id
            ? [{ field: "physical_product", operator: "eq", value: id }]
            : [],
        sorters: [{ field: "occurred_at", order: "desc" }],
        pagination: { pageSize: 20 },
        queryOptions: { enabled: !!id },
    });

    const movementRows: StockMovementRow[] = Array.isArray(movementsData?.data)
        ? movementsData.data
        : [];

    const item = data?.data;
    const historyRows: HistoryRow[] = historyData?.data?.results ?? [];
    const statusHistory = historyRows
        .filter((r) => r.reason?.startsWith("Status:"))
        .map((r) => ({ row: r, parsed: parseStatusReason(r.reason) }))
        .filter((entry) => entry.parsed !== null);

    if (error) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <FormErrorBanner title={t("stock.loadError")} error={error} />
            </div>
        );
    }

    if (!item && !isLoading) {
        return (
            <div className="p-8 text-center text-zinc-500">
                {t("stock.show.notFound")}
            </div>
        );
    }

    const modelId =
        typeof item?.product_model === "string"
            ? item.product_model
            : item?.product_model?.id;
    const modelName =
        item?.product_model_name ||
        (typeof item?.product_model === "object" ? item.product_model?.name : "") ||
        item?.product_model_details?.name;
    const modelSku =
        (typeof item?.product_model === "object" ? item.product_model?.sku : "") ||
        item?.product_model_details?.sku;
    const locationId =
        typeof item?.location === "string"
            ? item.location
            : item?.location?.id;
    const locationName =
        item?.location_name ||
        (typeof item?.location === "object" ? item.location?.name : "");
    const attributes: Record<string, unknown> | null | undefined =
        item?.data || item?.attributes;
    const widgetHref = modelId ? `/widget?product_id=${modelId}` : null;

    return (
        <DetailPage
            title={item?.identifier ?? ""}
            badges={
                item?.status
                    ? [{ label: item.status, variant: statusVariant(item.status) }]
                    : []
            }
            actions={
                <Button
                    variant="secondary"
                    icon={Edit2}
                    onClick={() => navigate(`/stock/edit/${id}`)}
                >
                    {t("common:edit")}
                </Button>
            }
            isLoading={isLoading}
        >
            <Card
                header={
                    <h3 className="text-sm font-semibold text-zinc-200">
                        {t("stock.show.title")}
                    </h3>
                }
            >
                <KeyValueGrid
                    items={[
                        {
                            label: t("stock.show.identifier"),
                            value: item?.identifier ? (
                                <span className="font-mono">{item.identifier}</span>
                            ) : undefined,
                        },
                        {
                            label: t("stock.show.model"),
                            value: modelId ? (
                                <Link
                                    to={`/products/${modelId}`}
                                    className="text-indigo-400 hover:text-indigo-300"
                                >
                                    {modelName || modelSku || modelId}
                                    {modelSku && modelName ? (
                                        <span className="ml-2 text-xs text-zinc-500 font-mono">
                                            {modelSku}
                                        </span>
                                    ) : null}
                                </Link>
                            ) : (
                                modelName || undefined
                            ),
                        },
                        {
                            label: t("stock.show.location"),
                            value: locationId ? (
                                <Link
                                    to={`/locations/${locationId}`}
                                    className="text-indigo-400 hover:text-indigo-300"
                                >
                                    {locationName || locationId}
                                </Link>
                            ) : (
                                locationName || undefined
                            ),
                        },
                        {
                            label: t("stock.show.currentStatus"),
                            value: item?.status ? (
                                <div
                                    className="flex flex-wrap items-center gap-2"
                                    data-testid="status-counts-row"
                                >
                                    <Badge variant={statusVariant(item.status)} dot>
                                        {item.status}
                                    </Badge>
                                    {statusCounts &&
                                        Object.entries(statusCounts)
                                            .filter(([, n]) => Number(n) > 0)
                                            .map(([status, count]) => (
                                                <span
                                                    key={status}
                                                    data-testid={`status-count-${status}`}
                                                    className="inline-flex items-center gap-1 text-xs text-zinc-400"
                                                >
                                                    <Badge variant={statusVariant(status)} dot>
                                                        {status}
                                                    </Badge>
                                                    <span className="font-mono text-zinc-300">
                                                        {count}
                                                    </span>
                                                </span>
                                            ))}
                                </div>
                            ) : undefined,
                        },
                        {
                            label: t("common:created"),
                            value: item?.created_at
                                ? new Date(item.created_at).toLocaleString()
                                : undefined,
                        },
                        {
                            label: t("common:updated"),
                            value: item?.updated_at
                                ? new Date(item.updated_at).toLocaleString()
                                : undefined,
                        },
                        {
                            label: t("stock.show.batchIdentifier"),
                            value: item?.batch_identifier || undefined,
                        },
                        {
                            label: t("stock.show.workOrder"),
                            value: item?.work_order_name || item?.work_order || undefined,
                        },
                    ]}
                />
            </Card>

            {attributes && Object.keys(attributes).length > 0 && (
                <Card
                    header={
                        <h3 className="text-sm font-semibold text-zinc-200">
                            {t("stock.show.attributes")}
                        </h3>
                    }
                >
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(attributes).map(([key, val]) => (
                            <span
                                key={key}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-xs text-indigo-300 border border-indigo-500/20"
                            >
                                <span className="font-medium">{key}:</span>{" "}
                                {formatPresetValue(val, t)}
                            </span>
                        ))}
                    </div>
                </Card>
            )}

            <Card
                header={
                    <h3 className="text-sm font-semibold text-zinc-200">
                        {t("stock.show.history")}
                    </h3>
                }
            >
                {historyLoading ? (
                    <p className="text-sm text-zinc-500">
                        {t("stock.show.historyLoading")}
                    </p>
                ) : statusHistory.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                        {t("stock.show.historyEmpty")}
                    </p>
                ) : (
                    <ol className="space-y-3">
                        {statusHistory.map(({ row, parsed }) => (
                            <li
                                key={row.id}
                                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 border-b border-zinc-800 pb-3 last:border-0 last:pb-0"
                            >
                                <span className="text-xs text-zinc-500 font-mono sm:w-44 shrink-0">
                                    {new Date(row.occurred_at).toLocaleString()}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <Badge variant={statusVariant(parsed!.from)} dot>
                                        {parsed!.from}
                                    </Badge>
                                    <span className="text-zinc-500">→</span>
                                    <Badge variant={statusVariant(parsed!.to)} dot>
                                        {parsed!.to}
                                    </Badge>
                                </span>
                                <span className="text-sm text-zinc-400 flex-1">
                                    {parsed!.notes ? (
                                        <span className="italic">{parsed!.notes}</span>
                                    ) : null}
                                </span>
                                {row.user && (
                                    <span className="text-xs text-zinc-500">
                                        {row.user}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ol>
                )}
            </Card>

            <Card
                header={
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-zinc-200">
                            {t("stock.show.movements")}
                        </h3>
                        {id && (
                            <Link
                                to={`/movements?physical_product=${id}`}
                                className="text-xs text-indigo-400 hover:text-indigo-300"
                            >
                                {t("stock.show.movementsSeeAll")}
                            </Link>
                        )}
                    </div>
                }
            >
                {movementsLoading ? (
                    <p className="text-sm text-zinc-500">
                        {t("stock.show.movementsLoading")}
                    </p>
                ) : movementRows.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                        {t("stock.show.movementsEmpty")}
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("movements.timestamp")}</TableHead>
                                <TableHead>{t("movements.reason")}</TableHead>
                                <TableHead>{t("movements.fromLocationCol")}</TableHead>
                                <TableHead>{t("movements.toLocationCol")}</TableHead>
                                <TableHead className="text-right">
                                    {t("movements.quantity")}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {movementRows.map((move) => {
                                const qty = Number(move?.quantity ?? 0);
                                const fromName =
                                    move?.from_location?.name ||
                                    move?.from_location_name ||
                                    "—";
                                const toName =
                                    move?.to_location?.name ||
                                    move?.to_location_name ||
                                    "—";
                                return (
                                    <TableRow key={move.id}>
                                        <TableCell className="font-mono text-xs text-zinc-400 whitespace-nowrap">
                                            {move.occurred_at
                                                ? new Date(move.occurred_at).toLocaleString()
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-300">
                                            {move.reason || "—"}
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-400">
                                            {fromName}
                                        </TableCell>
                                        <TableCell className="text-sm text-zinc-400">
                                            {toName}
                                        </TableCell>
                                        <TableCell className="text-right text-sm">
                                            {qty === 0 ? (
                                                <span className="text-zinc-500">—</span>
                                            ) : (
                                                <span
                                                    className={
                                                        qty < 0
                                                            ? "text-rose-400 font-semibold"
                                                            : "text-emerald-400 font-semibold"
                                                    }
                                                >
                                                    {qty > 0 ? `+${qty}` : qty}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </Card>

            {widgetHref && (
                <div>
                    <Link
                        to={widgetHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"
                    >
                        <ExternalLink size={14} />
                        {t("stock.show.openInWidget")}
                    </Link>
                </div>
            )}
        </DetailPage>
    );
};
