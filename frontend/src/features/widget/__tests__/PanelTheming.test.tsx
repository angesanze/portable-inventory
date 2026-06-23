import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CounterPanel } from '../components/engines/CounterPanel';
import { BucketPanel } from '../components/engines/BucketPanel';
import { TrackerPanel } from '../components/engines/TrackerPanel';
import { DimensionPanel } from '../components/engines/DimensionPanel';
import { TimeBasedPanel } from '../components/engines/TimeBasedPanel';
import { BatchManagerPanel } from '../components/engines/BatchManagerPanel';
import type { BatchManagerData } from '../types';

describe('Panel theming — CSS custom property classes', () => {
    describe('CounterPanel', () => {
        it('uses pi-label class on label', () => {
            render(
                <CounterPanel qty="1" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
            );
            const label = screen.getByText('Quantity');
            expect(label.className).toContain('pi-label');
        });

        it('uses pi-input class on input', () => {
            render(
                <CounterPanel qty="5" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
            );
            const input = screen.getByDisplayValue('5');
            expect(input.className).toContain('pi-input');
        });

        it('uses pi-btn-success on ADD button', () => {
            render(
                <CounterPanel qty="1" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
            );
            const addBtn = screen.getByRole('button', { name: 'ADD' });
            expect(addBtn.className).toContain('pi-btn-success');
        });

        it('uses pi-btn-danger on REMOVE button', () => {
            render(
                <CounterPanel qty="1" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
            );
            const removeBtn = screen.getByRole('button', { name: 'REMOVE' });
            expect(removeBtn.className).toContain('pi-btn-danger');
        });
    });

    describe('BucketPanel', () => {
        const fields = [{ key: 'lot', label: 'Lot Number', type: 'text' }];

        it('uses pi-label on field labels', () => {
            render(
                <BucketPanel fields={fields} bucketData={{}} setBucketData={vi.fn()} qty="1" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
            );
            expect(screen.getByText('Lot Number').className).toContain('pi-label');
            expect(screen.getByText('Quantity').className).toContain('pi-label');
        });

        it('uses pi-input on inputs', () => {
            render(
                <BucketPanel fields={fields} bucketData={{}} setBucketData={vi.fn()} qty="3" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
            );
            const inputs = screen.getAllByRole('textbox');
            inputs.forEach(input => {
                expect(input.className).toContain('pi-input');
            });
        });

        it('uses pi-btn-accent on REMOVE STOCK button', () => {
            render(
                <BucketPanel fields={fields} bucketData={{}} setBucketData={vi.fn()} qty="1" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
            );
            expect(screen.getByText('REMOVE STOCK').className).toContain('pi-btn-accent');
        });
    });

    describe('TrackerPanel', () => {
        const fields = [
            { name: 'physical_product_id', label: 'Item', options: [] },
            { name: 'new_status', label: 'Status', options: ['Active', 'Repair'] },
            { name: 'notes', label: 'Notes' },
        ];

        it('uses pi-label on field labels', () => {
            render(
                <TrackerPanel
                    fields={fields}
                    trackerItemId="" setTrackerItemId={vi.fn()}
                    trackerStatus="" setTrackerStatus={vi.fn()}
                    trackerNotes="" setTrackerNotes={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            expect(screen.getByText('Item').className).toContain('pi-label');
            expect(screen.getByText('Status').className).toContain('pi-label');
            expect(screen.getByText('Notes').className).toContain('pi-label');
        });

        it('uses pi-status-btn on status buttons', () => {
            render(
                <TrackerPanel
                    fields={fields}
                    trackerItemId="" setTrackerItemId={vi.fn()}
                    trackerStatus="" setTrackerStatus={vi.fn()}
                    trackerNotes="" setTrackerNotes={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            const activeBtn = screen.getByText('Active');
            expect(activeBtn.className).toContain('pi-status-btn');
        });

        it('adds active class to selected status', () => {
            render(
                <TrackerPanel
                    fields={fields}
                    trackerItemId="x" setTrackerItemId={vi.fn()}
                    trackerStatus="Repair" setTrackerStatus={vi.fn()}
                    trackerNotes="" setTrackerNotes={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            const repairBtn = screen.getByText('Repair');
            expect(repairBtn.className).toContain('active');
            const activeBtn = screen.getByText('Active');
            expect(activeBtn.className).not.toContain('active');
        });

        it('uses pi-btn-accent on UPDATE STATUS button', () => {
            render(
                <TrackerPanel
                    fields={fields}
                    trackerItemId="x" setTrackerItemId={vi.fn()}
                    trackerStatus="Active" setTrackerStatus={vi.fn()}
                    trackerNotes="" setTrackerNotes={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            expect(screen.getByText('UPDATE STATUS').className).toContain('pi-btn-accent');
        });
    });

    describe('DimensionPanel', () => {
        const fields = [
            { name: 'length', label: 'Length', unit: 'm' },
            { name: 'width', label: 'Width', unit: 'm' },
        ];

        it('uses pi-label on dimension field labels', () => {
            render(
                <DimensionPanel
                    fields={fields} formula="length * width" computedUnit="m²"
                    dimensionValues={{}} setDimensionValues={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            expect(screen.getByText('Length (m)').className).toContain('pi-label');
            expect(screen.getByText('Width (m)').className).toContain('pi-label');
        });

        it('uses pi-input on dimension inputs', () => {
            render(
                <DimensionPanel
                    fields={fields} formula="length * width" computedUnit="m²"
                    dimensionValues={{}} setDimensionValues={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            const inputs = screen.getAllByRole('spinbutton');
            inputs.forEach(input => {
                expect(input.className).toContain('pi-input');
            });
        });

        it('uses pi-computed classes on computed value display', () => {
            render(
                <DimensionPanel
                    fields={fields} formula="length * width" computedUnit="m²"
                    dimensionValues={{ length: '3', width: '4' }} setDimensionValues={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            expect(screen.getByText('Computed Value').className).toContain('pi-computed-label');
            expect(screen.getByText('12.00 m²').className).toContain('pi-computed-value');
            expect(screen.getByText('Formula: length * width').className).toContain('pi-computed-hint');
        });

        it('uses pi-btn-success and pi-btn-danger on action buttons', () => {
            render(
                <DimensionPanel
                    fields={fields} formula="length * width" computedUnit="m²"
                    dimensionValues={{ length: '2', width: '5' }} setDimensionValues={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            expect(screen.getByRole('button', { name: 'ADD' }).className).toContain('pi-btn-success');
            expect(screen.getByRole('button', { name: 'REMOVE' }).className).toContain('pi-btn-danger');
        });
    });

    describe('TimeBasedPanel', () => {
        it('uses pi-label and pi-input on all fields', () => {
            render(
                <TimeBasedPanel
                    qty="10" setQty={vi.fn()} expiryTracking={true}
                    expiryDate="" setExpiryDate={vi.fn()}
                    batchRef="" setBatchRef={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            expect(screen.getByText('Quantity').className).toContain('pi-label');
            expect(screen.getByText('Expiry Date').className).toContain('pi-label');
            expect(screen.getByText('Batch Reference').className).toContain('pi-label');

            const qtyInput = screen.getByDisplayValue('10');
            expect(qtyInput.className).toContain('pi-input');
        });

        it('uses pi-btn-success and pi-btn-danger', () => {
            render(
                <TimeBasedPanel
                    qty="1" setQty={vi.fn()} expiryTracking={false}
                    expiryDate="" setExpiryDate={vi.fn()}
                    batchRef="" setBatchRef={vi.fn()}
                    submitting={false} onTransaction={vi.fn()}
                />
            );
            expect(screen.getByRole('button', { name: 'ADD' }).className).toContain('pi-btn-success');
            expect(screen.getByRole('button', { name: 'REMOVE' }).className).toContain('pi-btn-danger');
        });
    });

    describe('BatchManagerPanel', () => {
        const mockData = {
            product_name: 'Test Batch Product',
            grouped_items: {
                m1: {
                    model: { id: 'm1', name: 'Model A', sku: 'MOD-A', tracking_mode: 'BULK' },
                    total_quantity: 50,
                    items: [],
                },
            },
        } as BatchManagerData;

        it('uses pi-surface-dark class on root container', () => {
            const { container } = render(
                <BatchManagerPanel data={mockData} submitting={false} message={null} onBatchTransaction={vi.fn()} />
            );
            const root = container.firstElementChild as HTMLElement;
            expect(root.className).toContain('pi-surface-dark');
        });

        it('uses --pi-font CSS var on root', () => {
            const { container } = render(
                <BatchManagerPanel data={mockData} submitting={false} message={null} onBatchTransaction={vi.fn()} />
            );
            const root = container.firstElementChild as HTMLElement;
            expect(root.style.fontFamily).toContain('var(--pi-font');
        });

        it('uses --pi-primary CSS var for header accent', () => {
            const { container } = render(
                <BatchManagerPanel data={mockData} submitting={false} message={null} onBatchTransaction={vi.fn()} />
            );
            const header = container.querySelector('.flex.items-center.justify-between') as HTMLElement;
            expect(header.style.backgroundColor).toContain('--pi-primary');
        });

        it('uses --pi-primary for total stock count color', () => {
            render(
                <BatchManagerPanel data={mockData} submitting={false} message={null} onBatchTransaction={vi.fn()} />
            );
            const stockCount = screen.getByText('50');
            expect(stockCount.style.color).toContain('--pi-primary');
        });

        it('uses --pi-success CSS var for success messages', () => {
            render(
                <BatchManagerPanel
                    data={mockData} submitting={false}
                    message={{ type: 'success', text: 'Stock updated!' }}
                    onBatchTransaction={vi.fn()}
                />
            );
            const msgEl = screen.getByText('Stock updated!').closest('div') as HTMLElement;
            expect(msgEl.style.backgroundColor).toContain('--pi-success');
        });

        it('uses --pi-danger CSS var for error messages', () => {
            render(
                <BatchManagerPanel
                    data={mockData} submitting={false}
                    message={{ type: 'error', text: 'Failed!' }}
                    onBatchTransaction={vi.fn()}
                />
            );
            const msgEl = screen.getByText('Failed!').closest('div') as HTMLElement;
            expect(msgEl.style.backgroundColor).toContain('--pi-danger');
        });

        // UI Native-Style Audit P07: the lot withdraw flow uses an inline input,
        // not the native window.prompt() dialog.
        const batchData = {
            product_name: 'Test Batch Product',
            grouped_items: {
                m1: {
                    model: { id: 'm1', name: 'Model A', sku: 'MOD-A', tracking_mode: 'BULK' },
                    total_quantity: 50,
                    items: [
                        { id: 'pb1', batch_identifier: 'LOT-001', quantity: 10 },
                    ],
                },
            },
        } as BatchManagerData;

        it('withdraws via an inline input instead of window.prompt', () => {
            const promptSpy = vi.spyOn(window, 'prompt');
            const onBatchTransaction = vi.fn();
            render(
                <BatchManagerPanel data={batchData} submitting={false} message={null} onBatchTransaction={onBatchTransaction} />
            );

            // Open the inline editor — no native prompt should fire.
            fireEvent.click(screen.getByLabelText('Withdraw from lot'));
            expect(promptSpy).not.toHaveBeenCalled();

            const input = screen.getByLabelText('Quantity to withdraw') as HTMLInputElement;
            fireEvent.change(input, { target: { value: '3' } });
            fireEvent.click(screen.getByLabelText('Confirm withdrawal'));

            expect(onBatchTransaction).toHaveBeenCalledWith('m1', -3, null, null, 'pb1');
            promptSpy.mockRestore();
        });

        it('cancel closes the inline withdraw editor without a transaction', () => {
            const onBatchTransaction = vi.fn();
            render(
                <BatchManagerPanel data={batchData} submitting={false} message={null} onBatchTransaction={onBatchTransaction} />
            );

            fireEvent.click(screen.getByLabelText('Withdraw from lot'));
            fireEvent.click(screen.getByLabelText('Cancel withdrawal'));

            expect(onBatchTransaction).not.toHaveBeenCalled();
            expect(screen.queryByLabelText('Quantity to withdraw')).toBeNull();
        });
    });

    // Phase 09 — DOM snapshot baselines per panel under default + branded theme.
    // Captures visual regressions in class composition / inline style usage so
    // future drift surfaces in CI diff output. No real screenshot harness
    // (playwright/storybook) is installed; this is the documented fallback.
    describe('DOM snapshots — default + branded theme', () => {
        const withTheme = (primary: string | null, fn: () => void) => {
            const root = document.documentElement;
            const prev = root.style.getPropertyValue('--pi-primary');
            if (primary) {
                root.style.setProperty('--pi-primary', primary);
            } else {
                root.style.removeProperty('--pi-primary');
            }
            try {
                fn();
            } finally {
                if (prev) {
                    root.style.setProperty('--pi-primary', prev);
                } else {
                    root.style.removeProperty('--pi-primary');
                }
            }
        };

        const themes: Array<[string, string | null]> = [
            ['default theme', null],
            ['branded theme (--pi-primary: #ff4500)', '#ff4500'],
        ];

        const trackerFields = [
            { name: 'physical_product_id', label: 'Item', options: [] },
            { name: 'new_status', label: 'Status', options: ['Active', 'Repair'] },
            { name: 'notes', label: 'Notes' },
        ];
        const bucketFields = [{ key: 'lot', label: 'Lot Number', type: 'text' }];
        const dimensionFields = [
            { name: 'length', label: 'Length', unit: 'm' },
            { name: 'width', label: 'Width', unit: 'm' },
        ];
        const batchData = {
            product_name: 'Test Batch Product',
            grouped_items: {
                m1: {
                    model: { id: 'm1', name: 'Model A', sku: 'MOD-A', tracking_mode: 'BULK' },
                    total_quantity: 50,
                    items: [],
                },
            },
        } as BatchManagerData;

        themes.forEach(([themeName, primary]) => {
            describe(themeName, () => {
                it('CounterPanel snapshot', () => {
                    withTheme(primary, () => {
                        const { container } = render(
                            <CounterPanel qty="1" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
                        );
                        expect(container).toMatchSnapshot();
                    });
                });

                it('BucketPanel snapshot', () => {
                    withTheme(primary, () => {
                        const { container } = render(
                            <BucketPanel fields={bucketFields} bucketData={{}} setBucketData={vi.fn()} qty="1" setQty={vi.fn()} submitting={false} onTransaction={vi.fn()} />
                        );
                        expect(container).toMatchSnapshot();
                    });
                });

                it('TrackerPanel snapshot', () => {
                    withTheme(primary, () => {
                        const { container } = render(
                            <TrackerPanel
                                fields={trackerFields}
                                trackerItemId="" setTrackerItemId={vi.fn()}
                                trackerStatus="" setTrackerStatus={vi.fn()}
                                trackerNotes="" setTrackerNotes={vi.fn()}
                                submitting={false} onTransaction={vi.fn()}
                            />
                        );
                        expect(container).toMatchSnapshot();
                    });
                });

                it('DimensionPanel snapshot', () => {
                    withTheme(primary, () => {
                        const { container } = render(
                            <DimensionPanel
                                fields={dimensionFields} formula="length * width" computedUnit="m²"
                                dimensionValues={{ length: '3', width: '4' }} setDimensionValues={vi.fn()}
                                submitting={false} onTransaction={vi.fn()}
                            />
                        );
                        expect(container).toMatchSnapshot();
                    });
                });

                it('TimeBasedPanel snapshot', () => {
                    withTheme(primary, () => {
                        const { container } = render(
                            <TimeBasedPanel
                                qty="10" setQty={vi.fn()} expiryTracking={true}
                                expiryDate="" setExpiryDate={vi.fn()}
                                batchRef="" setBatchRef={vi.fn()}
                                submitting={false} onTransaction={vi.fn()}
                            />
                        );
                        expect(container).toMatchSnapshot();
                    });
                });

                it('BatchManagerPanel snapshot', () => {
                    withTheme(primary, () => {
                        const { container } = render(
                            <BatchManagerPanel data={batchData} submitting={false} message={null} onBatchTransaction={vi.fn()} />
                        );
                        expect(container).toMatchSnapshot();
                    });
                });
            });
        });
    });
});
