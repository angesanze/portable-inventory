import { useTranslation } from "react-i18next";
import { Plus, Minus } from "lucide-react";

interface CounterPanelProps {
    qty: string;
    setQty: (v: string) => void;
    step?: number;
    inputLabel?: string;
    submitting: boolean;
    onTransaction: (op: 'add' | 'subtract') => void;
}

export const CounterPanel: React.FC<CounterPanelProps> = ({
    qty, setQty, step, inputLabel, submitting, onTransaction,
}) => {
    const { t } = useTranslation('widget');
    const parsedQty = parseFloat(qty);
    const hasQty = !isNaN(parsedQty) && parsedQty > 0;
    return (
    <div className="space-y-5" data-testid="panel-quantity">
        <div>
            <label className="pi-label">
                {inputLabel || t('common.quantity')}
            </label>
            <input
                type="number"
                step={step}
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="pi-input text-center text-3xl font-bold"
            />
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
