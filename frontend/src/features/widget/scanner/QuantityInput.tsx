import React, { useState, useCallback } from "react";
import { ArrowLeft, Delete, Check } from "lucide-react";
import type { QRScanResult } from "./QRScanner";
import type { OperationType } from "./ScanResult";
import { safeEvalFormula } from "../calculator/utils";
import { Select, type SelectOption } from "../../../components/ui/Select";

interface DimensionField {
    name: string;
    label: string;
    unit?: string;
}

interface QuantityInputProps {
    scanResult: QRScanResult;
    operation: OperationType;
    onConfirm: (quantity: number, note?: string, metadata?: { dimensionValues?: Record<string, number>; expiryDate?: string; batchRef?: string }) => void;
    onBack: () => void;
    /** Unit label from engine config, e.g. "bottles", "kg" */
    unitLabel?: string;
    /** For converter engine: secondary unit label */
    secondaryUnitLabel?: string;
    /** Conversion factor for converter engine (primary * factor = secondary) */
    conversionFactor?: number;
    /** Step increment from calc_config.ui_config */
    step?: number;
    /** Min quantity allowed */
    min?: number;
    /** Max quantity allowed */
    max?: number;
    /** Available batches for bucket engine */
    availableBatches?: Array<{ id: string; batch_identifier: string; quantity: number }>;
    /** Selected batch ID for bucket operations */
    selectedBatchId?: string;
    /** Batch selection callback */
    onBatchSelect?: (batchId: string) => void;
    /** Dimension engine: field definitions */
    dimensionFields?: DimensionField[];
    /** Dimension engine: formula string */
    dimensionFormula?: string;
    /** Dimension engine: computed unit label (e.g. "m²") */
    dimensionComputedUnit?: string;
    /** Time-based engine: whether to show expiry date picker */
    showExpiryDate?: boolean;
    /** Time-based engine: time unit label */
    timeUnit?: string;
}

const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

const operationLabels: Record<string, string> = {
    add: "Add Stock",
    subtract: "Remove Stock",
    transfer: "Transfer",
    allocate: "Allocate",
    deallocate: "Deallocate",
    transfer_batch: "Transfer Batch",
    check_in: "Check In",
    check_out: "Check Out",
    start_work_order: "Start Work Order",
    complete_work_order: "Complete Work Order",
};

