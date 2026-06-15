import {
    useOne,
    useList,
    useCustom,
    useDelete,
} from "@refinedev/core";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    Layers,
    MapPin,
    ArrowRight,
    Activity,
    Edit2,
    Trash2,
    Package,
    Plus,
    ArrowRightLeft,
    Hash,
    Clock,
    AlertTriangle,
    Ruler,
} from "lucide-react";
import { API_URL } from "../../../config";
import { PROFILE_METADATA } from "../../../types/api";
import type { InventoryProfile } from "../../../types/api";
import { Badge } from "../../../components/ui/Badge";
import { itemStatusVariant, profileVariant } from "../../../utils/inventoryBadges";
import { Skeleton, SkeletonList } from "../../../components/ui/Skeleton";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { DetailPage } from "../../../components/ui/DetailPage";
import { KeyValueGrid } from "../../../components/ui/KeyValueGrid";
import {
    ConfirmDialog,
    useConfirmDialog,
} from "../../../components/ui/ConfirmDialog";

/* ── Profile-aware inventory sub-components ────────────────────────── */

function StatusCountsRow({ counts }: { counts: Record<string, number> }) {
    const entries = Object.entries(counts).filter(([, n]) => Number(n) > 0);
    if (entries.length === 0) return null;
    return (
        <div
            className="flex flex-wrap items-center gap-2"
            data-testid="status-counts-row"
        >
            {entries.map(([status, count]) => (
                <span
                    key={status}
                    data-testid={`status-count-${status}`}
                    className="inline-flex items-center gap-1 text-xs"
                >
                    <Badge variant={itemStatusVariant(status)} dot>
                        {status}
                    </Badge>
                    <span className="font-mono text-zinc-300">{count}</span>
                </span>
            ))}
        </div>
    );
}

function InventoryActionButton({
    profile,
    productId,
    navigate,
}: {
    profile: string;
    productId: string;
    navigate: (path: string) => void;
}) {
    const { t } = useTranslation("products");
    const meta = PROFILE_METADATA[profile as InventoryProfile];
    if (!meta) return null;

    if (meta.trackingMode === "INDIVIDUAL") {
        return (
            <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => navigate(`/stock/create?product=${productId}`)}
            >
                {t("registerNewItem")}
            </Button>
        );
    }

    return (
        <Button
            variant="secondary"
            size="sm"
            icon={ArrowRightLeft}
            onClick={() => navigate(`/movements/create?product=${productId}`)}
        >
            {meta.trackingMode === "BATCH"
                ? t("recordBatchMovement")
                : t("recordMovement")}
        </Button>
    );
}

