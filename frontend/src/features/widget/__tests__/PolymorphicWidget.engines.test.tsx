import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CounterPanel } from '../components/engines/CounterPanel';
import { BucketPanel } from '../components/engines/BucketPanel';
import { TrackerPanel } from '../components/engines/TrackerPanel';
import { DimensionPanel } from '../components/engines/DimensionPanel';
import { TimeBasedPanel } from '../components/engines/TimeBasedPanel';

describe('CounterPanel', () => {
    it('renders quantity input and add/remove buttons', () => {
        const onTransaction = vi.fn();
        render(
            <CounterPanel
                qty="5"
                setQty={vi.fn()}
                step={1}
                inputLabel="Pieces"
                submitting={false}
                onTransaction={onTransaction}
            />
        );

        expect(screen.getByDisplayValue('5')).toBeInTheDocument();
        expect(screen.getByText('Pieces')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ADD' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'REMOVE' })).toBeInTheDocument();
    });

    it('calls onTransaction with correct operation', () => {
        const onTransaction = vi.fn();
        render(
            <CounterPanel qty="3" setQty={vi.fn()} submitting={false} onTransaction={onTransaction} />
        );

        fireEvent.click(screen.getByRole('button', { name: 'ADD' }));
        expect(onTransaction).toHaveBeenCalledWith('add');

        fireEvent.click(screen.getByRole('button', { name: 'REMOVE' }));
        expect(onTransaction).toHaveBeenCalledWith('subtract');
    });

    it('disables buttons when submitting', () => {
        render(
            <CounterPanel qty="1" setQty={vi.fn()} submitting={true} onTransaction={vi.fn()} />
        );

        expect(screen.getByRole('button', { name: 'ADD' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'REMOVE' })).toBeDisabled();
    });

    it('defaults label to Quantity when inputLabel not provided', () => {
        render(
            <CounterPanel qty="" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
        );
        expect(screen.getByText('Quantity')).toBeInTheDocument();
    });
});

describe('BucketPanel', () => {
    const fields = [
        { key: 'lot_number', label: 'Lot Number', type: 'text' },
        { key: 'expiry', label: 'Expiry', type: 'date' },
    ];

    it('renders fields and quantity input', () => {
        render(
            <BucketPanel
                fields={fields}
                bucketData={{}}
                setBucketData={vi.fn()}
                qty=""
                setQty={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByPlaceholderText('Lot Number')).toBeInTheDocument();
        expect(screen.getByText('Expiry')).toBeInTheDocument();
        expect(screen.getByText('REMOVE STOCK')).toBeInTheDocument();
    });

    it('calls onTransaction subtract', () => {
        const onTransaction = vi.fn();
        render(
            <BucketPanel
                fields={fields}
                bucketData={{}}
                setBucketData={vi.fn()}
                qty="10"
                setQty={vi.fn()}
                submitting={false}
                onTransaction={onTransaction}
            />
        );

        fireEvent.click(screen.getByText('REMOVE STOCK'));
        expect(onTransaction).toHaveBeenCalledWith('subtract');
    });
});

describe('TrackerPanel', () => {
    const fields = [
        { name: 'physical_product_id', label: 'Item' },
        { name: 'new_status', label: 'Status', options: ['ACTIVE', 'MAINTENANCE'] },
        { name: 'notes', label: 'Notes' },
    ];

    it('renders status buttons and notes field', () => {
        render(
            <TrackerPanel
                fields={fields}
                trackerItemId=""
                setTrackerItemId={vi.fn()}
                trackerStatus=""
                setTrackerStatus={vi.fn()}
                trackerNotes=""
                setTrackerNotes={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
        expect(screen.getByText('MAINTENANCE')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Optional notes...')).toBeInTheDocument();
    });

    it('disables submit when no item or status selected', () => {
        render(
            <TrackerPanel
                fields={fields}
                trackerItemId=""
                setTrackerItemId={vi.fn()}
                trackerStatus=""
                setTrackerStatus={vi.fn()}
                trackerNotes=""
                setTrackerNotes={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByText('UPDATE STATUS')).toBeDisabled();
    });

    it('enables submit when item and status selected', () => {
        render(
            <TrackerPanel
                fields={fields}
                trackerItemId="item-1"
                setTrackerItemId={vi.fn()}
                trackerStatus="ACTIVE"
                setTrackerStatus={vi.fn()}
                trackerNotes=""
                setTrackerNotes={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByText('UPDATE STATUS')).toBeEnabled();
    });
});

describe('DimensionPanel', () => {
    const fields = [
        { name: 'length', label: 'Length', unit: 'm' },
        { name: 'width', label: 'Width', unit: 'm' },
    ];

    it('renders dimension fields with units', () => {
        render(
            <DimensionPanel
                fields={fields}
                formula="length * width"
                computedUnit="m²"
                dimensionValues={{}}
                setDimensionValues={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByText('Length (m)')).toBeInTheDocument();
        expect(screen.getByText('Width (m)')).toBeInTheDocument();
    });

    it('shows computed value when all fields filled', () => {
        render(
            <DimensionPanel
                fields={fields}
                formula="length * width"
                computedUnit="m²"
                dimensionValues={{ length: '3', width: '4' }}
                setDimensionValues={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByText('12.00 m²')).toBeInTheDocument();
    });

    it('disables buttons when not all fields filled', () => {
        render(
            <DimensionPanel
                fields={fields}
                formula="length * width"
                computedUnit="m²"
                dimensionValues={{ length: '3' }}
                setDimensionValues={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: 'ADD' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'REMOVE' })).toBeDisabled();
    });
});

describe('TimeBasedPanel', () => {
    it('renders quantity and batch reference inputs', () => {
        render(
            <TimeBasedPanel
                qty=""
                setQty={vi.fn()}
                step={1}
                expiryTracking={false}
                expiryDate=""
                setExpiryDate={vi.fn()}
                batchRef=""
                setBatchRef={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByPlaceholderText('Optional batch reference')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ADD' })).toBeInTheDocument();
    });

    it('shows expiry date when expiryTracking enabled', () => {
        render(
            <TimeBasedPanel
                qty=""
                setQty={vi.fn()}
                expiryTracking={true}
                expiryDate=""
                setExpiryDate={vi.fn()}
                batchRef=""
                setBatchRef={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.getByText('Expiry Date')).toBeInTheDocument();
    });

    it('hides expiry date when expiryTracking disabled', () => {
        render(
            <TimeBasedPanel
                qty=""
                setQty={vi.fn()}
                expiryTracking={false}
                expiryDate=""
                setExpiryDate={vi.fn()}
                batchRef=""
                setBatchRef={vi.fn()}
                submitting={false}
                onTransaction={vi.fn()}
            />
        );

        expect(screen.queryByText('Expiry Date')).not.toBeInTheDocument();
    });
});
