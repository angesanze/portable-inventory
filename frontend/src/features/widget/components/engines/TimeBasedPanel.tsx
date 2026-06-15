import { useTranslation } from "react-i18next";
import { Plus, Minus } from "lucide-react";

interface TimeBasedPanelProps {
    qty: string;
    setQty: (v: string) => void;
    step?: number;
    expiryTracking: boolean;
    expiryDate: string;
    setExpiryDate: (v: string) => void;
    batchRef: string;
    setBatchRef: (v: string) => void;
    submitting: boolean;
    onTransaction: (op: 'add' | 'subtract') => void;
}

export const TimeBasedPanel: React.FC<TimeBasedPanelProps> = ({
    qty, setQty, step, expiryTracking, expiryDate, setExpiryDate,
    batchRef, setBatchRef, submitting, onTransaction,
}) => {
    const { t } = useTranslation('widget');
    const parsedQty = parseFloat(qty);
    const hasQty = !isNaN(parsedQty) && parsedQty > 0;
    return (
    <div className="space-y-4" data-testid="panel-time-based">
        <div className="grid gap-3">
            <div>
                <label className="pi-label">
                    {t('common.quantity')}
                </label>
                <input
                    type="number"
                    step={step}
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    className="pi-input text-center text-3xl font-bold"
                />
            </div>

            {expiryTracking && (
                <div>
                    <label className="pi-label">
                        {t('panels.timeBasedForm.expiryDate')}
                    </label>
                    <input
                        type="date"
                        className="pi-input"
                        value={expiryDate}
                        onChange={e => setExpiryDate(e.target.value)}
                    />
                </div>
            )}

            <div>
                <label className="pi-label">
                    {t('panels.timeBasedForm.batchReference')}
                </label>
                <input
                    type="text"
                    className="pi-input"
                    value={batchRef}
                    onChange={e => setBatchRef(e.target.value)}
                    placeholder={t('panels.timeBasedForm.batchReferenceOptional')}
                />
            </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
            <button
                onClick={() => onTransaction('add')}
                disabled={submitting || !hasQty}
                className="pi-btn-success"
            >
                <Plus className="w-5 h-5" strokeWidth={2.5} /> {t('common.add')}
            </button>
            <button
                onClick={() => onTransaction('subtract')}
                disabled={submitting || !hasQty}
                className="pi-btn-danger"
            >
                <Minus className="w-5 h-5" strokeWidth={2.5} /> {t('common.remove')}
            </button>
        </div>
    </div>
    );
};
