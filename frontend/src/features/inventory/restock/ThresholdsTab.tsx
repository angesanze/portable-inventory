import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOne, useUpdate } from "@refinedev/core";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { useToast } from "../../../components/ui/Toast";
import { useCapabilities } from "../../../hooks/useCapabilities";
import type { Card } from "./types";
import type { ProductModelRecord } from "./drawerTypes";

type ThresholdField =
    | "reorder_threshold"
    | "critical_threshold"
    | "max_threshold"
    | "reorder_qty";
type ThresholdForm = Record<ThresholdField, string>;

const toFormValue = (v: number | string | null | undefined) =>
    v == null || v === "" ? "" : String(v);

const toNullableNumber = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

interface ThresholdsTabProps {
    card: Card;
    onSaved?: () => void;
}

export const ThresholdsTab = ({ card, onSaved }: ThresholdsTabProps) => {
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
        // Hydrate threshold inputs from the fetched product-model (async fetch → setState).
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
                <p className="text-xs text-red-400" data-testid="threshold-error">
                    {error}
                </p>
            )}
            <div className="flex justify-end">
                <Button
                    type="button"
                    onClick={handleSave}
                    disabled={!canEdit || !!error || isSaving || isFetching}
                    loading={isSaving}
                    data-testid="threshold-save"
                >
                    {t("threshold.save")}
                </Button>
            </div>
        </div>
    );
};
