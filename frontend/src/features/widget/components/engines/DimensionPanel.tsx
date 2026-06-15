import { useTranslation } from "react-i18next";
import { Plus, Minus } from "lucide-react";
import { safeEvalFormula } from "../../calculator/utils";

interface DimensionField {
    name: string;
    label: string;
    unit?: string;
}

interface DimensionPanelProps {
    fields: DimensionField[];
    formula: string;
    computedUnit: string;
    dimensionValues: Record<string, string>;
    setDimensionValues: (v: Record<string, string>) => void;
    submitting: boolean;
    onTransaction: (op: 'add' | 'subtract') => void;
}

export const DimensionPanel: React.FC<DimensionPanelProps> = ({
    fields, formula, computedUnit, dimensionValues, setDimensionValues,
    submitting, onTransaction,
}) => {
    const { t } = useTranslation('widget');
    const allFilled = fields.every(f => dimensionValues[f.name] && parseFloat(dimensionValues[f.name]) > 0);
    let computedValue: number | null = null;
    if (allFilled) {
        try {
            let expr = formula;
            fields.forEach(f => {
                expr = expr.replace(new RegExp(`\\b${f.name}\\b`, 'g'), String(parseFloat(dimensionValues[f.name]) || 0));
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
        <div className="space-y-4" data-testid="panel-dimension">
            <div className="grid gap-3">
                {fields.map((field) => (
                    <div key={field.name}>
                        <label className="pi-label">
                            {field.label} {field.unit ? `(${field.unit})` : ''}
                        </label>
                        <input
                            type="number"
                            step="any"
                            className="pi-input text-center text-lg font-bold p-2"
                            value={dimensionValues[field.name] || ""}
                            onChange={e => setDimensionValues({ ...dimensionValues, [field.name]: e.target.value })}
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                    </div>
                ))}
            </div>

            {computedValue !== null && (
                <div className="pi-computed">
                    <div className="pi-computed-label">{t('panels.dimensionForm.computedValue')}</div>
                    <div className="pi-computed-value">
                        {computedValue.toFixed(2)} {computedUnit}
                    </div>
                    <div className="pi-computed-hint">{t('panels.dimensionForm.formula')} {formula}</div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => onTransaction('add')}
                    disabled={submitting || !allFilled}
                    className="pi-btn-success"
                >
                    <Plus className="w-5 h-5" strokeWidth={2.5} /> {t('common.add')}
                </button>
                <button
                    onClick={() => onTransaction('subtract')}
                    disabled={submitting || !allFilled}
                    className="pi-btn-danger"
                >
                    <Minus className="w-5 h-5" strokeWidth={2.5} /> {t('common.remove')}
                </button>
            </div>
        </div>
    );
};
