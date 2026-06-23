import { useList } from "@refinedev/core";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../components/ui/FormPage";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { FormErrorBanner } from "../../components/ui/ErrorState";
import type { PurchaseSupplierRow, PurchaseProductRow } from "./types";
import { emptyLine, type LineDraft } from "./orderForm";

interface OrderFormProps {
    title: string;
    supplierId: string;
    setSupplierId: (v: string) => void;
    expectedAt: string;
    setExpectedAt: (v: string) => void;
    notes: string;
    setNotes: (v: string) => void;
    lines: LineDraft[];
    setLines: (lines: LineDraft[]) => void;
    onSubmit: () => Promise<void> | void;
    onCancel: () => void;
    isLoading: boolean;
    error?: unknown;
}

/** DRAFT purchase-order header + editable lines (shared by create and edit). */
export const OrderForm = ({
    title,
    supplierId,
    setSupplierId,
    expectedAt,
    setExpectedAt,
    notes,
    setNotes,
    lines,
    setLines,
    onSubmit,
    onCancel,
    isLoading,
    error,
}: OrderFormProps) => {
    const { t } = useTranslation(["purchasing", "common"]);

    const { data: suppliersData } = useList<PurchaseSupplierRow>({
        resource: "suppliers",
        pagination: { mode: "off" },
        filters: [{ field: "is_active", operator: "eq", value: true }],
    });
    const { data: productsData } = useList<PurchaseProductRow>({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const supplierOptions = (suppliersData?.data || []).map((s) => ({
        value: s.id,
        label: s.name,
        description: s.vat_number || undefined,
    }));
    const productOptions = (productsData?.data || []).map((p) => ({
        value: p.id,
        label: p.name,
        description: p.sku,
    }));

    // Current weighted-average cost per product, surfaced next to each line's
    // cost input as a hint (COSTING-06). Sourced from the list serializer's
    // stock_summary so no extra request is needed.
    const avgCostById: Record<string, number> = {};
    (productsData?.data || []).forEach((p) => {
        const avg = p.stock_summary?.avg_unit_cost;
        if (avg && Number(avg) > 0) avgCostById[p.id] = Number(avg);
    });

    const updateLine = (index: number, patch: Partial<LineDraft>) => {
        setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    };

    const validLines = lines.filter(
        (l) => l.product_model_id && parseFloat(l.quantity_ordered) > 0,
    );
    const submitDisabled = !supplierId || validLines.length === 0;

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
                    label={t("form.supplier")}
                    value={supplierId}
                    onChange={(val) => setSupplierId(String(val))}
                    options={supplierOptions}
                    placeholder={t("form.supplierPlaceholder")}
                    required
                />
                <Input
                    label={t("form.expectedAt")}
                    type="date"
                    value={expectedAt}
                    onChange={(e) => setExpectedAt(e.target.value)}
                />
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
                        data-testid={`order-line-${index}`}
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
                        <div className="w-full sm:w-28">
                            <Input
                                label={t("form.quantity")}
                                type="number"
                                min="0"
                                step="any"
                                value={line.quantity_ordered}
                                onChange={(e) =>
                                    updateLine(index, { quantity_ordered: e.target.value })
                                }
                                required
                            />
                        </div>
                        <div className="w-full sm:w-32">
                            <Input
                                label={t("form.unitCost")}
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unit_cost}
                                onChange={(e) =>
                                    updateLine(index, { unit_cost: e.target.value })
                                }
                                helperText={
                                    line.product_model_id && avgCostById[line.product_model_id]
                                        ? t("form.avgCostHint", {
                                              value: avgCostById[line.product_model_id].toFixed(2),
                                          })
                                        : undefined
                                }
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
