import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductSelector } from '../components/ProductSelector';
import { QuantityControls } from '../components/QuantityControls';
import { TrackerForm } from '../components/TrackerForm';
import { BatchForm } from '../components/BatchForm';
import { DimensionForm } from '../components/DimensionForm';
import { TimeBasedForm } from '../components/TimeBasedForm';
import type { Product } from '../types';

const mockProduct: Product = {
    id: '1',
    sku: 'SKU-001',
    name: 'Test Product',
    quantity: 42,
    engine_type: 'counter',
};

describe('ProductSelector', () => {
    it('renders product dropdown and shows active product info', () => {
        const onChange = vi.fn();
        render(
            <ProductSelector
                products={[mockProduct]}
                selectedProduct="1"
                productLocked={false}
                onProductChange={onChange}
                activeProduct={mockProduct}
            />
        );
        expect(screen.getByText('SKU-001')).toBeDefined();
        expect(screen.getByText('On Hand')).toBeDefined();
        expect(screen.getByText(/42/)).toBeDefined();
    });

    it('appends unit to On Hand when product.unit is set', () => {
        const withUnit: Product = { ...mockProduct, unit: 'Kg' };
        render(
            <ProductSelector
                products={[withUnit]}
                selectedProduct="1"
                productLocked={false}
                onProductChange={vi.fn()}
                activeProduct={withUnit}
            />
        );
        expect(screen.getByText(/42\s*Kg/)).toBeDefined();
    });

    it('omits unit when product.unit is null', () => {
        const noUnit: Product = { ...mockProduct, unit: null };
        render(
            <ProductSelector
                products={[noUnit]}
                selectedProduct="1"
                productLocked={false}
                onProductChange={vi.fn()}
                activeProduct={noUnit}
            />
        );
        const onHandRegion = screen.getByText('On Hand').parentElement!;
        expect(onHandRegion.textContent).not.toMatch(/Kg/);
    });

    it('disables select when locked', () => {
        render(
            <ProductSelector
                products={[mockProduct]}
                selectedProduct="1"
                productLocked={true}
                onProductChange={vi.fn()}
                activeProduct={mockProduct}
            />
        );
        const select = screen.getByRole('combobox');
        expect(select).toHaveProperty('disabled', true);
    });
});

describe('QuantityControls', () => {
    it('renders quantity input and action buttons', () => {
        const setQuantity = vi.fn();
        const handleMove = vi.fn();
        render(
            <QuantityControls
                quantity="5"
                setQuantity={setQuantity}
                uiConfig={undefined}
                handleMove={handleMove}
                actionLoading={false}
            />
        );
        expect(screen.getByDisplayValue('5')).toBeDefined();
        expect(screen.getByText('Check In')).toBeDefined();
        expect(screen.getByText('Check Out')).toBeDefined();
    });

    it('calls handleMove with correct direction', () => {
        const handleMove = vi.fn();
        render(
            <QuantityControls
                quantity="1"
                setQuantity={vi.fn()}
                uiConfig={undefined}
                handleMove={handleMove}
                actionLoading={false}
            />
        );
        fireEvent.click(screen.getByText('Check In'));
        expect(handleMove).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByText('Check Out'));
        expect(handleMove).toHaveBeenCalledWith(false);
    });

    it('appends unit suffix to Max button when unit set', () => {
        render(
            <QuantityControls
                quantity="0"
                setQuantity={vi.fn()}
                uiConfig={undefined}
                handleMove={vi.fn()}
                actionLoading={false}
                onHand={10}
                unit="Kg"
            />
        );
        expect(screen.getByText('Max 10 Kg')).toBeDefined();
    });

    it('omits unit suffix when unit null', () => {
        render(
            <QuantityControls
                quantity="0"
                setQuantity={vi.fn()}
                uiConfig={undefined}
                handleMove={vi.fn()}
                actionLoading={false}
                onHand={10}
                unit={null}
            />
        );
        expect(screen.getByText('Max 10')).toBeDefined();
    });
});

