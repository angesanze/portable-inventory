import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrackerStatusForm } from '../components/TrackerStatusForm';
import { OperationPanel } from '../components/OperationPanel';
import type { Product, PhysicalItem } from '../types';

describe('TrackerStatusForm', () => {
    const transitions = { ACTIVE: ['BROKEN'], BROKEN: ['REPAIRED'], REPAIRED: ['ACTIVE'] };
    const items: PhysicalItem[] = [
        { id: 'pp-1', identifier: 'SN-1', status: 'ACTIVE' },
    ];

    it('renders status buttons derived from current status transitions', () => {
        render(
            <TrackerStatusForm
                identifier="SN-1"
                setIdentifier={vi.fn()}
                identifierLocked={false}
                availableItems={items}
                transitions={transitions}
                onStatusChange={vi.fn()}
                actionLoading={false}
            />
        );
        // current SN-1 status = ACTIVE → allowed transitions = [BROKEN]
        expect(screen.getByRole('button', { name: 'BROKEN' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'REPAIRED' })).not.toBeInTheDocument();
    });

    it('submit disabled until identifier + status chosen', () => {
        const onStatusChange = vi.fn();
        render(
            <TrackerStatusForm
                identifier=""
                setIdentifier={vi.fn()}
                identifierLocked={false}
                availableItems={items}
                transitions={transitions}
                onStatusChange={onStatusChange}
                actionLoading={false}
            />
        );
        expect(screen.getByRole('button', { name: 'APPLY STATUS CHANGE' })).toBeDisabled();
    });

    it('fires onStatusChange with chosen status + identifier', async () => {
        const onStatusChange = vi.fn().mockResolvedValue(undefined);
        render(
            <TrackerStatusForm
                identifier="SN-1"
                setIdentifier={vi.fn()}
                identifierLocked={false}
                availableItems={items}
                transitions={transitions}
                onStatusChange={onStatusChange}
                actionLoading={false}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'BROKEN' }));
        fireEvent.click(screen.getByRole('button', { name: 'APPLY STATUS CHANGE' }));
        await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(1));
        expect(onStatusChange).toHaveBeenCalledWith({
            identifier: 'SN-1',
            newStatus: 'BROKEN',
            notes: undefined,
        });
    });
});

describe('OperationPanel tracker branch', () => {
    it('renders TrackerStatusForm (no CHECK IN/CHECK OUT) for SERIALIZED + status_transitions product', () => {
        const product: Product = {
            id: 'p-1',
            sku: 'TRK-1',
            name: 'Tracker Prod',
            profile: 'SERIALIZED',
            quantity: 1,
            calc_config: {
                engine: 'tracker',
                ui_config: {
                    input_type: 'tracker',
                },
                status_transitions: { ACTIVE: ['BROKEN'] },
            },
        };
        render(
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
                quantity="1"
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
                batchManagerData={null}
                expandedModelId={null}
                setExpandedModelId={vi.fn()}
                loadComponentBatches={vi.fn(async () => {})}
                loadAvailableItems={vi.fn(async () => {})}
                selectedLocation="loc-1"
                setMessage={vi.fn()}
            />
        );
        expect(screen.getByRole('button', { name: 'APPLY STATUS CHANGE' })).toBeInTheDocument();
        expect(screen.queryByText('CHECK IN')).not.toBeInTheDocument();
        expect(screen.queryByText('CHECK OUT')).not.toBeInTheDocument();
    });
});
