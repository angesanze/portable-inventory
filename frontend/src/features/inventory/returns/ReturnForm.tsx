import { useList } from "@refinedev/core";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";
import { FormErrorBanner } from "../../../components/ui/ErrorState";

export type ReturnKind = "CUSTOMER_RETURN" | "SUPPLIER_RETURN";

export interface ReturnLineDraft {
    product_model_id: string;
    quantity: string;
}

export const emptyLine = (): ReturnLineDraft => ({
    product_model_id: "",
    quantity: "1",
});

/** Build the API payload from the form state. */
export function buildReturnPayload(args: {
    kind: ReturnKind;
    customerId: string;
    supplierId: string;
    reasonCode: string;
    salesOrderId: string;
    purchaseOrderId: string;
    notes: string;
    lines: ReturnLineDraft[];
}) {
    const isCustomer = args.kind === "CUSTOMER_RETURN";
    return {
        kind: args.kind,
        reason_code: args.reasonCode || "OTHER",
        notes: args.notes,
        customer_id: isCustomer ? args.customerId || null : null,
        supplier_id: !isCustomer ? args.supplierId || null : null,
        sales_order_id: isCustomer ? args.salesOrderId || null : null,
        purchase_order_id: !isCustomer ? args.purchaseOrderId || null : null,
        lines: args.lines
            .filter((l) => l.product_model_id && parseFloat(l.quantity) > 0)
            .map((l) => ({
                product_model_id: l.product_model_id,
                quantity: l.quantity,
            })),
    };
}

interface ReturnFormProps {
    title: string;
    kind: ReturnKind;
    setKind: (v: ReturnKind) => void;
    customerId: string;
    setCustomerId: (v: string) => void;
    supplierId: string;
    setSupplierId: (v: string) => void;
    reasonCode: string;
    setReasonCode: (v: string) => void;
    salesOrderId: string;
    setSalesOrderId: (v: string) => void;
    purchaseOrderId: string;
    setPurchaseOrderId: (v: string) => void;
    notes: string;
    setNotes: (v: string) => void;
    lines: ReturnLineDraft[];
    setLines: (lines: ReturnLineDraft[]) => void;
    onSubmit: () => Promise<void> | void;
    onCancel: () => void;
    isLoading: boolean;
    error?: unknown;
}

const REASONS = ["DEFECTIVE", "WRONG_ITEM", "EXPIRED", "OTHER"];

export const ReturnForm = ({
    title,
    kind,
    setKind,
    customerId,
    setCustomerId,
    supplierId,
    setSupplierId,
    reasonCode,
    setReasonCode,
    salesOrderId,
    setSalesOrderId,
    purchaseOrderId,
    setPurchaseOrderId,
    notes,
    setNotes,
    lines,
    setLines,
    onSubmit,
    onCancel,
    isLoading,
    error,
}: ReturnFormProps) => {
    const { t } = useTranslation(["returns", "common"]);
    const isCustomer = kind === "CUSTOMER_RETURN";

    const { data: customersData } = useList({
        resource: "customers",
        pagination: { mode: "off" },
    });
    const { data: suppliersData } = useList({
        resource: "suppliers",
        pagination: { mode: "off" },
    });
    const { data: productsData } = useList({
        resource: "product-models",
        pagination: { mode: "off" },
    });
    const { data: salesData } = useList({
        resource: "sales-orders",
        pagination: { mode: "off" },
        queryOptions: { enabled: isCustomer },
    });
    const { data: purchaseData } = useList({
        resource: "purchase-orders",
        pagination: { mode: "off" },
        queryOptions: { enabled: !isCustomer },
    });

    const productOptions = (productsData?.data || []).map((p: any) => ({
        value: p.id,
        label: p.name,
        description: p.sku,
    }));
    const customerOptions = (customersData?.data || []).map((c: any) => ({
        value: c.id,
        label: c.name,
    }));
    const supplierOptions = (suppliersData?.data || []).map((s: any) => ({
        value: s.id,
        label: s.name,
    }));
    const salesOptions = (salesData?.data || []).map((o: any) => ({
        value: o.id,
        label: o.number,
        description: o.customer_name,
    }));
    const purchaseOptions = (purchaseData?.data || []).map((o: any) => ({
        value: o.id,
        label: o.number,
        description: o.supplier_name,
    }));

    const updateLine = (index: number, patch: Partial<ReturnLineDraft>) => {
        setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    };

    const validLines = lines.filter(
        (l) => l.product_model_id && parseFloat(l.quantity) > 0,
    );
    const partyChosen = isCustomer ? !!customerId : !!supplierId;
    const submitDisabled = !partyChosen || validLines.length === 0;

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
                    label={t("form.kind")}
                    value={kind}
                    onChange={(val) => setKind(String(val) as ReturnKind)}
                    options={[
                        { value: "CUSTOMER_RETURN", label: t("kind.CUSTOMER_RETURN") },
                        { value: "SUPPLIER_RETURN", label: t("kind.SUPPLIER_RETURN") },
                    ]}
                    placeholder={t("form.kindPlaceholder")}
                    required
                />

                {isCustomer ? (
                    <Select
                        custom
                        label={t("form.customer")}
                        value={customerId}
                        onChange={(val) => setCustomerId(String(val))}
                        options={customerOptions}
                        placeholder={t("form.customerPlaceholder")}
                        required
                    />
                ) : (
                    <Select
                        custom
                        label={t("form.supplier")}
                        value={supplierId}
                        onChange={(val) => setSupplierId(String(val))}
                        options={supplierOptions}
                        placeholder={t("form.supplierPlaceholder")}
                        required
                    />
                )}

                <Select
                    custom
                    label={t("form.reason")}
                    value={reasonCode}
                    onChange={(val) => setReasonCode(String(val))}
                    options={REASONS.map((r) => ({ value: r, label: t(`reason.${r}`) }))}
                    placeholder={t("form.reasonPlaceholder")}
                />

                {isCustomer ? (
                    <Select
                        custom
                        label={t("form.salesOrder")}
                        value={salesOrderId}
                        onChange={(val) => setSalesOrderId(String(val))}
                        options={salesOptions}
                        placeholder={t("form.salesOrderPlaceholder")}
                    />
                ) : (
                    <Select
                        custom
                        label={t("form.purchaseOrder")}
                        value={purchaseOrderId}
                        onChange={(val) => setPurchaseOrderId(String(val))}
                        options={purchaseOptions}
                        placeholder={t("form.purchaseOrderPlaceholder")}
                    />
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
                        key={index}
                        className="flex flex-col sm:flex-row gap-3 sm:items-end border border-white/[0.06] rounded-lg p-3"
                        data-testid={`return-line-${index}`}
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
                                value={line.quantity}
                                onChange={(e) =>
                                    updateLine(index, { quantity: e.target.value })
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
