/**
 * Shared, typed transaction-payload builder for the polymorphic widget.
 *
 * MOD-03: both widget code paths must dispatch on a single discriminant — the
 * product **profile** (via `PROFILE_METADATA`) — rather than each re-deriving
 * behaviour from a separate `engine` string. This module is the one place that
 * maps a profile + form inputs to the `/widget/{id}/transaction/` payload, so
 * the per-engine field rules can't drift between callers.
 */
import { PROFILE_METADATA } from '../../types/api';
import type { InventoryProfile, EngineType } from '../../types/api';

export type WidgetOperation = 'add' | 'subtract';

/** Raw form inputs collected by the widget (strings straight from inputs). */
export interface TransactionInputs {
    qty?: string;
    bucketData?: Record<string, string>;
    dimensionValues?: Record<string, string>;
    trackerItemId?: string;
    trackerStatus?: string;
    trackerNotes?: string;
    expiryDate?: string;
    batchRef?: string;
}

/** Body posted to `/api/v1/widget/{id}/transaction/`. */
export interface TransactionPayload {
    operation: WidgetOperation;
    quantity?: number;
    physical_product_id?: string;
    new_status?: string;
    notes?: string;
    dimension_values?: Record<string, number>;
    expiry_date?: string;
    batch_ref?: string;
    bucket_data?: Record<string, string>;
    bucket_id?: string;
}

/**
 * Resolve the calculation engine from the profile (preferred) or a legacy
 * `engine` string when the product predates the profile field.
 */
export function resolveEngineType(
    profile: InventoryProfile | undefined,
    engineFallback?: string,
): EngineType | string | undefined {
    if (profile && PROFILE_METADATA[profile]) {
        return PROFILE_METADATA[profile].engineType;
    }
    return engineFallback;
}

/**
 * Build the transaction payload for a single-product widget move. Mirrors the
 * exact field rules the backend expects per engine; dispatch is profile-first
 * with a legacy `engineFallback`.
 */
export function buildTransactionPayload(
    profile: InventoryProfile | undefined,
    engineFallback: string | undefined,
    operation: WidgetOperation,
    inputs: TransactionInputs,
): TransactionPayload {
    const engine = resolveEngineType(profile, engineFallback);
    const payload: TransactionPayload = {
        operation,
        quantity: parseFloat(inputs.qty ?? '') || 0,
    };

    switch (engine) {
        case 'tracker':
            payload.physical_product_id = inputs.trackerItemId;
            payload.new_status = inputs.trackerStatus;
            payload.notes = inputs.trackerNotes || undefined;
            delete payload.quantity;
            break;
        case 'dimension':
            payload.dimension_values = Object.fromEntries(
                Object.entries(inputs.dimensionValues ?? {}).map(([k, v]) => [k, parseFloat(v) || 0]),
            );
            break;
        case 'time_based':
            if (inputs.expiryDate) payload.expiry_date = inputs.expiryDate;
            if (inputs.batchRef) payload.batch_ref = inputs.batchRef;
            break;
        case 'bucket': {
            const bucketData = inputs.bucketData ?? {};
            if (operation === 'add') {
                payload.bucket_data = bucketData;
            } else {
                if (bucketData['batch_id']) payload.bucket_id = bucketData['batch_id'];
                if (bucketData['id']) payload.bucket_id = bucketData['id'];
            }
            break;
        }
        default:
            // counter / converter / legacy number: just {operation, quantity}
            break;
    }

    return payload;
}

/** Raw inputs for the `/widget/move/` nested calculator envelope. */
export interface MoveInputs {
    qty: number;
    batchData: Record<string, string>;
    batchIdentifier?: string;
    selectedBatchId?: string;
    expiryDate?: string;
    batchRef?: string;
    /** Whether the product carries a calc_config — legacy counters without one
     *  send no calculator envelope at all (only the outer move quantity). */
    hasCalcConfig?: boolean;
}

/** Nested `calculator_payload` posted inside the `/widget/move/` body. */
export interface MoveCalculatorPayload {
    operation: WidgetOperation;
    quantity?: number | string;
    dimension_values?: Record<string, number>;
    expiry_date?: string;
    batch_ref?: string;
    batch_data?: Record<string, string>;
    batch_id?: string;
}

/**
 * Build the nested `calculator_payload` for the `/widget/move/` endpoint from a
 * product profile + form inputs. Distinct envelope from the flat
 * {@link buildTransactionPayload}, but kept here so the per-profile field rules
 * for the two widget paths live in one module and can't drift (MOD-03).
 *
 * Returns `null` when no envelope should be sent — i.e. serialized/tracker
 * products (the caller carries a ±1 on the outer payload) and legacy counters
 * without a calc_config.
 */
export function buildMoveCalculatorPayload(
    profile: InventoryProfile | undefined,
    operation: WidgetOperation,
    inputs: MoveInputs,
): MoveCalculatorPayload | null {
    const meta = profile ? PROFILE_METADATA[profile] : null;

    if (profile === 'DIMENSIONAL') {
        const dimension_values: Record<string, number> = {};
        for (const [k, v] of Object.entries(inputs.batchData)) {
            const num = parseFloat(v);
            if (!isNaN(num)) dimension_values[k] = num;
        }
        return { operation, dimension_values };
    }
    if (profile === 'PERISHABLE') {
        return {
            operation,
            quantity: inputs.qty,
            expiry_date: inputs.expiryDate || undefined,
            batch_ref: inputs.batchRef || undefined,
        };
    }
    if (meta?.supportsSerials) {
        // tracker: ±1 on the outer payload, no calculator envelope.
        return null;
    }
    if (meta?.supportsBatches) {
        if (operation === 'add') {
            return {
                operation,
                quantity: inputs.qty,
                batch_data: { batch_identifier: inputs.batchIdentifier ?? '', ...inputs.batchData },
            };
        }
        return { operation, quantity: inputs.qty, batch_id: inputs.selectedBatchId };
    }
    // counter / converter: only emit an envelope when a calc_config exists.
    return inputs.hasCalcConfig ? { operation, quantity: inputs.qty } : null;
}
