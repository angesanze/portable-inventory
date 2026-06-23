/**
 * Non-component helpers for the sales OrderForm (split out of OrderForm.tsx so
 * the component module only exports components — react-refresh/only-export-components).
 */

let _lineKeySeq = 0;

export interface LineDraft {
    /** Stable client-side key for React list reconciliation (stripped from the
     *  API payload by buildOrderPayload; survives `{...l, ...patch}` updates).
     *  Without it, key={index} mis-associates row state on mid-list delete. */
    _key: string;
    product_model_id: string;
    quantity_ordered: string;
    unit_price: string;
}

export const emptyLine = (): LineDraft => ({
    _key: `ln-${_lineKeySeq++}`,
    product_model_id: "",
    quantity_ordered: "1",
    unit_price: "",
});

/** Build the API payload from the form state (shared by create/edit). */
export function buildOrderPayload(args: {
    customerId: string;
    promisedAt: string;
    notes: string;
    lines: LineDraft[];
}) {
    return {
        customer_id: args.customerId,
        promised_at: args.promisedAt || null,
        notes: args.notes,
        lines: args.lines
            .filter((l) => l.product_model_id)
            .map((l) => ({
                product_model_id: l.product_model_id,
                quantity_ordered: l.quantity_ordered,
                unit_price: l.unit_price === "" ? null : l.unit_price,
            })),
    };
}
