/**
 * Non-component helpers for the TransferForm (split out of TransferForm.tsx so
 * the component module only exports components — react-refresh/only-export-components).
 */

let _lineKeySeq = 0;

export interface LineDraft {
    /** Stable client-side key for React list reconciliation (stripped from the
     *  API payload by buildTransferPayload; survives `{...l, ...patch}` updates).
     *  Without it, key={index} mis-associates row state on mid-list delete. */
    _key: string;
    product_model_id: string;
    quantity_sent: string;
}

export const emptyLine = (): LineDraft => ({
    _key: `ln-${_lineKeySeq++}`,
    product_model_id: "",
    quantity_sent: "1",
});

/** Build the API payload from the form state. */
export function buildTransferPayload(args: {
    fromLocationId: string;
    toLocationId: string;
    notes: string;
    lines: LineDraft[];
}) {
    return {
        from_location_id: args.fromLocationId,
        to_location_id: args.toLocationId,
        notes: args.notes,
        lines: args.lines
            .filter((l) => l.product_model_id && parseFloat(l.quantity_sent) > 0)
            .map((l) => ({
                product_model_id: l.product_model_id,
                quantity_sent: l.quantity_sent,
            })),
    };
}
