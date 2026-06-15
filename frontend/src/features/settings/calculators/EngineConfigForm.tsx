import { useState, useEffect } from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Select, type SelectOption } from "../../../components/ui/Select";

const allocationStrategyOptions: SelectOption[] = [
    { value: "MANUAL", label: "Manual" },
    { value: "FIFO", label: "FIFO (First In, First Out)" },
    { value: "LIFO", label: "LIFO (Last In, First Out)" },
    { value: "WEIGHTED", label: "Weighted" },
];

const timeUnitOptions: SelectOption[] = [
    { value: "days", label: "Days" },
    { value: "hours", label: "Hours" },
];

/**
 * Dynamic form that renders config fields based on engine_type.
 * Reads/writes a JSON config object via value/onChange props.
 */

interface EngineConfigFormProps {
    engineType: string;
    value: Record<string, any>;
    onChange: (config: Record<string, any>) => void;
}

const inputClass =
    "w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-2.5 text-white text-sm focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none";
const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";
const toggleClass =
    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer";
const toggleDotClass =
    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-3 cursor-pointer">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`${toggleClass} ${checked ? "bg-indigo-600" : "bg-zinc-700"}`}
            >
                <span className={`${toggleDotClass} ${checked ? "tranzinc-x-6" : "tranzinc-x-1"}`} />
            </button>
            <span className="text-sm text-zinc-300">{label}</span>
        </label>
    );
}

/* ─── Per-engine forms ─── */

