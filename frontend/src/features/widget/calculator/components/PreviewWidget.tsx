import { useState } from "react";
import { PROFILE_METADATA } from "../../../../types/api";
import type { InventoryProfile } from "../../../../types/api";
import type { CalculatorConfig, UiConfig } from "../../types";

// Calculator playground stub — only renders Counter/Bucket previews.
// For full widget behavior the user should use `/settings/widget-preview`
// (which iframes the real `TransactionWidget`/`PolymorphicWidget`).
// Inputs other than 'number' / 'bucket_form' fall through to the bucket branch
// or render nothing; see Phase 07 mount-point matrix in WIDGET-AUDIT-07.md.
export const PreviewWidget = ({ config }: { config: CalculatorConfig }) => {

    // Simple state simulation for preview
    const [qty, setQty] = useState("");
    const [bucketData, setBucketData] = useState<Record<string, string>>({});

    // Derive UI Config from profile (preferred) or legacy engine.type
    let ui_config: UiConfig = { input_type: 'number' };

    const profile = config?.profile as InventoryProfile | undefined;
    const meta = profile ? PROFILE_METADATA[profile] : undefined;
    const inputType = meta?.widgetInputType ?? (config?.engine?.type === 'bucket' ? 'bucket_form' : 'number');
    const isUnsupported = inputType !== 'number' && inputType !== 'bucket_form';

    if (inputType === 'bucket_form' || inputType === 'time_based' || inputType === 'batch_manager') {
        ui_config = {
            input_type: 'bucket_form',
            fields: config.engine?.config?.fields || []
        };
    } else {
        ui_config = {
            input_type: 'number',
            input_label: config?.engine?.config?.input_label || "Quantity",
            step: config?.engine?.config?.step || 1
        };
    }

    return (
        <div
            className="w-full max-w-sm mx-auto mt-10 rounded-xl overflow-hidden"
            style={{
                transform: 'scale(0.9)',
                transformOrigin: 'top center',
                backgroundColor: '#18181b',
                border: '1px solid rgba(255,255,255,0.06)',
            }}
        >
            {/* Header */}
            <div
                className="p-6 text-center"
                style={{
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%)',
                }}
            >
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#a1a1aa' }}>Stock</p>
                <h2 className="text-lg font-semibold leading-tight" style={{ color: '#f4f4f5' }}>
                    {config?.name || "Product Name"}
                </h2>
                <div className="mt-3 text-4xl font-mono font-bold tracking-tight" style={{ color: '#6366f1' }}>
                    {config?.initial_stock || 0}
                </div>
            </div>

            {/* Body */}
            <div className="p-6">
                {isUnsupported && (
                    <div
                        className="mb-4 p-3 rounded-lg text-xs"
                        style={{
                            backgroundColor: 'rgba(99,102,241,0.08)',
                            border: '1px solid rgba(99,102,241,0.25)',
                            color: '#a1a1aa',
                        }}
                    >
                        Calculator preview only renders Counter / Bucket widgets.
                        Use <code className="font-mono">/settings/widget-preview</code> for the
                        live {inputType} widget.
                    </div>
                )}
                {ui_config.input_type === 'number' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#a1a1aa' }}>
                                {ui_config.input_label}
                            </label>
                            <input
                                type="number"
                                step={ui_config.step}
                                value={qty}
                                onChange={e => setQty(e.target.value)}
                                className="w-full text-center text-2xl font-bold p-3 rounded-lg outline-none transition-all"
                                style={{
                                    backgroundColor: '#27272a',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    color: '#f4f4f5',
                                }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                className="py-3 rounded-lg font-bold text-white text-sm transition-opacity hover:opacity-90"
                                style={{ backgroundColor: '#10b981' }}
                            >
                                + ADD
                            </button>
                            <button
                                className="py-3 rounded-lg font-bold text-white text-sm transition-opacity hover:opacity-90"
                                style={{ backgroundColor: '#f43f5e' }}
                            >
                                − REMOVE
                            </button>
                        </div>
                    </div>
                )}

                {ui_config.input_type === 'bucket_form' && (
                    <div className="space-y-4">
                        <div className="grid gap-3">
                            {ui_config.fields?.map((field) => {
                                // Bucket fields are keyed by `key`; assert so it can index the
                                // bucketData record (runtime value unchanged).
                                const fieldKey = field.key as string;
                                return (
                                <div key={fieldKey}>
                                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#a1a1aa' }}>
                                        {field.label}
                                    </label>
                                    <input
                                        className="w-full p-2.5 rounded-lg outline-none transition-all"
                                        style={{
                                            backgroundColor: '#27272a',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            color: '#f4f4f5',
                                        }}
                                        placeholder={field.label}
                                        value={bucketData[fieldKey] || ""}
                                        onChange={e => setBucketData({ ...bucketData, [fieldKey]: e.target.value })}
                                    />
                                </div>
                                );
                            })}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#a1a1aa' }}>Quantity</label>
                                <input
                                    type="number"
                                    className="w-full p-2.5 rounded-lg font-bold outline-none transition-all"
                                    style={{
                                        backgroundColor: '#27272a',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        color: '#f4f4f5',
                                    }}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                className="py-3 rounded-lg font-bold text-white text-sm transition-opacity hover:opacity-90"
                                style={{ backgroundColor: '#6366f1' }}
                            >
                                ADD BATCH
                            </button>
                            <button
                                className="py-3 rounded-lg font-bold text-sm transition-all"
                                style={{
                                    backgroundColor: '#27272a',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    color: '#a1a1aa',
                                }}
                            >
                                CONSUME
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