describe('TrackerForm', () => {
    it('renders identifier input and action buttons', () => {
        const trackerProduct: Product = {
            ...mockProduct,
            profile: "SERIALIZED",
        };
        render(
            <TrackerForm
                identifier="SN-123"
                setIdentifier={vi.fn()}
                identifierLocked={false}
                availableItems={[]}
                activeProduct={trackerProduct}
                batchData={{}}
                setBatchData={vi.fn()}
                handleMove={vi.fn()}
                actionLoading={false}
            />
        );
        expect(screen.getByDisplayValue('SN-123')).toBeDefined();
        expect(screen.getByText('CHECK IN')).toBeDefined();
        expect(screen.getByText('CHECK OUT')).toBeDefined();
    });

    it('renders available items in a Select dropdown and propagates the choice', () => {
        const trackerProduct: Product = {
            ...mockProduct,
            profile: "SERIALIZED",
        };
        const setIdentifier = vi.fn();
        render(
            <TrackerForm
                identifier=""
                setIdentifier={setIdentifier}
                identifierLocked={false}
                availableItems={[{ id: 'i1', identifier: 'ITEM-A', status: 'active' }]}
                activeProduct={trackerProduct}
                batchData={{}}
                setBatchData={vi.fn()}
                handleMove={vi.fn()}
                actionLoading={false}
            />
        );
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(screen.getByText('ITEM-A'));
        expect(setIdentifier).toHaveBeenCalledWith('ITEM-A');
    });
});

describe('BatchForm', () => {
    it('renders dynamic schema fields', () => {
        render(
            <BatchForm
                fields={[
                    { key: 'batch_identifier', label: 'Batch ID', type: 'text' },
                    { key: 'lot_number', label: 'Lot Number', type: 'text' },
                    { key: 'expiry', label: 'Expiry Date', type: 'date' },
                ]}
                batchData={{}}
                setBatchData={vi.fn()}
            />
        );
        // batch_identifier should be filtered out
        expect(screen.queryByText('Batch ID')).toBeNull();
        expect(screen.getByText('Lot Number')).toBeDefined();
        expect(screen.getByText('Expiry Date')).toBeDefined();
    });
});

describe('DimensionForm', () => {
    it('renders dimension fields from uiConfig', () => {
        render(
            <DimensionForm
                uiConfig={{
                    input_type: 'dimension',
                    fields: [
                        { key: 'length', label: 'Length', type: 'number' },
                        { key: 'width', label: 'Width', type: 'number' },
                    ],
                }}
                batchData={{}}
                setBatchData={vi.fn()}
                handleMove={vi.fn()}
                actionLoading={false}
            />
        );
        expect(screen.getByText('Dimension Input')).toBeDefined();
        expect(screen.getByPlaceholderText('Enter length')).toBeDefined();
        expect(screen.getByPlaceholderText('Enter width')).toBeDefined();
    });
});

