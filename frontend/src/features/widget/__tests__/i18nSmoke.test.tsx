import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nWrapper, i18n } from '../../../test-utils/i18n-wrapper';
import { TrackerForm } from '../components/TrackerForm';
import { TrackerStatusForm } from '../components/TrackerStatusForm';
import { QuantityControls } from '../components/QuantityControls';
import type { PhysicalItem, Product } from '../types';

// Phase 09 — i18n smoke test. Each panel must render at least one Italian
// token when the runtime locale is `it`, proving the t() wiring resolves
// against `it/widget.json` and no English fallthrough remains on the keys we
// care about.

const trackerProduct: Product = {
    id: 'p-1',
    sku: 'SKU-1',
    name: 'Tracker Product',
    profile: 'SERIALIZED',
    quantity: 1,
};

describe('widget panels — Italian smoke', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('it');
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('TrackerForm renders Italian copy', () => {
        render(
            <I18nWrapper>
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
            </I18nWrapper>,
        );
        expect(screen.getByText(/Identificazione Articolo/i)).toBeInTheDocument();
        expect(screen.getByText(/Scansiona o Inserisci ID/i)).toBeInTheDocument();
    });

    it('TrackerStatusForm renders Italian copy', () => {
        const items: PhysicalItem[] = [
            { id: 'pp-1', identifier: 'SN-1', status: 'ACTIVE' },
        ];
        render(
            <I18nWrapper>
                <TrackerStatusForm
                    identifier=""
                    setIdentifier={vi.fn()}
                    identifierLocked={false}
                    availableItems={items}
                    transitions={{ ACTIVE: ['BROKEN'] }}
                    onStatusChange={vi.fn()}
                    actionLoading={false}
                />
            </I18nWrapper>,
        );
        expect(screen.getByText(/Cambio Stato Articolo/i)).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'APPLICA CAMBIO STATO' }),
        ).toBeInTheDocument();
    });

    it('QuantityControls renders Italian copy', () => {
        render(
            <I18nWrapper>
                <QuantityControls
                    quantity="3"
                    setQuantity={vi.fn()}
                    uiConfig={undefined}
                    handleMove={vi.fn()}
                    actionLoading={false}
                    onHand={10}
                />
            </I18nWrapper>,
        );
        expect(screen.getByText(/Quantità/i)).toBeInTheDocument();
        expect(screen.getByText(/Regolazione Rapida/i)).toBeInTheDocument();
    });
});
