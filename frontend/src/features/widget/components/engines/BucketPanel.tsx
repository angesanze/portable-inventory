import { useTranslation } from "react-i18next";
import { Minus } from "lucide-react";

interface BucketField {
    key: string;
    label: string;
    type: string;
}

interface BucketPanelProps {
    fields: BucketField[];
    bucketData: Record<string, string>;
    setBucketData: (v: Record<string, string>) => void;
    qty: string;
    setQty: (v: string) => void;
    submitting: boolean;
    onTransaction: (op: 'add' | 'subtract') => void;
}

export const BucketPanel: React.FC<BucketPanelProps> = ({
    fields, bucketData, setBucketData, qty, setQty, submitting, onTransaction,
}) => {
    const { t } = useTranslation('widget');
    const parsedQty = parseFloat(qty);
    const hasQty = !isNaN(parsedQty) && parsedQty > 0;
    return (
    <div className="space-y-4" data-testid="panel-batch-composition">
        <div className="grid gap-3">
            {fields.map(field => (
                <div key={field.key}>
                    <label className="pi-label">
                        {field.label}
                    </label>
                    <input
                        type={field.type === 'date' ? 'date' : 'text'}
                        className="pi-input"
                        value={bucketData[field.key] || ""}
                        onChange={e => setBucketData({ ...bucketData, [field.key]: e.target.value })}
                        placeholder={field.label}
                    />
                </div>
            ))}
            <div>
                <label className="pi-label">
                    {t('common.quantity')}
                </label>
                <input
                    type="number"
                    className="pi-input font-bold"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                />
            </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-2">
            <button
                onClick={() => onTransaction('subtract')}
                disabled={submitting || !hasQty}
                className="pi-btn-accent"
            >
                <Minus className="w-5 h-5" strokeWidth={2.5} /> {t('common.removeStock')}
            </button>
        </div>
    </div>
    );
};
