import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
    Area,
    Bar,
    CartesianGrid,
    ComposedChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { useOne, useUpdate } from "@refinedev/core";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useToast } from "../../../components/ui/Toast";
import { useCapabilities } from "../../../hooks/useCapabilities";
import { useProductSeries } from "./useProductSeries";
import type { Bucket, Card } from "./types";

const bucketVariant: Record<Bucket, BadgeVariant> = {
    HEALTHY: "emerald",
    REORDER: "amber",
    CRITICAL: "red",
    OUT: "slate",
    OVERSTOCK: "cyan",
};

export type Tab = "history" | "velocity" | "thresholds";
type Period = 30 | 90;

interface SeriesPoint {
    date: string;
    on_hand: number;
    inbound: number;
    outbound: number;
}

interface SeriesResponse {
    product_id: string;
    days: number;
    series: SeriesPoint[];
    velocity: { "7d": number; "30d": number; "90d": number };
    projection: {
        current_qty: number;
        daily_burn: number;
        days_to_reorder: number | null;
        days_to_critical: number | null;
        days_to_out: number | null;
        suggested_reorder_qty: number | null;
    };
}

interface ProductDrawerProps {
    card: Card | null;
    onClose: () => void;
    onSaved?: () => void;
    initialTab?: Tab;
}

const fmtDays = (v: number | null) => (v == null ? "∞" : v < 1 ? "<1" : v.toFixed(1));
const fmtQty = (v: number | null) => (v == null ? "—" : v.toFixed(0));
const fmtRate = (v: number) => `${v.toFixed(2)}/d`;

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
    const [period, setPeriod] = useState<Period>(90);

    const { data, isLoading } = useProductSeries(card.id, period) as {
        data?: { data: SeriesResponse };
        isLoading: boolean;
    };
    const payload = data?.data;

    const reorderT = card.reorder_threshold ?? null;
    const criticalT = reorderT != null ? reorderT / 2 : null;

    const chartData = useMemo(() => {
        const series = payload?.series ?? [];
        return series.map((p) => ({
            date: p.date.slice(5),
            on_hand: p.on_hand,
            inbound: p.inbound,
            outbound: -p.outbound,
        }));
    }, [payload]);

    const allZero = useMemo(
        () =>
            chartData.length === 0 ||
            chartData.every(
                (p) => p.on_hand === 0 && p.inbound === 0 && p.outbound === 0,
            ),
        [chartData],
    );

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

                <nav
                    role="tablist"
                    className="flex border-b border-white/[0.06] px-2"
                >
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

interface HistoryTabProps {
    isLoading: boolean;
    chartData: { date: string; on_hand: number; inbound: number; outbound: number }[];
    allZero: boolean;
    period: Period;
    setPeriod: (p: Period) => void;
    reorderT: number | null;
    criticalT: number | null;
}

