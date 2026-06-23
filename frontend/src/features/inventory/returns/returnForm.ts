/**
 * Non-component helpers/types for the ReturnForm (split out of ReturnForm.tsx so
 * the component module only exports components — react-refresh/only-export-components).
 */

export type ReturnKind = "CUSTOMER_RETURN" | "SUPPLIER_RETURN";

let _lineKeySeq = 0;

export interface ReturnLineDraft {
    /** Stable client-side key for React list reconciliation (stripped from the
     *  API payload by buildReturnPayload; survives `{...l, ...patch}` updates).
     *  Without it, key={index} mis-associates row state on mid-list delete. */
    _key: string;
    product_model_id: string;
    quantity: string;
}

export const emptyLine = (): ReturnLineDraft => ({
    _key: `ln-${_lineKeySeq++}`,
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