describe('TimeBasedForm', () => {
    it('renders quantity, batch ref, and action buttons', () => {
        render(
            <TimeBasedForm
                quantity="10"
                setQuantity={vi.fn()}
                expiryDate=""
                setExpiryDate={vi.fn()}
                batchRef=""
                setBatchRef={vi.fn()}
                uiConfig={undefined}
                handleMove={vi.fn()}
                actionLoading={false}
            />
        );
        expect(screen.getByText('Time-Based Entry')).toBeDefined();
        expect(screen.getByDisplayValue('10')).toBeDefined();
        expect(screen.getByPlaceholderText('Optional batch reference')).toBeDefined();
    });

    // Phase 05 (WIDGET-AUDIT-05): submit must be disabled when qty is 0/empty.
    it('disables ADD/REMOVE when quantity is empty or zero', () => {
        const handleMove = vi.fn();
        const { rerender } = render(
            <TimeBasedForm
                quantity=""
                setQuantity={vi.fn()}
                expiryDate=""
                setExpiryDate={vi.fn()}
                batchRef=""
                setBatchRef={vi.fn()}
                uiConfig={undefined}
                handleMove={handleMove}
                actionLoading={false}
            />
        );
        expect(screen.getByText('+ ADD').closest('button')).toHaveProperty('disabled', true);
        expect(screen.getByText('- REMOVE').closest('button')).toHaveProperty('disabled', true);

        rerender(
            <TimeBasedForm
                quantity="0"
                setQuantity={vi.fn()}
                expiryDate=""
                setExpiryDate={vi.fn()}
                batchRef=""
                setBatchRef={vi.fn()}
                uiConfig={undefined}
                handleMove={handleMove}
                actionLoading={false}
            />
        );
        expect(screen.getByText('+ ADD').closest('button')).toHaveProperty('disabled', true);

        rerender(
            <TimeBasedForm
                quantity="3"
                setQuantity={vi.fn()}
                expiryDate=""
                setExpiryDate={vi.fn()}
                batchRef=""
                setBatchRef={vi.fn()}
                uiConfig={undefined}
                handleMove={handleMove}
                actionLoading={false}
            />
        );
        expect(screen.getByText('+ ADD').closest('button')).toHaveProperty('disabled', false);
    });
});

describe('TrackerForm — Phase 05 disabled-state regression', () => {
    it('disables CHECK IN / CHECK OUT when identifier is empty', () => {
        const trackerProduct: Product = { ...mockProduct, profile: 'SERIALIZED' };
        render(
            <TrackerForm
                identifier=""
                setIdentifier={vi.fn()}
                identifierLocked={false}
                availableItems={[]}
                activeProduct={trackerProduct}
                batchData={{}}
                setBatchData={vi.fn()}
                handleMove={vi.fn()}
                actionLoading={false}
            />
        );
        expect(screen.getByText('CHECK IN').closest('button')).toHaveProperty('disabled', true);
        expect(screen.getByText('CHECK OUT').closest('button')).toHaveProperty('disabled', true);
    });

    it('enables CHECK IN / CHECK OUT once identifier is provided', () => {
        const trackerProduct: Product = { ...mockProduct, profile: 'SERIALIZED' };
        render(
            <TrackerForm
                identifier="SN-9"
                setIdentifier={vi.fn()}
                identifierLocked={false}
                availableItems={[]}
                activeProduct={trackerProduct}
                batchData={{}}
                setBatchData={vi.fn()}
                handleMove={vi.fn()}
                actionLoading={false}
            />
        );
        expect(screen.getByText('CHECK IN').closest('button')).toHaveProperty('disabled', false);
        expect(screen.getByText('CHECK OUT').closest('button')).toHaveProperty('disabled', false);
    });
});

describe('DimensionForm — Phase 05 disabled-state regression', () => {
    const dimUi = {
        input_type: 'dimension',
        fields: [
            { name: 'length', label: 'Length', type: 'number', unit: 'm' },
            { name: 'width', label: 'Width', type: 'number', unit: 'm' },
        ],
        formula: 'length * width',
        computed_unit: 'm2',
    };

    it('disables ADD/REMOVE until every dimension is filled with > 0', () => {
        const handleMove = vi.fn();
        const { rerender } = render(
            <DimensionForm
                uiConfig={dimUi}
                batchData={{}}
                setBatchData={vi.fn()}
                handleMove={handleMove}
                actionLoading={false}
            />
        );
        expect(screen.getByText('+ ADD').closest('button')).toHaveProperty('disabled', true);
        expect(screen.getByText('- REMOVE').closest('button')).toHaveProperty('disabled', true);

        rerender(
            <DimensionForm
                uiConfig={dimUi}
                batchData={{ length: '2', width: '3' }}
                setBatchData={vi.fn()}
                handleMove={handleMove}
                actionLoading={false}
            />
        );
        expect(screen.getByText('+ ADD').closest('button')).toHaveProperty('disabled', false);
        expect(screen.getByText('- REMOVE').closest('button')).toHaveProperty('disabled', false);
    });
});
