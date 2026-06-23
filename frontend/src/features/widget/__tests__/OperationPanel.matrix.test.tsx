import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperationPanel } from '../components/OperationPanel';
import type { Product } from '../types';
import type { InventoryProfile } from '../../../types/api';

/**
 * Parametric dispatcher matrix for OperationPanel.renderStrategyPanel.
 *
 * For each (profile × hasPreset) row in the contract, render OperationPanel
 * with a minimal product and assert the expected panel root mounts. The
 * dispatcher's branch order is documented inline in OperationPanel.tsx.
 */

interface MatrixRow {
    name: string;
    profile: InventoryProfile;
    hasPreset: boolean;
    expectedTestId: string;
}

const MATRIX: MatrixRow[] = [
    { name: 'SIMPLE_COUNT → QuantityControls',                      profile: 'SIMPLE_COUNT',     hasPreset: false, expectedTestId: 'panel-quantity' },
    { name: 'UNIT_CONVERSION → QuantityControls',                   profile: 'UNIT_CONVERSION',  hasPreset: false, expectedTestId: 'panel-quantity' },
    { name: 'DIMENSIONAL → DimensionForm',                          profile: 'DIMENSIONAL',      hasPreset: false, expectedTestId: 'panel-dimension' },
    { name: 'BATCH_TRACKED → BatchComposition',                     profile: 'BATCH_TRACKED',    hasPreset: false, expectedTestId: 'panel-batch-composition' },
    { name: 'PERISHABLE → TimeBasedForm',                           profile: 'PERISHABLE',       hasPreset: false, expectedTestId: 'panel-time-based' },
    { name: 'SERIALIZED (no preset) → TrackerForm',                 profile: 'SERIALIZED',       hasPreset: false, expectedTestId: 'panel-tracker-form' },
    { name: 'SERIALIZED (with status_transitions) → TrackerStatusForm', profile: 'SERIALIZED',   hasPreset: true,  expectedTestId: 'panel-tracker-status' },
    { name: 'ASSEMBLED → Work Order Management',                    profile: 'ASSEMBLED',        hasPreset: false, expectedTestId: 'panel-work-order' },
];

function buildProduct(profile: InventoryProfile, hasPreset: boolean): Product {
    const calc_config: NonNullable<Product['calc_config']> = {
        engine: 'counter',
        ui_config: { input_type: 'number' },
    };
    if (hasPreset) {
        calc_config.status_transitions = { ACTIVE: ['BROKEN'], BROKEN: ['REPAIRED'] };
    }
    return {
        id: 'p-1',
        sku: 'SKU-1',
        name: `Test ${profile}`,
        profile,
        quantity: 0,
        calc_config,
        components: profile === 'BATCH_TRACKED' || profile === 'ASSEMBLED' ? [] : undefined,
    };
}

function renderForRow(row: MatrixRow) {
    const product = buildProduct(row.profile, row.hasPreset);
    // ASSEMBLED needs batchManagerData to render the inner BatchComposition,
    // but the panel-work-order root is always emitted for profile === 'ASSEMBLED'.
    const batchManagerData = row.profile === 'ASSEMBLED' ? { grouped_items: {} } : null;
    return render(
        <OperationPanel
            companyName="Acme"
            activeSubLocation={{ id: 'loc-1', name: 'Main', type: 'PHYSICAL' }}
            locationLocked
            onBackToLocation={vi.fn()}
            products={[product]}
            selectedProduct="p-1"
            productLocked
            onProductChange={vi.fn()}
            handleMove={vi.fn(async () => {})}
            handleStatusChange={vi.fn(async () => {})}
            actionLoading={false}
            message={null}
            quantity="0"
            setQuantity={vi.fn()}
            identifier=""
            setIdentifier={vi.fn()}
            identifierLocked={false}
            availableItems={[]}
            batchIdentifier=""
            setBatchIdentifier={vi.fn()}
            batchData={{}}
            setBatchData={vi.fn()}
            expiryDate=""
            setExpiryDate={vi.fn()}
            batchRef=""
            setBatchRef={vi.fn()}
            batchManagerData={batchManagerData}
            expandedModelId={null}
            setExpandedModelId={vi.fn()}
            loadComponentBatches={vi.fn(async () => {})}
            loadAvailableItems={vi.fn(async () => {})}
            selectedLocation="loc-1"
            setMessage={vi.fn()}
        />
    );
}

describe('OperationPanel dispatcher matrix', () => {
    it.each(MATRIX)('$name', (row) => {
        renderForRow(row);
        const panel = screen.getByTestId(row.expectedTestId);
        expect(panel).toBeInTheDocument();

        // Exclusivity sanity: no other panel root from the matrix should be mounted.
        const otherTestIds = MATRIX
            .map(r => r.expectedTestId)
            .filter(id => id !== row.expectedTestId);
        for (const otherId of otherTestIds) {
            // BatchComposition appears nested inside panel-work-order for ASSEMBLED
            // (when batchManagerData is provided). Skip that one pair only.
            if (row.expectedTestId === 'panel-work-order' && otherId === 'panel-batch-composition') continue;
            expect(screen.queryByTestId(otherId)).not.toBeInTheDocument();
        }
    });
});