const HistoryTab = ({
    isLoading,
    chartData,
    allZero,
    period,
    setPeriod,
    reorderT,
    criticalT,
}: HistoryTabProps) => {
    const { t } = useTranslation(["restock", "common"]);
    return (
        <div className="space-y-4">
            <div
                className="inline-flex rounded-lg border border-white/[0.06] overflow-hidden"
                role="group"
                aria-label={t("drawer.period", { defaultValue: "Period" })}
            >
                {[30, 90].map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setPeriod(d as Period)}
                        className={`px-3 py-1 text-xs ${
                            period === d
                                ? "bg-indigo-500/20 text-indigo-300"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        data-testid={`period-${d}`}
                    >
                        {d}d
                    </button>
                ))}
            </div>

            {isLoading ? (
                <Skeleton className="h-[260px] w-full" />
            ) : allZero ? (
                <div className="h-[260px] flex items-center justify-center text-sm text-zinc-500 border border-dashed border-white/[0.06] rounded-lg">
                    {t("drawer.noMovement", {
                        defaultValue: "No movement in this period",
                    })}
                </div>
            ) : (
                <div className="h-[260px]" data-testid="history-chart">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={chartData}
                            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid
                                stroke="#27272a"
                                strokeDasharray="3 3"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="date"
                                tick={{ fill: "#71717a", fontSize: 10 }}
                                axisLine={{ stroke: "#27272a" }}
                                tickLine={false}
                                minTickGap={24}
                            />
                            <YAxis
                                tick={{ fill: "#71717a", fontSize: 10 }}
                                axisLine={{ stroke: "#27272a" }}
                                tickLine={false}
                                width={36}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "#18181b",
                                    border: "1px solid #27272a",
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
                                labelStyle={{ color: "#a1a1aa" }}
                            />
                            <Bar
                                dataKey="outbound"
                                fill="#71717a"
                                radius={[0, 0, 2, 2]}
                                isAnimationActive={false}
                            />
                            <Bar
                                dataKey="inbound"
                                fill="#10b981"
                                radius={[2, 2, 0, 0]}
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="on_hand"
                                stroke="#6366f1"
                                fill="#6366f1"
                                fillOpacity={0.15}
                                strokeWidth={2}
                                isAnimationActive={false}
                            />
                            {reorderT != null && (
                                <ReferenceLine
                                    y={reorderT}
                                    stroke="#f59e0b"
                                    strokeDasharray="4 4"
                                    data-testid="ref-reorder"
                                />
                            )}
                            {criticalT != null && (
                                <ReferenceLine
                                    y={criticalT}
                                    stroke="#ef4444"
                                    strokeDasharray="4 4"
                                    data-testid="ref-critical"
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

interface VelocityTabProps {
    isLoading: boolean;
    payload: SeriesResponse | undefined;
    t: (key: string, opts?: Record<string, unknown>) => string;
}

const VelocityTab = ({ isLoading, payload, t }: VelocityTabProps) => {
    if (isLoading || !payload) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
                <Skeleton className="h-40 w-full" />
            </div>
        );
    }
    const v = payload.velocity;
    const p = payload.projection;
    const tiles: { label: string; value: number }[] = [
        { label: "7d", value: v["7d"] },
        { label: "30d", value: v["30d"] },
        { label: "90d", value: v["90d"] },
    ];
    const rows: { label: string; value: string }[] = [
        { label: t("drawer.daysToReorder"), value: fmtDays(p.days_to_reorder) },
        { label: t("drawer.daysToCritical"), value: fmtDays(p.days_to_critical) },
        { label: t("drawer.daysToOut"), value: fmtDays(p.days_to_out) },
        {
            label: t("drawer.suggestedReorder"),
            value: fmtQty(p.suggested_reorder_qty),
        },
    ];
    return (
        <div className="space-y-5">
            <div
                className="grid grid-cols-3 gap-2"
                data-testid="velocity-tiles"
            >
                {tiles.map((tile) => (
                    <div
                        key={tile.label}
                        className="bg-zinc-900/80 border border-white/[0.06] rounded-lg p-3"
                    >
                        <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                            {tile.label}
                        </div>
                        <div className="text-xl font-semibold text-zinc-100 mt-1">
                            {fmtRate(tile.value)}
                        </div>
                    </div>
                ))}
            </div>

            <div
                className="bg-zinc-900/80 border border-white/[0.06] rounded-lg divide-y divide-white/[0.04]"
                data-testid="projection-panel"
            >
                {rows.map((row) => (
                    <div
                        key={row.label}
                        className="flex items-center justify-between px-4 py-3"
                    >
                        <span className="text-sm text-zinc-400">{row.label}</span>
                        <span className="text-sm font-mono text-zinc-100">
                            {row.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const THRESHOLD_FIELDS = [
    "reorder_threshold",
    "critical_threshold",
    "max_threshold",
    "reorder_qty",
] as const;
type ThresholdField = (typeof THRESHOLD_FIELDS)[number];
type ThresholdForm = Record<ThresholdField, string>;

const toFormValue = (v: number | string | null | undefined) =>
    v == null || v === "" ? "" : String(v);

const toNullableNumber = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

interface ProductModelRecord {
    id: string;
    reorder_threshold: number | string | null;
    critical_threshold: number | string | null;
    max_threshold: number | string | null;
    reorder_qty: number | string | null;
}

interface ThresholdsTabProps {
    card: Card;
    onSaved?: () => void;
}

const ThresholdsTab = ({ card, onSaved }: ThresholdsTabProps) => {
    const { t } = useTranslation(["restock", "common"]);
    const { capabilities } = useCapabilities();
    const canEdit = capabilities.manage_own_inventory;
    const { toast } = useToast();
    const { mutate: updateModel, isLoading: isSaving } = useUpdate();

    const { data: pmData, isLoading: isFetching } = useOne({
        resource: "product-models",
        id: card.id,
    }) as { data?: { data: ProductModelRecord }; isLoading: boolean };
    const pm = pmData?.data;

    const [form, setForm] = useState<ThresholdForm>({
        reorder_threshold: toFormValue(card.reorder_threshold),
        critical_threshold: "",
        max_threshold: toFormValue(card.max_threshold),
        reorder_qty: "",
    });

    useEffect(() => {
        if (!pm) return;
        setForm({
            reorder_threshold: toFormValue(
                pm.reorder_threshold ?? card.reorder_threshold,
            ),
            critical_threshold: toFormValue(pm.critical_threshold),
            max_threshold: toFormValue(pm.max_threshold ?? card.max_threshold),
            reorder_qty: toFormValue(pm.reorder_qty),
        });
    }, [pm, card.reorder_threshold, card.max_threshold]);

    const error = useMemo(() => {
        const r = toNullableNumber(form.reorder_threshold);
        const c = toNullableNumber(form.critical_threshold);
        const m = toNullableNumber(form.max_threshold);
        if (c != null && r != null && c > r)
            return t("threshold.errCritOverReorder");
        if (r != null && m != null && r > m)
            return t("threshold.errReorderOverMax");
        return null;
    }, [form, t]);

    const setField = (key: ThresholdField, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSave = () => {
        if (error) return;
        const values: Record<ThresholdField, number | null> = {
            reorder_threshold: toNullableNumber(form.reorder_threshold),
            critical_threshold: toNullableNumber(form.critical_threshold),
            max_threshold: toNullableNumber(form.max_threshold),
            reorder_qty: toNullableNumber(form.reorder_qty),
        };
        updateModel(
            { resource: "product-models", id: card.id, values },
            {
                onSuccess: () => {
                    toast({
                        message: t("threshold.saved"),
                        variant: "success",
                    });
                    onSaved?.();
                },
                onError: () => {
                    toast({
                        message: t("threshold.saveFailed"),
                        variant: "error",
                    });
                },
            },
        );
    };

    const fields: { key: ThresholdField; label: string; testid: string }[] = [
        {
            key: "reorder_threshold",
            label: t("threshold.reorder"),
            testid: "threshold-reorder",
        },
        {
            key: "critical_threshold",
            label: t("threshold.critical"),
            testid: "threshold-critical",
        },
        {
            key: "max_threshold",
            label: t("threshold.max"),
            testid: "threshold-max",
        },
        {
            key: "reorder_qty",
            label: t("threshold.reorderQty"),
            testid: "threshold-qty",
        },
    ];

    return (
        <div className="space-y-4" data-testid="thresholds-form">
            {!canEdit && (
                <p
                    className="text-xs text-zinc-500"
                    data-testid="thresholds-readonly"
                >
                    {t("threshold.readOnly")}
                </p>
            )}
            {fields.map((f) => (
                <Input
                    key={f.key}
                    label={f.label}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    disabled={!canEdit}
                    value={form[f.key]}
                    onChange={(e) => setField(f.key, e.target.value)}
                    data-testid={f.testid}
                />
            ))}
            {error && (
                <p
                    className="text-xs text-red-400"
                    data-testid="threshold-error"
                >
                    {error}
                </p>
            )}
            <div className="flex justify-end">
                <Button
                    type="button"
                    onClick={handleSave}
                    disabled={
                        !canEdit || !!error || isSaving || isFetching
                    }
                    loading={isSaving}
                    data-testid="threshold-save"
                >
                    {t("threshold.save")}
                </Button>
            </div>
        </div>
    );
};
