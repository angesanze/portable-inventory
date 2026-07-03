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

/** Raw inputs for building a `/widget/move/` body. */
export interface MoveInputs {
    qty: number;
    /** Batch/lot custom fields (BATCH_TRACKED) or dimension values (DIMENSIONAL),
     *  collected as strings straight from the form. */
    batchData: Record<string, string>;
    batchIdentifier?: string;
    selectedBatchId?: string;
    expiryDate?: string;
    batchRef?: string;
}

/** Numeric/dimension calculation envelope. Backend key on the move body: `calc_payload`. */
export interface MoveCalcEnvelope {
    operation: WidgetOperation;
    quantity?: number | string;
    dimension_values?: Record<string, number>;
}

/** Batch metadata for a move ADD. The backend reads this TOP-LEVEL as `batch_data`,
 *  shaped `{ batch_identifier, data }` (see test_bucket_flow.py / BatchBehavior). */
export interface MoveBatchData {
    batch_identifier: string;
    data: Record<string, string>;
}

/**
 * Pieces to merge into a `/widget/move/` body at the EXACT positions the backend
 * orchestrator (`handle_widget_movement`) reads them:
 *   - `calc_payload` → numeric/dimension engines (`calculate_delta`);
 *   - `batch_data`   → TOP-LEVEL, batch/perishable ADD;
 *   - `batch_id`     → TOP-LEVEL, batch/perishable SUBTRACT.
 *
 * Replaces the historical bug where the whole envelope was posted under
 * `calculator_payload` — a key the backend never reads — with `batch_id`/`batch_data`
 * nested inside it. The backend then silently fell back to the raw outer quantity,
 * corrupting converter/dimension amounts and dropping expiry/lot data. Keeping the
 * per-profile field rules in this one function stops the move and scanner callers
 * from drifting again (MOD-03).
 */
export interface MovePayloadParts {
    calc_payload?: MoveCalcEnvelope;
    batch_data?: MoveBatchData;
    batch_id?: string;
}

export function buildMovePayloadParts(
    profile: InventoryProfile | undefined,
    operation: WidgetOperation,
    inputs: MoveInputs,
): MovePayloadParts {
    const meta = profile ? PROFILE_METADATA[profile] : null;

    if (profile === 'DIMENSIONAL') {
        const dimension_values: Record<string, number> = {};
        for (const [k, v] of Object.entries(inputs.batchData)) {
            const num = parseFloat(v);
            if (!isNaN(num)) dimension_values[k] = num;
        }
        return { calc_payload: { operation, dimension_values } };
    }
    if (profile === 'PERISHABLE') {
        if (operation === 'add') {
            return {
                batch_data: {
                    batch_identifier: inputs.batchRef ?? '',
                    data: inputs.expiryDate ? { expiry_date: inputs.expiryDate } : {},
                },
            };
        }
        return inputs.selectedBatchId ? { batch_id: inputs.selectedBatchId } : {};
    }
    if (meta?.supportsSerials) {
        // tracker: the caller sends ±1 + physical_identifier; no envelope.
        return {};
    }
    if (meta?.supportsBatches) {
        if (operation === 'add') {
            return {
                batch_data: {
                    batch_identifier: inputs.batchIdentifier ?? '',
                    data: { ...inputs.batchData },
                },
            };
        }
        return inputs.selectedBatchId ? { batch_id: inputs.selectedBatchId } : {};
    }
    // counter / converter: numeric envelope so the converter ratio is applied
    // backend-side (calculate_delta). Harmless for a plain counter.
    return { calc_payload: { operation, quantity: inputs.qty } };
}

/** Input for a `batch_update_item` operation (WorkOrder composition). */
export interface BatchUpdateItemInput {
    productModelId?: string;
    delta: number;
    physicalIdentifier?: string | null;
    physicalProductId?: string | null;
    batchId?: string | null;
}

/** Body posted to `/widget/{workOrderId}/transaction/` for batch composition.
 *  The index signature lets it flow into the `Record<string, unknown>` JSON-body
 *  slots (Refine `values`, the widget `finalPayload`) while keeping the known
 *  keys typed. */
export interface BatchUpdateItemPayload {
    operation: 'batch_update_item';
    product_model_id?: string;
    delta: number;
    physical_identifier?: string;
    physical_product_id?: string;
    batch_id?: string;
    [key: string]: unknown;
}

/**
 * Build the `batch_update_item` body. Single source of truth for the four call
 * sites (widget move, PolymorphicWidget, work-order show add/remove) so their
 * optional fields — `physical_identifier` / `physical_product_id` / `batch_id` —
 * can't drift apart (MOD-06). Falsy optionals are omitted.
 */
export function buildBatchUpdatePayload(input: BatchUpdateItemInput): BatchUpdateItemPayload {
    const payload: BatchUpdateItemPayload = {
        operation: 'batch_update_item',
        product_model_id: input.productModelId,
        delta: input.delta,
    };
    if (input.physicalIdentifier) payload.physical_identifier = input.physicalIdentifier;
    if (input.physicalProductId) payload.physical_product_id = input.physicalProductId;
    if (input.batchId) payload.batch_id = input.batchId;
    return payload;
}
