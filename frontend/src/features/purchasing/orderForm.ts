/**
 * Non-component helpers for the purchasing OrderForm (split out of OrderForm.tsx
 * so the component module only exports components —
 * react-refresh/only-export-components).
 */

let _lineKeySeq = 0;

export interface LineDraft {
    /** Stable client-side key for React list reconciliation (stripped from the
     *  API payload by buildOrderPayload; survives `{...l, ...patch}` updates).
     *  Without it, key={index} mis-associates row state on mid-list delete. */
    _key: string;
    product_model_id: string;
    quantity_ordered: string;
    unit_cost: string;
}

export const emptyLine = (): LineDraft => ({
    _key: `ln-${_lineKeySeq++}`,
    product_model_id: "",
    quantity_ordered: "1",
    unit_cost: "",
});

/** Build the API payload from the form state (shared by create/edit). */
export function buildOrderPayload(args: {
    supplierId: string;
    expectedAt: string;
    notes: string;
    lines: LineDraft[];
}) {
    return {
        supplier_id: args.supplierId,
        expected_at: args.expectedAt || null,
        notes: args.notes,
        lines: args.lines
            .filter((l) => l.product_model_id)
            .map((l) => ({
                product_model_id: l.product_model_id,
                quantity_ordered: l.quantity_ordered,
                unit_cost: l.unit_cost === "" ? null : l.unit_cost,
            })),
    };
}
