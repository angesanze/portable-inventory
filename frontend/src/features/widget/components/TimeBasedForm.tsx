import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UiConfig } from '../types';

interface TimeBasedFormProps {
    quantity: string;
    setQuantity: (q: string) => void;
    expiryDate: string;
    setExpiryDate: (d: string) => void;
    batchRef: string;
    setBatchRef: (r: string) => void;
    uiConfig: UiConfig | undefined;
    handleMove: (isAdd: boolean) => Promise<void>;
    actionLoading: boolean;
}

export const TimeBasedForm: React.FC<TimeBasedFormProps> = ({
    quantity,
    setQuantity,
    expiryDate,
    setExpiryDate,
    batchRef,
    setBatchRef,
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
            data-testid="panel-time-based"
            style={{ backgroundColor: 'var(--pi-surface)', border: '1px solid var(--pi-border)' }}
        >
            <h3
                className="text-sm font-semibold uppercase tracking-wider mb-3 pb-2 flex items-center gap-2"
                style={{ color: 'var(--pi-text)', borderBottom: '1px solid var(--pi-border)' }}
            >
                <span className="text-lg">⏱️</span> {t('panels.timeBasedForm.title')}
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

                {(uiConfig as any)?.expiry_tracking && (
                    <div>
                        <label className="pi-label">{t('panels.timeBasedForm.expiryDate')}</label>
                        <input
                            type="date"
                            value={expiryDate}
                            onChange={e => setExpiryDate(e.target.value)}
                            className="pi-input"
                        />
                    </div>
                )}

                <div>
                    <label className="pi-label">{t('panels.timeBasedForm.batchReference')}</label>
                    <input
                        type="text"
                        value={batchRef}
                        onChange={e => setBatchRef(e.target.value)}
                        placeholder={t('panels.timeBasedForm.batchReferenceOptional')}
                        className="pi-input"
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                    onClick={() => handleMove(true)}
                    disabled={actionLoading || !hasQty}
                    className="pi-btn-accent p-4 flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="text-sm uppercase tracking-wider">{t('common.addPlus')}</span>
                    <span className="text-xs opacity-75">{t('panels.timeBasedForm.addWithExpiry')}</span>
                </button>
                <button
                    onClick={() => handleMove(false)}
                    disabled={actionLoading || !hasQty}
                    className="pi-btn-ghost p-4 flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="text-sm uppercase tracking-wider">{t('common.removeMinus')}</span>
                    <span className="text-xs opacity-60">{t('common.removeStockTitle')}</span>
                </button>
            </div>
        </div>
    );
};