export const QuantityInput: React.FC<QuantityInputProps> = ({
    scanResult,
    operation,
    onConfirm,
    onBack,
    unitLabel = "units",
    secondaryUnitLabel,
    conversionFactor,
    step = 1,
    min = 0,
    max,
    availableBatches,
    selectedBatchId,
    onBatchSelect,
    dimensionFields,
    dimensionFormula,
    dimensionComputedUnit,
    showExpiryDate,
    timeUnit,
}) => {
    const [display, setDisplay] = useState("0");
    const [hasDecimal, setHasDecimal] = useState(false);
    const [dimensionValues, setDimensionValues] = useState<Record<string, string>>({});
    const [expiryDate, setExpiryDate] = useState("");
    const [batchRef, setBatchRef] = useState("");

    const isDimension = !!dimensionFields && dimensionFields.length > 0;
    const isTimeBased = !!showExpiryDate;

    const numericValue = parseFloat(display) || 0;

    // Dimension engine: compute value from formula
    let dimensionComputed: number | null = null;
    if (isDimension && dimensionFormula) {
        const allFilled = dimensionFields!.every(f => dimensionValues[f.name] && parseFloat(dimensionValues[f.name]) > 0);
        if (allFilled) {
            try {
                let expr = dimensionFormula;
                dimensionFields!.forEach(f => {
                    expr = expr.replace(new RegExp(`\\b${f.name}\\b`, 'g'), String(parseFloat(dimensionValues[f.name]) || 0));
                });
                const evaluated = safeEvalFormula(expr);
                if (!isNaN(evaluated)) {
                    dimensionComputed = evaluated;
                }
            } catch {
                dimensionComputed = null;
            }
        }
    }

    const isValid = isDimension
        ? dimensionComputed !== null && dimensionComputed > 0
        : numericValue > 0
        && (min === undefined || numericValue >= min)
        && (max === undefined || numericValue <= max);
    const showConverter = !!secondaryUnitLabel && !!conversionFactor;
    const showBatchSelector = !!availableBatches && availableBatches.length > 0 &&
        (operation === "deallocate" || operation === "subtract" || operation === "transfer_batch");

    // Flatten available batches into Select options (value-based onChange).
    const batchOptions: SelectOption[] = (availableBatches ?? []).map((b) => ({
        value: b.id,
        label: `${b.batch_identifier} (qty: ${b.quantity})`,
    }));

    const handleKeyPress = useCallback((key: string) => {
        if (key === "del") {
            setDisplay((prev) => {
                const next = prev.slice(0, -1);
                if (!next || next === "-") return "0";
                if (!next.includes(".")) setHasDecimal(false);
                return next;
            });
            return;
        }

        if (key === ".") {
            if (hasDecimal) return;
            if (step >= 1 && !Number.isInteger(step)) {
                // Allow decimals if step has decimals
            } else if (step >= 1) {
                return; // No decimals for integer step
            }
            setHasDecimal(true);
            setDisplay((prev) => prev + ".");
            return;
        }

        setDisplay((prev) => {
            if (prev === "0") return key;
            return prev + key;
        });
    }, [hasDecimal, step]);

    const handleQuickAdd = useCallback((amount: number) => {
        setDisplay((prev) => {
            const current = parseFloat(prev) || 0;
            const next = current + amount;
            if (next < 0) return "0";
            return String(next);
        });
    }, []);

    const handleConfirm = useCallback(() => {
        if (!isValid) return;
        if (isDimension) {
            const dimVals: Record<string, number> = {};
            dimensionFields!.forEach(f => {
                dimVals[f.name] = parseFloat(dimensionValues[f.name]) || 0;
            });
            onConfirm(dimensionComputed!, undefined, { dimensionValues: dimVals });
        } else if (isTimeBased) {
            onConfirm(numericValue, undefined, {
                expiryDate: expiryDate || undefined,
                batchRef: batchRef || undefined,
            });
        } else {
            onConfirm(numericValue);
        }
    }, [isValid, numericValue, dimensionComputed, dimensionValues, dimensionFields, expiryDate, batchRef, isDimension, isTimeBased, onConfirm]);

    return (
        <div className="flex flex-col h-full" data-testid="quantity-input">
            {/* Header */}
            <div
                className="text-white p-4"
                style={{
                    background: "linear-gradient(to right, var(--pi-primary, #4f46e5), color-mix(in srgb, var(--pi-primary, #4f46e5), #7c3aed 50%))",
                }}
            >
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-lg hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="Back to operations"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="text-xs uppercase tracking-widest opacity-75">{scanResult.productName}</div>
                        <h2 className="text-lg font-bold">{operationLabels[operation] || operation}</h2>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col p-4 overflow-y-auto">
                {/* Batch Selector (bucket engine) */}
                {showBatchSelector && (
                    <div className="mb-4">
                        <label htmlFor="batch-select" className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Batch</label>
                        <Select
                            custom
                            id="batch-select"
                            value={selectedBatchId || ""}
                            onChange={(val) => onBatchSelect?.(String(val))}
                            options={batchOptions}
                            placeholder="Choose batch..."
                        />
                    </div>
                )}

                {/* Dimension Engine: Input Fields */}
                {isDimension && (
                    <div className="mb-4 space-y-3" data-testid="dimension-inputs">
                        {dimensionFields!.map(field => (
                            <div key={field.name}>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                                    {field.label} {field.unit ? `(${field.unit})` : ''}
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={dimensionValues[field.name] || ""}
                                    onChange={e => setDimensionValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                                    placeholder={`Enter ${field.label.toLowerCase()}`}
                                    className="w-full p-3 text-center text-lg font-bold bg-white border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
                                    data-testid={`dimension-${field.name}`}
                                />
                            </div>
                        ))}
                        {dimensionComputed !== null && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
                                <div className="text-xs font-bold text-indigo-500 uppercase mb-1">Computed Value</div>
                                <div className="text-3xl font-bold text-indigo-700">
                                    {dimensionComputed.toFixed(2)} {dimensionComputedUnit || ''}
                                </div>
                                <div className="text-xs text-indigo-400 mt-1">Formula: {dimensionFormula}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Time-Based: Expiry Date */}
                {isTimeBased && (
                    <div className="mb-4 space-y-3" data-testid="time-based-inputs">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Expiry Date</label>
                            <input
                                type="date"
                                value={expiryDate}
                                onChange={e => setExpiryDate(e.target.value)}
                                className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
                                data-testid="expiry-date"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Batch Reference</label>
                            <input
                                type="text"
                                value={batchRef}
                                onChange={e => setBatchRef(e.target.value)}
                                placeholder="Optional batch reference"
                                className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none"
                                data-testid="batch-ref"
                            />
                        </div>
                    </div>
                )}

                {/* Quantity Display + Keypad (hidden for dimension engine) */}
                {!isDimension && (<>
                <div className="bg-white rounded-xl border-2 border-slate-200 p-6 mb-4 text-center" data-testid="quantity-display">
                    <div className="text-4xl font-bold text-slate-900 font-mono tracking-wider" data-testid="display-value">
                        {display}
                    </div>
                    <div className="text-sm text-slate-500 mt-1 font-medium">{unitLabel}</div>

                    {/* Converter preview */}
                    {showConverter && (
                        <div className="mt-3 pt-3 border-t border-slate-100" data-testid="converter-preview">
                            <span className="text-lg font-bold text-indigo-600">
                                {(numericValue * conversionFactor!).toFixed(2)}
                            </span>
                            <span className="text-sm text-slate-500 ml-1">{secondaryUnitLabel}</span>
                        </div>
                    )}

                    {/* Validation feedback */}
                    {max !== undefined && numericValue > max && (
                        <div className="mt-2 text-xs text-red-500 font-medium" data-testid="validation-max">
                            Maximum: {max} {unitLabel}
                        </div>
                    )}
                    {min !== undefined && min > 0 && numericValue < min && numericValue > 0 && (
                        <div className="mt-2 text-xs text-red-500 font-medium" data-testid="validation-min">
                            Minimum: {min} {unitLabel}
                        </div>
                    )}
                </div>

                {/* Quick adjustment buttons */}
                <div className="flex gap-2 mb-4 justify-center">
                    {[1, 5, 10, 25].map((amt) => (
                        <button
                            key={amt}
                            onClick={() => handleQuickAdd(amt)}
                            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 font-bold text-sm transition-colors min-w-[44px] min-h-[44px]"
                            aria-label={`Add ${amt}`}
                            data-testid={`quick-add-${amt}`}
                        >
                            +{amt}
                        </button>
                    ))}
                </div>

                {/* Numeric Keypad */}
                <div className="grid grid-cols-3 gap-2 mb-4" data-testid="keypad">
                    {KEYPAD_KEYS.map((key) => (
                        <button
                            key={key}
                            onClick={() => handleKeyPress(key)}
                            className={`p-4 rounded-xl font-bold text-xl transition-colors min-h-[56px] flex items-center justify-center ${
                                key === "del"
                                    ? "bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600"
                                    : key === "."
                                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                      : "bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-900"
                            }`}
                            aria-label={key === "del" ? "Delete" : key}
                            data-testid={`key-${key}`}
                        >
                            {key === "del" ? <Delete className="w-6 h-6" /> : key}
                        </button>
                    ))}
                </div>
                </>)}

                {/* Confirm Button */}
                <button
                    onClick={handleConfirm}
                    disabled={!isValid}
                    className="w-full p-4 rounded-xl font-bold text-white text-lg flex items-center justify-center gap-3 transition-colors duration-150 min-h-[56px] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: isValid ? "var(--pi-primary, #4f46e5)" : undefined }}
                    data-testid="confirm-quantity"
                    aria-label="Confirm quantity"
                >
                    <Check className="w-6 h-6" />
                    {isDimension
                        ? `Confirm ${dimensionComputed !== null ? dimensionComputed.toFixed(2) : ""} ${dimensionComputedUnit || unitLabel}`
                        : `Confirm ${numericValue > 0 ? numericValue : ""} ${unitLabel}`
                    }
                </button>
            </div>
        </div>
    );
};
