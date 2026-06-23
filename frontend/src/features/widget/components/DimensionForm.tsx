import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UiConfig } from '../types';
import { safeEvalFormula } from '../calculator/utils';

interface DimensionFormProps {
    uiConfig: UiConfig | undefined;
    batchData: Record<string, string>;
    setBatchData: (d: Record<string, string>) => void;
    handleMove: (isAdd: boolean) => Promise<void>;
    actionLoading: boolean;
}

export const DimensionForm: React.FC<DimensionFormProps> = ({
    uiConfig,
    batchData,
    setBatchData,
    handleMove,
    actionLoading,
}) => {
    const { t } = useTranslation('widget');
    const fields = uiConfig?.fields || [];
    const formula: string = uiConfig?.formula || '';
    const computedUnit: string = uiConfig?.computed_unit || '';

    // Dimension fields always carry a `name`; the shared UiConfigField type keeps
    // it optional for bucket forms, so assert the key here (runtime unchanged).
    const allFilled = fields.every(f => batchData[f.name as string] && parseFloat(batchData[f.name as string]) > 0);
    let computedValue: number | null = null;
    if (allFilled && formula) {
        try {
            let expr = formula;
            fields.forEach(f => {
                expr = expr.replace(new RegExp(`\\b${f.name}\\b`, 'g'), String(parseFloat(batchData[f.name as string]) || 0));
            });
            const evaluated = safeEvalFormula(expr);
            if (!isNaN(evaluated)) {
                computedValue = evaluated;
            }
        } catch {
            computedValue = null;
        }
    }

    return (
        <div
            className="mb-6 p-4 rounded-lg"
            data-testid="panel-dimension"
            style={{ backgroundColor: 'var(--pi-surface)', border: '1px solid var(--pi-border)' }}
        >
            <h3
                className="text-sm font-semibold uppercase tracking-wider mb-3 pb-2 flex items-center gap-2"
                style={{ color: 'var(--pi-text)', borderBottom: '1px solid var(--pi-border)' }}
            >
                <span className="text-lg">📐</span> {t('panels.dimensionForm.title')}
            </h3>
            <div className="space-y-3">
                {fields.map(field => (
                    <div key={field.name}>
                        <label className="pi-label">
                            {field.label} {field.unit ? `(${field.unit})` : ''}
                        </label>
                        <input
                            type="number"
                            step="any"
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                            value={batchData[field.name as string] || ''}
                            onChange={e => setBatchData({ ...batchData, [field.name as string]: e.target.value })}
                            className="pi-input text-lg font-bold text-center"
                        />
                    </div>
                ))}

                {computedValue !== null && (
                    <div className="pi-computed">
                        <div className="pi-computed-label">{t('panels.dimensionForm.computedValue')}</div>
                        <div className="pi-computed-value">
                            {computedValue.toFixed(2)} {computedUnit}
                        </div>
                        <div className="pi-computed-hint">{t('panels.dimensionForm.formula')} {formula}</div>
                    </div>
                )}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                    onClick={() => handleMove(true)}
                    disabled={actionLoading || !allFilled}
                    className="pi-btn-accent p-4 flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="text-sm uppercase tracking-wider">{t('common.addPlus')}</span>
                    <span className="text-xs opacity-75">{t('common.addStock')}</span>
                </button>
                <button
                    onClick={() => handleMove(false)}
                    disabled={actionLoading || !allFilled}
                    className="pi-btn-ghost p-4 flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="text-sm uppercase tracking-wider">{t('common.removeMinus')}</span>
                    <span className="text-xs opacity-60">{t('common.removeStockTitle')}</span>
                </button>
            </div>
        </div>
    );
};
