import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UiConfig } from '../types';

interface BatchTrackedFormProps {
    quantity: string;
    setQuantity: (q: string) => void;
    batchIdentifier: string;
    setBatchIdentifier: (id: string) => void;
    uiConfig: UiConfig | undefined;
    handleMove: (isAdd: boolean) => Promise<void>;
    actionLoading: boolean;
}

/**
 * Check-in form for a plain BATCH_TRACKED product (one with no assembly
 * components). Without this the widget rendered an empty "batch composition"
 * for such products, leaving no way to load their first (or any) stock. The lot
 * id is optional — the backend auto-generates an AUTO-… identifier when blank.
 */
export const BatchTrackedForm: React.FC<BatchTrackedFormProps> = ({
    quantity,
    setQuantity,
    batchIdentifier,
    setBatchIdentifier,
    uiConfig,
    handleMove,
    actionLoading,
}) => {
    const { t } = useTranslation('widget');
    const parsedQty = parseFloat(quantity);
    const hasQty = !isNaN(parsedQty) && parsedQty > 0;
    return (
        <div
            className="mb-6 p-4 rounded-lg"
            data-testid="panel-batch-tracked"
            style={{ backgroundColor: 'var(--pi-surface)', border: '1px solid var(--pi-border)' }}
        >
            <h3
                className="text-sm font-semibold uppercase tracking-wider mb-3 pb-2 flex items-center gap-2"
                style={{ color: 'var(--pi-text)', borderBottom: '1px solid var(--pi-border)' }}
            >
                <span className="text-lg">📦</span> {t('panels.batchTrackedForm.title')}
            </h3>
            <div className="space-y-3">
                <div>
                    <label className="pi-label">{t('common.quantity')}</label>
                    <input
                        type="number"
                        step={uiConfig?.step || 1}
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        className="pi-input text-lg font-bold text-center"
                    />
                </div>
                <div>
                    <label className="pi-label">{t('panels.batchTrackedForm.lotId')}</label>
                    <input
                        type="text"
                        value={batchIdentifier}
                        onChange={e => setBatchIdentifier(e.target.value)}
                        placeholder={t('panels.batchTrackedForm.lotIdOptional')}
                        className="pi-input"
                    />
                </div>
            </div>
            <button
                onClick={() => handleMove(true)}
                disabled={actionLoading || !hasQty}
                className="pi-btn-accent w-full mt-4 p-4 uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {t('common.checkIn')}
            </button>
        </div>
    );
};