function CounterConfig({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Step Size</label>
                    <input
                        type="number"
                        value={value.step ?? ""}
                        onChange={(e) => onChange({ ...value, step: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="1"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Unit (display suffix)</label>
                    <input
                        type="text"
                        value={value.input_label ?? ""}
                        onChange={(e) => onChange({ ...value, input_label: e.target.value || undefined })}
                        placeholder="e.g. Kg, pcs, L"
                        className={inputClass}
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                        Appears next to the stock count everywhere (e.g. &quot;120 Kg&quot;).
                    </p>
                </div>
            </div>
            <Toggle
                checked={value.allow_negative ?? false}
                onChange={(v) => onChange({ ...value, allow_negative: v })}
                label="Allow negative stock"
            />
        </div>
    );
}

function ConverterConfig({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Source Ratio Field</label>
                    <input
                        type="text"
                        value={value.ratio_source ?? ""}
                        onChange={(e) => onChange({ ...value, ratio_source: e.target.value || undefined })}
                        placeholder="e.g. weight_per_unit"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Precision (decimal places)</label>
                    <input
                        type="number"
                        min={0}
                        max={10}
                        value={value.precision ?? ""}
                        onChange={(e) => onChange({ ...value, precision: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="2"
                        className={inputClass}
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Input Label</label>
                    <input
                        type="text"
                        value={value.input_label ?? ""}
                        onChange={(e) => onChange({ ...value, input_label: e.target.value || undefined })}
                        placeholder="e.g. kg"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Stock Unit</label>
                    <input
                        type="text"
                        value={value.stock_unit ?? ""}
                        onChange={(e) => onChange({ ...value, stock_unit: e.target.value || undefined })}
                        placeholder="e.g. lbs"
                        className={inputClass}
                    />
                </div>
            </div>
        </div>
    );
}

function BucketConfig({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Allocation Strategy</label>
                    <Select
                        custom
                        value={value.allocation_strategy ?? "MANUAL"}
                        onChange={(val) => onChange({ ...value, allocation_strategy: String(val) })}
                        options={allocationStrategyOptions}
                    />
                </div>
                <div>
                    <label className={labelClass}>Primary Key Field</label>
                    <input
                        type="text"
                        value={value.primary_key ?? ""}
                        onChange={(e) => onChange({ ...value, primary_key: e.target.value || undefined })}
                        placeholder="e.g. batch_id"
                        className={inputClass}
                    />
                </div>
            </div>
        </div>
    );
}

function TrackerConfig({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    const transitions = value.status_transitions ?? {};
    const transitionEntries = Object.entries(transitions) as [string, string[]][];

    const addTransition = () => {
        const updated = { ...transitions, "": [] };
        onChange({ ...value, status_transitions: updated });
    };

    const updateTransitionKey = (oldKey: string, newKey: string) => {
        const entries = Object.entries(transitions);
        const updated = Object.fromEntries(
            entries.map(([k, v]) => (k === oldKey ? [newKey, v] : [k, v]))
        );
        onChange({ ...value, status_transitions: updated });
    };

    const updateTransitionValues = (key: string, vals: string) => {
        onChange({
            ...value,
            status_transitions: {
                ...transitions,
                [key]: vals.split(",").map((s) => s.trim()).filter(Boolean),
            },
        });
    };

    const removeTransition = (key: string) => {
        const { [key]: _, ...rest } = transitions;
        onChange({ ...value, status_transitions: rest });
    };

    return (
        <div className="space-y-4">
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className={labelClass}>Status Transitions</label>
                    <button
                        type="button"
                        onClick={addTransition}
                        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                    >
                        <Plus size={14} /> Add
                    </button>
                </div>
                <div className="space-y-2">
                    {transitionEntries.map(([fromStatus, toStatuses], idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={fromStatus}
                                onChange={(e) => updateTransitionKey(fromStatus, e.target.value)}
                                placeholder="FROM status"
                                className={`${inputClass} flex-1`}
                            />
                            <ArrowRight size={16} className="text-zinc-500 shrink-0" />
                            <input
                                type="text"
                                value={(toStatuses || []).join(", ")}
                                onChange={(e) => updateTransitionValues(fromStatus, e.target.value)}
                                placeholder="TO statuses (comma-separated)"
                                className={`${inputClass} flex-[2]`}
                            />
                            <button
                                type="button"
                                onClick={() => removeTransition(fromStatus)}
                                className="p-1.5 text-zinc-500 hover:text-red-400 shrink-0"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {transitionEntries.length === 0 && (
                        <p className="text-xs text-zinc-500 italic">No transitions defined. Default transitions will be used.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function DimensionConfig({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    const dimensions: string[] = value.dimensions ?? [];

    const addDimension = () => onChange({ ...value, dimensions: [...dimensions, ""] });
    const updateDimension = (idx: number, val: string) => {
        const updated = [...dimensions];
        updated[idx] = val;
        onChange({ ...value, dimensions: updated });
    };
    const removeDimension = (idx: number) => {
        onChange({ ...value, dimensions: dimensions.filter((_, i) => i !== idx) });
    };

    return (
        <div className="space-y-4">
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className={labelClass}>
                        Dimensions <span className="text-red-400">*</span>
                    </label>
                    <button
                        type="button"
                        onClick={addDimension}
                        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                    >
                        <Plus size={14} /> Add
                    </button>
                </div>
                <div className="space-y-2">
                    {dimensions.map((dim, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={dim}
                                onChange={(e) => updateDimension(idx, e.target.value)}
                                placeholder="e.g. length, width, height"
                                className={`${inputClass} flex-1`}
                            />
                            <button
                                type="button"
                                onClick={() => removeDimension(idx)}
                                className="p-1.5 text-zinc-500 hover:text-red-400 shrink-0"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>
                        Unit <span className="text-red-400">*</span>
                    </label>
                    <input
                        type="text"
                        value={value.unit ?? ""}
                        onChange={(e) => onChange({ ...value, unit: e.target.value })}
                        placeholder="e.g. m, ft, cm"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Computed Unit</label>
                    <input
                        type="text"
                        value={value.computed_unit ?? ""}
                        onChange={(e) => onChange({ ...value, computed_unit: e.target.value || undefined })}
                        placeholder="e.g. m², m³"
                        className={inputClass}
                    />
                </div>
            </div>
            <div>
                <label className={labelClass}>
                    Formula <span className="text-red-400">*</span>
                </label>
                <input
                    type="text"
                    value={value.formula ?? ""}
                    onChange={(e) => onChange({ ...value, formula: e.target.value })}
                    placeholder="e.g. length * width"
                    className={inputClass}
                />
                <p className="mt-1 text-xs text-zinc-500">
                    Use dimension names as variables. Supports +, -, *, /, parentheses.
                </p>
            </div>
        </div>
    );
}

function TimeBasedConfig({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    return (
        <div className="space-y-4">
            <div>
                <label className={labelClass}>
                    Time Unit <span className="text-red-400">*</span>
                </label>
                <Select
                    custom
                    value={value.time_unit ?? "days"}
                    onChange={(val) => onChange({ ...value, time_unit: String(val) })}
                    options={timeUnitOptions}
                />
            </div>
            <div className="space-y-3">
                <Toggle
                    checked={value.expiry_tracking ?? false}
                    onChange={(v) => onChange({ ...value, expiry_tracking: v })}
                    label="Enable expiry tracking"
                />
                <Toggle
                    checked={value.auto_decrement ?? false}
                    onChange={(v) => onChange({ ...value, auto_decrement: v })}
                    label="Auto-decrement on expiry"
                />
            </div>
        </div>
    );
}

/* ─── Main component ─── */

export const EngineConfigForm = ({ engineType, value, onChange }: EngineConfigFormProps) => {
    const [config, setConfig] = useState<Record<string, any>>(value || {});

    useEffect(() => {
        setConfig(value || {});
    }, [value]);

    const handleChange = (newConfig: Record<string, any>) => {
        // Strip undefined values
        const cleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(newConfig)) {
            if (v !== undefined && v !== "") cleaned[k] = v;
        }
        setConfig(cleaned);
        onChange(cleaned);
    };

    const formProps = { value: config, onChange: handleChange };

    switch (engineType) {
        case "counter":
            return <CounterConfig {...formProps} />;
        case "converter":
            return <ConverterConfig {...formProps} />;
        case "bucket":
            return <BucketConfig {...formProps} />;
        case "tracker":
            return <TrackerConfig {...formProps} />;
        case "dimension":
            return <DimensionConfig {...formProps} />;
        case "time_based":
            return <TimeBasedConfig {...formProps} />;
        default:
            return (
                <p className="text-sm text-zinc-500 italic">
                    Select an engine type to configure.
                </p>
            );
    }
};
