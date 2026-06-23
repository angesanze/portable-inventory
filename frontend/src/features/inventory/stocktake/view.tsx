import { useEffect, useMemo, useRef, useState } from "react";
import { useOne, useCustomMutation, useCustom } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft,
    ClipboardList,
    ListChecks,
    Save,
    CheckCircle2,
    Download,
    AlertTriangle,
} from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { useToast } from "../../../components/ui/Toast";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { VARIANCE_EXPORT_COLUMNS, VARIANCE_EXPORT_FILENAME } from "./exportColumns";
import type {
    CountSessionRecord,
    CountSessionLine,
    VarianceReport,
    VarianceLine,
    UncountedLine,
    ApplyResponse,
} from "./types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    OPEN: "neutral",
    COUNTING: "cyan",
    REVIEW: "amber",
    APPLIED: "emerald",
    CANCELLED: "red",
};

const COUNTABLE = ["OPEN", "COUNTING", "REVIEW"];

const lineLabel = (line: CountSessionLine): string =>
    line.identifier || line.batch_identifier || line.product_sku;

export const StocktakeView = () => {
    const { t } = useTranslation(["stocktake", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();
    const { toast } = useToast();
    const { confirm, dialogProps } = useConfirmDialog();

    const { data, isLoading, refetch } = useOne<CountSessionRecord>({
        resource: "count-sessions",
        id: id ?? "",
        queryOptions: { enabled: !!id },
    });
    const session = data?.data;
    const status: string = session?.status ?? "";
    const lines: CountSessionLine[] = session?.lines ?? [];
    const isApplied = status === "APPLIED";
    const isCountable = COUNTABLE.includes(status);

    const [tab, setTab] = useState<"count" | "review">("count");
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [scan, setScan] = useState("");
    const [scanError, setScanError] = useState("");
    const [uncounted, setUncounted] = useState<"skip" | "zero">("skip");
    const [actionError, setActionError] = useState<unknown>(null);

    const rowRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // Variance report (also drives the review tab + warning banner).
    const { data: varData, refetch: refetchVar } = useCustom<VarianceReport>({
        url: `${API_URL}/api/v1/count-sessions/${id}/variance/`,
        method: "get",
        queryOptions: { enabled: !!id && !!session },
    });
    const variance = varData?.data;
    const variances: VarianceLine[] = variance?.variances ?? [];
    const uncountedLines: UncountedLine[] = variance?.uncounted ?? [];
    const movementsAfter: boolean = !!variance?.movements_after_snapshot;

    // Seed the count inputs from persisted counted_qty once loaded.
    useEffect(() => {
        if (!lines.length) return;
        // Seed once from fetched lines; no-op if counts already entered.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCounts((prev) => {
            if (Object.keys(prev).length) return prev;
            const seed: Record<string, string> = {};
            for (const l of lines) {
                if (l.counted_qty !== null && l.counted_qty !== undefined) {
                    seed[l.id] = String(Number(l.counted_qty));
                }
            }
            return seed;
        });
    }, [lines.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const countedCount = useMemo(
        () => lines.filter((l) => counts[l.id] !== undefined && counts[l.id] !== "").length,
        [lines, counts],
    );

    const { mutateAsync: postAction, isLoading: isActing } = useCustomMutation<ApplyResponse>();

    const handleScan = (e: React.FormEvent) => {
        e.preventDefault();
        setScanError("");
        const term = scan.trim().toLowerCase();
        if (!term) return;
        const match = lines.find(
            (l) =>
                (l.identifier && String(l.identifier).toLowerCase() === term) ||
                (l.batch_identifier && String(l.batch_identifier).toLowerCase() === term) ||
                String(l.product_sku).toLowerCase() === term,
        );
        if (!match) {
            setScanError(t("count.noMatch", { term: scan.trim() }));
            return;
        }
        const el = rowRefs.current[match.id];
        if (el) {
            el.focus();
            el.scrollIntoView?.({ block: "center", behavior: "smooth" });
        }
        setScan("");
    };

    const handleSave = async () => {
        setActionError(null);
        const payload = lines
            .filter((l) => counts[l.id] !== undefined && counts[l.id] !== "")
            .map((l) => ({ line_id: l.id, qty: counts[l.id] }));
        if (!payload.length) return;
        try {
            await postAction({
                url: `${API_URL}/api/v1/count-sessions/${id}/count/`,
                method: "post",
                values: { counts: payload },
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("count.saveSuccess"), variant: "success" });
            refetch();
            refetchVar();
        } catch (err) {
            setActionError(err);
            toast({ message: t("count.saveFailed"), variant: "error" });
        }
    };

    const handleApply = async () => {
        setActionError(null);
        if (
            !(await confirm({
                title: t("review.applyTitle"),
                message: t("review.applyMessage"),
                variant: "danger",
                confirmLabel: t("review.applyAction"),
            }))
        )
            return;
        try {
            const res = await postAction({
                url: `${API_URL}/api/v1/count-sessions/${id}/apply/`,
                method: "post",
                values: { uncounted },
                successNotification: false,
                errorNotification: false,
            });
            toast({
                message: t("review.applySuccess", { count: res?.data?.adjustments ?? 0 }),
                variant: "success",
            });
            refetch();
            refetchVar();
        } catch (err) {
            setActionError(err);
            toast({ message: t("review.applyFailed"), variant: "error" });
        }
    };

    const exportVariances = () => {
        exportToExcel(variances, VARIANCE_EXPORT_COLUMNS, `${VARIANCE_EXPORT_FILENAME}.xlsx`);
    };

    if (isLoading || !session) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate("/stocktake")}
                        className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg"
                        aria-label={t("common:back")}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-lg text-zinc-100">{session.location_name}</span>
                            <Badge variant={STATUS_VARIANTS[status] ?? "neutral"}>
                                {t(`status.${status}`, status)}
                            </Badge>
                        </div>
                        {isApplied && (
                            <div className="text-xs text-emerald-400">{t("review.appliedBadge")}</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-white/[0.06]">
                <button
                    className={`px-3 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${
                        tab === "count"
                            ? "border-emerald-400 text-zinc-100"
                            : "border-transparent text-zinc-400 hover:text-zinc-200"
                    }`}
                    onClick={() => setTab("count")}
                    data-testid="tab-count"
                >
                    <ListChecks size={15} />
                    {t("tabCount")}
                </button>
                <button
                    className={`px-3 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${
                        tab === "review"
                            ? "border-emerald-400 text-zinc-100"
                            : "border-transparent text-zinc-400 hover:text-zinc-200"
                    }`}
                    onClick={() => {
                        setTab("review");
                        refetchVar();
                    }}
                    data-testid="tab-review"
                >
                    <ClipboardList size={15} />
                    {t("tabReview")}
                </button>
            </div>

            {!!actionError && (
                <div className="mb-4">
                    <FormErrorBanner title={t("actionFailed")} error={actionError} />
                </div>
            )}

            {tab === "count" && (
                <div className="flex flex-col gap-4">
                    {isCountable && (
                        <Card>
                            <form onSubmit={handleScan}>
                                <Input
                                    label={t("count.title")}
                                    value={scan}
                                    onChange={(e) => setScan(e.target.value)}
                                    placeholder={t("count.scanPlaceholder")}
                                    helperText={t("count.scanHelper")}
                                    error={scanError || undefined}
                                    data-testid="scan-input"
                                />
                            </form>
                            <div className="mt-3 text-xs text-zinc-400" data-testid="progress-label">
                                {t("count.progress", {
                                    counted: countedCount,
                                    total: lines.length,
                                })}
                            </div>
                            <div className="mt-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-400 transition-all"
                                    style={{
                                        width: lines.length
                                            ? `${(countedCount / lines.length) * 100}%`
                                            : "0%",
                                    }}
                                />
                            </div>
                        </Card>
                    )}

                    <Card>
                        <div className="flex flex-col gap-1.5">
                            {lines.map((line) => (
                                <div
                                    key={line.id}
                                    className="flex items-center justify-between gap-3 border border-white/[0.06] rounded-lg p-2.5"
                                    data-testid={`count-line-${line.id}`}
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm text-zinc-200 truncate">
                                            {line.product_name}
                                        </div>
                                        <div className="text-[11px] font-mono text-zinc-500">
                                            {lineLabel(line)}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 whitespace-nowrap">
                                        <span className="text-xs text-zinc-400">
                                            {t("count.expected")}{" "}
                                            <span className="text-zinc-200">
                                                {Number(line.expected_qty)}
                                            </span>
                                        </span>
                                        <input
                                            ref={(el) => {
                                                rowRefs.current[line.id] = el;
                                            }}
                                            type="number"
                                            min="0"
                                            step="any"
                                            disabled={!isCountable}
                                            value={counts[line.id] ?? ""}
                                            onChange={(e) =>
                                                setCounts((prev) => ({
                                                    ...prev,
                                                    [line.id]: e.target.value,
                                                }))
                                            }
                                            placeholder={t("count.countedPlaceholder")}
                                            data-testid={`count-input-${line.id}`}
                                            className="w-24 rounded-lg bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-400/50"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        {isCountable && (
                            <div className="mt-4">
                                <Button
                                    variant="primary"
                                    icon={Save}
                                    disabled={isActing}
                                    onClick={handleSave}
                                    data-testid="save-counts-button"
                                >
                                    {t("count.save")}
                                </Button>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {tab === "review" && (
                <div className="flex flex-col gap-4">
                    <p className="text-xs text-zinc-400">{t("review.desc")}</p>

                    {movementsAfter && (
                        <div
                            className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs text-amber-300"
                            data-testid="movements-warning"
                        >
                            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                            <span>{t("review.movementsWarning")}</span>
                        </div>
                    )}

                    <Card>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-zinc-200">
                                {t("review.title")}
                            </h3>
                            <Button
                                variant="secondary"
                                icon={Download}
                                disabled={variances.length === 0}
                                onClick={exportVariances}
                                data-testid="export-variances"
                            >
                                {t("review.exportExcel")}
                            </Button>
                        </div>
                        {variances.length === 0 ? (
                            <div className="text-sm text-zinc-500 py-4 text-center">
                                {t("review.noVariance")}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                {variances.map((v) => {
                                    const delta = Number(v.variance);
                                    const isSurplus = delta > 0;
                                    return (
                                        <div
                                            key={v.line_id}
                                            className="flex items-center justify-between gap-3 border border-white/[0.06] rounded-lg p-2.5"
                                            data-testid={`variance-${v.line_id}`}
                                        >
                                            <div className="min-w-0">
                                                <div className="text-sm text-zinc-200 truncate">
                                                    {v.product_name}
                                                </div>
                                                <div className="text-[11px] font-mono text-zinc-500">
                                                    {v.identifier || v.batch_identifier || v.product_sku}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs whitespace-nowrap">
                                                <span className="text-zinc-400">
                                                    {Number(v.expected_qty)} →{" "}
                                                    {v.counted_qty === null
                                                        ? "—"
                                                        : Number(v.counted_qty)}
                                                </span>
                                                <Badge variant={isSurplus ? "emerald" : "red"}>
                                                    {isSurplus
                                                        ? `${t("review.surplus")} +${delta}`
                                                        : `${t("review.shortfall")} ${delta}`}
                                                </Badge>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    {uncountedLines.length > 0 && (
                        <Card>
                            <h3 className="text-sm font-medium text-zinc-200 mb-1">
                                {t("review.uncountedTitle")}
                            </h3>
                            <p className="text-xs text-zinc-400" data-testid="uncounted-count">
                                {t("review.uncountedCount", { count: uncountedLines.length })}
                            </p>
                        </Card>
                    )}

                    {isCountable && (
                        <Card>
                            <Select
                                custom
                                label={t("review.uncountedMode")}
                                value={uncounted}
                                onChange={(val) => setUncounted(val as "skip" | "zero")}
                                options={[
                                    { value: "skip", label: t("review.uncountedSkip") },
                                    { value: "zero", label: t("review.uncountedZero") },
                                ]}
                            />
                            <div className="mt-4">
                                <Button
                                    variant="primary"
                                    icon={CheckCircle2}
                                    disabled={isActing}
                                    onClick={handleApply}
                                    data-testid="apply-button"
                                >
                                    {t("review.applyAction")}
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            <ConfirmDialog {...dialogProps} />
        </div>
    );
};