function LocationBreakdown({ breakdown }: { breakdown: Record<string, any> }) {
    const { t } = useTranslation("products");
    return (
        <div className="mt-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {t("byLocation")}
            </h4>
            <div className="space-y-2">
                {Object.entries(breakdown).map(
                    ([location, qty]: [string, any]) => (
                        <div
                            key={location}
                            className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                        >
                            <div className="flex items-center gap-2 text-sm text-zinc-300">
                                <MapPin size={14} className="text-zinc-500" />
                                {location}
                            </div>
                            <span className="font-mono font-bold text-zinc-50">
                                {Number(qty).toLocaleString()}
                            </span>
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}

/** RMA-08: stock physically held in quarantine (non-sellable) locations. */
function QuarantineSection({
    total,
    breakdown,
}: {
    total: number;
    breakdown: Record<string, any>;
}) {
    const { t } = useTranslation(["returns", "products"]);
    return (
        <div className="mt-4" data-testid="quarantine-section">
            <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">
                {t("returns:inQuarantine")}{" "}
                <span className="font-mono">({Number(total).toLocaleString()})</span>
            </h4>
            <div className="space-y-2">
                {Object.entries(breakdown).map(
                    ([location, qty]: [string, any]) => (
                        <div
                            key={location}
                            className="flex items-center justify-between p-3 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg"
                        >
                            <div className="flex items-center gap-2 text-sm text-zinc-300">
                                <MapPin size={14} className="text-amber-400/70" />
                                {location}
                            </div>
                            <span className="font-mono font-bold text-amber-200">
                                {Number(qty).toLocaleString()}
                            </span>
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}

function BatchDetail({
    batches,
    profile,
}: {
    batches: any[];
    profile: string;
}) {
    const { t } = useTranslation("products");
    const isPerishable = profile === "PERISHABLE";

    if (batches.length === 0) {
        return (
            <p className="text-sm text-zinc-500">{t("noActiveBatches")}</p>
        );
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
                        {batches.map((b: any) => {
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

type ExpiryBucket = "expired" | "critical" | "warning" | "ok";

interface ExpiryInfo {
    bucket: ExpiryBucket;
    variant: "rose" | "amber" | "emerald" | "slate";
    textClass: string;
    labelKey: "expired" | "expiringSoon" | null;
    daysText: (t: (key: string, opts?: any) => string) => string;
}

function getExpiryInfo(expiry: string | undefined): ExpiryInfo | null {
    if (!expiry) return null;
    const now = new Date();
    const exp = new Date(expiry);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / msPerDay);

    if (exp <= now) {
        return {
            bucket: "expired",
            variant: "slate",
            textClass: "text-zinc-500",
            labelKey: "expired",
            daysText: (t) => t("expired"),
        };
    }
    if (diffDays <= 7) {
        return {
            bucket: "critical",
            variant: "rose",
            textClass: "text-rose-400 font-semibold",
            labelKey: "expiringSoon",
            daysText: (t) => t("daysRemainingValue", { count: diffDays }),
        };
    }
    if (diffDays <= 30) {
        return {
            bucket: "warning",
            variant: "amber",
            textClass: "text-amber-400",
            labelKey: null,
            daysText: (t) => t("daysRemainingValue", { count: diffDays }),
        };
    }
    return {
        bucket: "ok",
        variant: "emerald",
        textClass: "text-emerald-400",
        labelKey: null,
        daysText: (t) => t("daysRemainingValue", { count: diffDays }),
    };
}

function ItemsDetail({ items }: { items: any[] }) {
    const { t } = useTranslation(["products", "common"]);
    if (items.length === 0) {
        return (
            <p className="text-sm text-zinc-500">
                {t("products:noItems")}
            </p>
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
                        {items.map((item: any) => (
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

function DimensionalConfigCard({
    engineConfig,
    stockTotal,
}: {
    engineConfig: Record<string, any> | undefined;
    stockTotal: number | undefined;
}) {
    const { t } = useTranslation("products");
    const dimensions: string[] = Array.isArray(engineConfig?.dimensions)
        ? engineConfig!.dimensions
        : [];
    const unit: string = engineConfig?.unit ?? "";
    const computedUnit: string = engineConfig?.computed_unit || unit;
    const formula: string = engineConfig?.formula ?? "";

    const formattedTotal = (() => {
        if (stockTotal === undefined || stockTotal === null) return null;
        const val = Number(stockTotal);
        if (!Number.isFinite(val) || val === 0) return null;
        const text =
            val === Math.trunc(val) ? `${val}` : val.toFixed(2);
        return `${text} ${computedUnit}`.trim();
    })();

    return (
        <Card
            header={
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <Ruler size={16} className="text-indigo-400" />
                    {t("dimensionalConfig")}
                </h3>
            }
        >
            <KeyValueGrid
                items={[
                    {
                        label: t("dimensionsLabel"),
                        value: dimensions.length > 0
                            ? dimensions.join(" × ")
                            : undefined,
                    },
                    {
                        label: t("baseUnit"),
                        value: unit || undefined,
                    },
                    {
                        label: t("computedUnit"),
                        value: computedUnit || undefined,
                    },
                    {
                        label: t("formula"),
                        value: formula
                            ? <code className="font-mono text-indigo-300">{formula}</code>
                            : undefined,
                        span: 3,
                    },
                ]}
            />
            <div className="mt-4 p-3 bg-white/5 rounded-lg">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    {t("currentMeasure")}
                </div>
                {formattedTotal ? (
                    <span className="text-2xl font-bold text-zinc-50 font-mono">
                        {formattedTotal}
                    </span>
                ) : (
                    <span className="text-sm text-zinc-500 italic">
                        {t("noMeasurementYet")}
                    </span>
                )}
            </div>
        </Card>
    );
}

export const ProductModelShow = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation(["products", "common"]);
    const { mutate: deleteModel } = useDelete();
    const { confirm, dialogProps } = useConfirmDialog();

    const { data: record, isLoading } = useOne({
        resource: "product-models",
        id: id as string,
        queryOptions: { enabled: !!id },
    });

    const {
        data: stockData,
        isLoading: isLoadingStock,
    } = useCustom({
        url: `${API_URL}/api/v1/stock/${id}/level`,
        method: "get",
        queryOptions: { enabled: !!id },
    });

    const {
        data: movementsData,
        isLoading: isLoadingMovements,
    } = useList({
        resource: "movements",
        filters: [{ field: "product_model", operator: "eq", value: id }],
        sorters: [{ field: "occurred_at", order: "desc" }],
        pagination: { current: 1, pageSize: 10 },
    });

    const model = record?.data as any;
    const stock = stockData?.data as any;
    const movements = Array.isArray(movementsData?.data)
        ? movementsData.data
        : [];

    if (!model && !isLoading) {
        return (
            <div className="p-8 text-center text-zinc-500">
                {t("products:productModelNotFound")}
            </div>
        );
    }

    const profileMeta = model?.profile
        ? PROFILE_METADATA[model.profile as InventoryProfile]
        : undefined;
    const profileLabel = profileMeta?.label ?? t("products:unknownProfile");

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: t("products:deleteProductModel"),
            message: t("products:deleteProductConfirm", { name: model?.name }),
            confirmLabel: t("common:delete"),
            variant: "danger",
        });
        if (confirmed) {
            deleteModel(
                { resource: "product-models", id: id as string },
                { onSuccess: () => navigate("/products") },
            );
        }
    };

    return (
        <>
            <DetailPage
                title={model?.name ?? ""}
                subtitle={model?.sku}
                badges={[
                    {
                        label: profileLabel,
                        variant: profileVariant(model?.profile),
                    },
                ]}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={Edit2}
                            onClick={() => navigate(`/products/edit/${id}`)}
                        >
                            {t("common:edit")}
                        </Button>
                        <Button
                            variant="danger"
                            icon={Trash2}
                            onClick={handleDelete}
                        >
                            {t("common:delete")}
                        </Button>
                    </>
                }
                isLoading={isLoading}
            >
                {/* Details */}
                <Card
                    header={
                        <h3 className="text-sm font-semibold text-zinc-200">
                            {t("products:details")}
                        </h3>
                    }
                >
                    <KeyValueGrid
                        items={[
                            { label: t("common:name"), value: model?.name },
                            { label: t("products:sku"), value: model?.sku },
                            {
                                label: t("common:description"),
                                value: model?.description,
                                span: 3,
                            },
                            { label: t("products:profileColumn"), value: profileLabel },
                            {
                                label: t("products:profileType"),
                                value: profileMeta?.description,
                                span: 2,
                            },
                            {
                                label: t("common:created"),
                                value: model?.created_at
                                    ? new Date(
                                          model.created_at,
                                      ).toLocaleString()
                                    : undefined,
                            },
                            {
                                label: t("common:updated"),
                                value: model?.updated_at
                                    ? new Date(
                                          model.updated_at,
                                      ).toLocaleString()
                                    : undefined,
                            },
                        ]}
                    />
                </Card>

                {/* DIMENSIONAL: configured dimensions/unit/formula + computed value */}
                {model?.profile === "DIMENSIONAL" && (
                    <DimensionalConfigCard
                        engineConfig={model?.engine_config}
                        stockTotal={stock?.total}
                    />
                )}

                {/* Current Inventory */}
                <Card
                    header={
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                <Layers size={16} className="text-emerald-400" />
                                {t("products:currentInventory")}
                            </h3>
                            {model && (
                                <InventoryActionButton
                                    profile={model.profile}
                                    productId={id as string}
                                    navigate={navigate}
                                />
                            )}
                        </div>
                    }
                >
                    {isLoadingStock ? (
                        <div className="space-y-3">
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    ) : stock ? (
                        <div className="space-y-4">
                            {/* Total */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-baseline gap-3">
                                    <span className="text-3xl font-bold text-zinc-50">
                                        {Number(
                                            stock.total || 0,
                                        ).toLocaleString()}
                                    </span>
                                    <span className="text-zinc-500 text-sm">
                                        {stock.tracking_mode === "INDIVIDUAL"
                                            ? t("products:items")
                                            : t("products:totalUnits")}
                                    </span>
                                </div>
                            </div>

                            {/* Physical / Reserved / Available split (RESERVATIONS-01) —
                                rendered only when the level endpoint exposes the fields. */}
                            {stock.reserved != null && stock.available != null && (
                                <div
                                    className="grid grid-cols-3 gap-3"
                                    data-testid="stock-level-split"
                                >
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                                            {t("products:physicalStock")}
                                        </div>
                                        <span className="text-lg font-bold text-zinc-200 font-mono">
                                            {Number(stock.total || 0).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-amber-500/5 rounded-lg">
                                        <div className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-1">
                                            {t("products:reservedStock")}
                                        </div>
                                        <span className="text-lg font-bold text-amber-300 font-mono">
                                            {Number(stock.reserved || 0).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-emerald-500/5 rounded-lg">
                                        <div className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider mb-1">
                                            {t("products:availableStock")}
                                        </div>
                                        <span
                                            className={`text-lg font-bold font-mono ${
                                                Number(stock.available) > 0
                                                    ? "text-emerald-300"
                                                    : "text-rose-400"
                                            }`}
                                        >
                                            {Number(stock.available || 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* BULK: Location breakdown */}
                            {stock.tracking_mode !== "BATCH" &&
                                stock.tracking_mode !== "INDIVIDUAL" &&
                                stock.breakdown &&
                                Object.keys(stock.breakdown).length > 0 && (
                                    <LocationBreakdown
                                        breakdown={stock.breakdown}
                                    />
                                )}

                            {/* BATCH: Batch list */}
                            {stock.tracking_mode === "BATCH" && (
                                <BatchDetail
                                    batches={stock.batches || []}
                                    profile={stock.profile}
                                />
                            )}

                            {/* SERIALIZED: per-status breakdown + items list */}
                            {stock.tracking_mode === "INDIVIDUAL" && (
                                <>
                                    {stock.status_counts && (
                                        <StatusCountsRow counts={stock.status_counts} />
                                    )}
                                    <ItemsDetail items={stock.items || []} />
                                </>
                            )}

                            {/* RMA-08: quarantine (non-sellable) holdings */}
                            {Number(stock.quarantine_total || 0) > 0 &&
                                stock.quarantine_breakdown && (
                                    <QuarantineSection
                                        total={Number(stock.quarantine_total)}
                                        breakdown={stock.quarantine_breakdown}
                                    />
                                )}
                        </div>
                    ) : (
                        <div className="text-zinc-500">
                            {t("products:noStockData")}
                        </div>
                    )}
                </Card>

                {/* Recent Movements */}
                <Card
                    padding="none"
                    header={
                        <div className="flex justify-between items-center gap-3">
                            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                <Activity
                                    size={16}
                                    className="text-cyan-400"
                                />
                                {t("products:recentMovements")}
                            </h3>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                                    {t("products:lastN", { value: movements.length })}
                                </span>
                                {id && (
                                    <Link
                                        to={`/movements?product_model=${id}`}
                                        className="text-xs text-indigo-400 hover:text-indigo-300"
                                    >
                                        {t("products:movementsSeeAll")}
                                    </Link>
                                )}
                            </div>
                        </div>
                    }
                >
                    {isLoadingMovements ? (
                        <SkeletonList items={3} />
                    ) : movements.length === 0 ? (
                        <div className="p-8 text-center">
                            <Activity
                                size={32}
                                className="mx-auto mb-3 text-zinc-600"
                            />
                            <p className="text-zinc-500">
                                {t("products:noMovements")}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.06]">
                            {movements.map((m: any) => {
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
                                                            m.from_location
                                                                ?.name || "—"}
                                                    </span>
                                                    <ArrowRight
                                                        size={12}
                                                        className="text-zinc-600"
                                                    />
                                                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-300">
                                                        {m.to_location?.name ||
                                                            "—"}
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
                                                    variant={
                                                        isPositive
                                                            ? "emerald"
                                                            : "rose"
                                                    }
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

                {/* Components / Kit */}
                {model?.components && model.components.length > 0 && (
                    <Card
                        header={
                            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                <Package
                                    size={16}
                                    className="text-indigo-400"
                                />
                                {t("products:components")}
                            </h3>
                        }
                    >
                        <div className="space-y-2">
                            {model.components.map(
                                (comp: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                                    >
                                        <span className="text-sm text-zinc-200">
                                            {comp.child_name || comp.child}
                                        </span>
                                        <span className="font-mono text-indigo-400 font-bold text-sm">
                                            x
                                            {Number(
                                                comp.quantity,
                                            ).toLocaleString()}
                                        </span>
                                    </div>
                                ),
                            )}
                        </div>
                    </Card>
                )}
            </DetailPage>

            <ConfirmDialog {...dialogProps} />
        </>
    );
};
