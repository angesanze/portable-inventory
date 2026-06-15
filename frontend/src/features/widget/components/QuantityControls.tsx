import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, ArrowUpFromLine, Minus, Plus } from 'lucide-react';
import type { UiConfig } from '../types';

interface QuantityControlsProps {
    quantity: string;
    setQuantity: (q: string) => void;
    uiConfig: UiConfig | undefined;
    handleMove: (isAdd: boolean) => Promise<void>;
    actionLoading: boolean;
    onHand?: number | null;
    unit?: string | null;
}

const PRESET_MULTIPLIERS = [1, 5, 10, 20, 50] as const;

export const QuantityControls: React.FC<QuantityControlsProps> = ({
    quantity,
    setQuantity,
    uiConfig,
    handleMove,
    actionLoading,
    onHand,
    unit,
}) => {
    const { t } = useTranslation('widget');
    const step = uiConfig?.step || 1;
    const allowNegative = uiConfig?.allow_negative ?? false;
    const parsed = parseFloat(quantity);
    const currentQty = isNaN(parsed) ? 0 : parsed;
    const hasStock = typeof onHand === 'number' && onHand !== null;
    const canCheckOut = currentQty > 0 && (allowNegative || !hasStock || currentQty <= (onHand as number));

    const setQty = (n: number) => {
        const clamped = Math.max(0, n);
        setQuantity(String(Number.isInteger(clamped) ? clamped : parseFloat(clamped.toFixed(4))));
    };

    const bump = (delta: number) => setQty(currentQty + delta);
    const addPreset = (mult: number) => setQty(currentQty + mult * step);
    const subPreset = (mult: number) => setQty(currentQty - mult * step);
    const setMax = () => hasStock && setQty(onHand as number);

    return (
        <div className="space-y-4" data-testid="panel-quantity">
            {/* Big stepper */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="pi-label" style={{ marginBottom: 0 }}>{t('common.quantity')}</label>
                    {hasStock && (
                        <button
                            type="button"
                            onClick={setMax}
                            className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md transition-colors"
                            style={{
                                color: 'var(--pi-primary, #6366f1)',
                                backgroundColor: 'color-mix(in srgb, var(--pi-primary, #6366f1) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--pi-primary, #6366f1) 30%, transparent)',
                            }}
                        >
                            {t('common.max')} {onHand}{unit ? ` ${unit}` : ''}
                        </button>
                    )}
                </div>
                <div className="flex items-stretch gap-2">
                    <button
                        type="button"
                        onClick={() => bump(-step)}
                        disabled={currentQty <= 0}
                        aria-label="Decrease quantity"
                        className="pi-btn-ghost flex-shrink-0 px-0"
                        style={{ width: '3.25rem', minHeight: '4.5rem' }}
                    >
                        <Minus className="w-6 h-6" strokeWidth={2.5} />
                    </button>
                    <input
                        type="number"
                        inputMode="numeric"
                        step={step}
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        onFocus={e => e.currentTarget.select()}
                        className="pi-input flex-1 text-center font-extrabold tabular-nums"
                        style={{ fontSize: '2.75rem', minHeight: '4.5rem', padding: '0.25rem 0.5rem' }}
                    />
                    <button
                        type="button"
                        onClick={() => bump(step)}
                        aria-label="Increase quantity"
                        className="pi-btn-ghost flex-shrink-0 px-0"
                        style={{ width: '3.25rem', minHeight: '4.5rem' }}
                    >
                        <Plus className="w-6 h-6" strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Preset chips — additive (+) and subtractive (−) rows */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="pi-label" style={{ marginBottom: 0 }}>{t('common.quickAdjust')}</label>
                    {currentQty > 0 && (
                        <button
                            type="button"
                            onClick={() => setQty(0)}
                            className="text-xs uppercase tracking-wider font-semibold opacity-70 hover:opacity-100"
                            style={{ color: 'var(--pi-muted, #a1a1aa)' }}
                        >
                            {t('common.clear')}
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-5 gap-2">
                    {PRESET_MULTIPLIERS.map(m => {
                        const amount = m * step;
                        return (
                            <button
                                key={`add-${m}`}
                                type="button"
                                onClick={() => addPreset(m)}
                                className="rounded-lg font-bold tabular-nums transition-all active:scale-95"
                                style={{
                                    minHeight: '3rem',
                                    fontSize: '1rem',
                                    backgroundColor: 'color-mix(in srgb, var(--pi-success, #10b981) 12%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--pi-success, #10b981) 30%, transparent)',
                                    color: 'var(--pi-success, #10b981)',
                                }}
                            >
                                +{amount}
                            </button>
                        );
                    })}
                </div>
                <div className="grid grid-cols-5 gap-2 mt-2">
                    {PRESET_MULTIPLIERS.map(m => {
                        const amount = m * step;
                        const disabled = currentQty - amount < 0;
                        return (
                            <button
                                key={`sub-${m}`}
                                type="button"
                                onClick={() => subPreset(m)}
                                disabled={disabled}
                                className="rounded-lg font-bold tabular-nums transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                                style={{
                                    minHeight: '3rem',
                                    fontSize: '1rem',
                                    backgroundColor: 'color-mix(in srgb, var(--pi-danger, #f43f5e) 12%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--pi-danger, #f43f5e) 30%, transparent)',
                                    color: 'var(--pi-danger, #f43f5e)',
                                }}
                            >
                                −{amount}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Action buttons — big, labeled with current quantity */}
            <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                    onClick={() => handleMove(true)}
                    disabled={actionLoading || currentQty <= 0}
                    className="pi-btn-success flex-col gap-1"
                    style={{ minHeight: '5rem' }}
                >
                    <span className="flex items-center gap-2 text-sm uppercase tracking-wider font-bold">
                        <ArrowDownToLine className="w-5 h-5" strokeWidth={2.5} /> {t('common.checkIn')}
                    </span>
                    <span className="text-lg font-extrabold tabular-nums">
                        +{currentQty || 0}
                    </span>
                </button>
                <button
                    onClick={() => handleMove(false)}
                    disabled={actionLoading || !canCheckOut}
                    className="pi-btn-danger flex-col gap-1"
                    style={{ minHeight: '5rem' }}
                >
                    <span className="flex items-center gap-2 text-sm uppercase tracking-wider font-bold">
                        <ArrowUpFromLine className="w-5 h-5" strokeWidth={2.5} /> {t('common.checkOut')}
                    </span>
                    <span className="text-lg font-extrabold tabular-nums">
                        −{currentQty || 0}
                    </span>
                </button>
            </div>
        </div>
    );
};
