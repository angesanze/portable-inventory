import { useList } from "@refinedev/core";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import type { TransferLocationRow, TransferProductRow } from "./types";
import { emptyLine, type LineDraft } from "./transferForm";

interface TransferFormProps {
    title: string;
    fromLocationId: string;
    setFromLocationId: (v: string) => void;
    toLocationId: string;
    setToLocationId: (v: string) => void;
    notes: string;
    setNotes: (v: string) => void;
    lines: LineDraft[];
    setLines: (lines: LineDraft[]) => void;
    onSubmit: () => Promise<void> | void;
    onCancel: () => void;
    isLoading: boolean;
    error?: unknown;
}

/** DRAFT transfer header (from → to) + editable lines (shared by create/edit). */
export const TransferForm = ({
    title,
    fromLocationId,
    setFromLocationId,
    toLocationId,
    setToLocationId,
    notes,
    setNotes,
    lines,
    setLines,
    onSubmit,
    onCancel,
    isLoading,
    error,
}: TransferFormProps) => {
    const { t } = useTranslation(["transfers", "common"]);

    const { data: locationsData } = useList<TransferLocationRow>({
        resource: "locations",
        pagination: { mode: "off" },
    });
    const { data: productsData } = useList<TransferProductRow>({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const realLocations = (locationsData?.data || []).filter(
        (l) => l.type === "WAREHOUSE" || l.type === "STORE",
    );
    const locationOptions = realLocations.map((l) => ({
        value: l.id,
        label: l.name,
        description: l.type,
    }));
    const productOptions = (productsData?.data || []).map((p) => ({
        value: p.id,
        label: p.name,
        description: p.sku,
    }));

    const updateLine = (index: number, patch: Partial<LineDraft>) => {
        setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    };

    const validLines = lines.filter(
        (l) => l.product_model_id && parseFloat(l.quantity_sent) > 0,
    );
    const sameLocation = !!fromLocationId && fromLocationId === toLocationId;
    const submitDisabled =
        !fromLocationId || !toLocationId || sameLocation || validLines.length === 0;

    return (
        <FormPage
            title={title}
            onSubmit={onSubmit}
            isLoading={isLoading}
            onCancel={onCancel}
            submitDisabled={submitDisabled}
        >
            {!!error && (
                <FormErrorBanner
                    title={t("form.errorSaving")}
                    error={error}
                    fallbackMessage={t("form.errorSavingFallback")}
                />
            )}

            <FormSection
                title={t("form.headerSection")}
                description={t("form.headerSectionDesc")}
            >
                <Select
                    custom
                    label={t("form.fromLocation")}
                    value={fromLocationId}
                    onChange={(val) => setFromLocationId(String(val))}
                    options={locationOptions}
                    placeholder={t("form.fromLocationPlaceholder")}
                    required
                />
                <Select
                    custom
                    label={t("form.toLocation")}
                    value={toLocationId}
                    onChange={(val) => setToLocationId(String(val))}
                    options={locationOptions}
                    placeholder={t("form.toLocationPlaceholder")}
                    required
                />
                {sameLocation && (
                    <p className="text-xs text-amber-400">{t("form.sameLocation")}</p>
                )}
                <Input
                    label={t("form.notes")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("form.notesPlaceholder")}
                />
            </FormSection>

            <FormSection
                title={t("form.linesSection")}
                description={t("form.linesSectionDesc")}
            >
                {lines.length === 0 && (
                    <p className="text-sm text-zinc-500">{t("form.noLines")}</p>
                )}
                {lines.map((line, index) => (
                    <div
                        key={line._key}
                        className="flex flex-col sm:flex-row gap-3 sm:items-end border border-white/[0.06] rounded-lg p-3"
                        data-testid={`transfer-line-${index}`}
                    >
                        <div className="flex-1 min-w-0">
                            <Select
                                custom
                                label={t("form.product")}
                                value={line.product_model_id}
                                onChange={(val) =>
                                    updateLine(index, { product_model_id: String(val) })
                                }
                                options={productOptions}
                                placeholder={t("form.productPlaceholder")}
                                required
                            />
                        </div>
                        <div className="w-full sm:w-32">
                            <Input
                                label={t("form.quantity")}
                                type="number"
                                min="0"
                                step="any"
                                value={line.quantity_sent}
                                onChange={(e) =>
                                    updateLine(index, { quantity_sent: e.target.value })
                                }
                                required
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setLines(lines.filter((_, i) => i !== index))}
                            aria-label={t("form.removeLine")}
                            data-testid={`remove-line-${index}`}
                            className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-white/[0.04] transition-colors self-end"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
                <div>
                    <Button
                        type="button"
                        variant="secondary"
                        icon={Plus}
                        onClick={() => setLines([...lines, emptyLine()])}
                        data-testid="add-line"
                    >
                        {t("form.addLine")}
                    </Button>
                </div>
            </FormSection>
        </FormPage>
    );
};
