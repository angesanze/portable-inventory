import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Trash2, Plus, Check, X } from "lucide-react";
import type { BatchManagerData } from "../../types";

interface MessageState {
    type: 'success' | 'error';
    text: string;
}

interface BatchManagerPanelProps {
    data: BatchManagerData;
    submitting: boolean;
    message: MessageState | null;
    onBatchTransaction: (
        // A batch_manager grouped entry exposes its id under `model.id`, not a
        // top-level `product_model_id`, so callers may pass undefined.
        modelId: string | undefined,
        delta: number,
        identifier?: string | null,
        physicalProductId?: string | null,
        batchId?: string | null,
    ) => void;
}

export const BatchManagerPanel: React.FC<BatchManagerPanelProps> = ({
    data, submitting, message, onBatchTransaction,
}) => {
    const { t } = useTranslation('widget');
    const [serialInputs, setSerialInputs] = useState<Record<string, string>>({});
    // Inline withdraw editor — replaces the native window.prompt() dialog (UI Native-Style Audit P07).
    // Tracks the open lot by its `batch_id`, which is optional on the row shape.
    const [withdrawFor, setWithdrawFor] = useState<string | null | undefined>(null);
    const [withdrawQty, setWithdrawQty] = useState("1");
    const items = Object.values(data.grouped_items || {});

    const confirmWithdraw = (modelId: string | undefined, batchId: string | undefined) => {
        const val = parseFloat(withdrawQty);
        if (withdrawQty && !isNaN(val) && val > 0) {
            onBatchTransaction(modelId, -val, null, null, batchId);
        }
        setWithdrawFor(null);
    };

    return (
        <div
            className="pi-surface-dark min-h-screen p-4 pb-20"
            data-testid="panel-work-order"
            style={{ fontFamily: 'var(--pi-font, system-ui)' }}
        >
            <div className="max-w-md mx-auto space-y-6">
                {/* Header */}
                <div
                    className="flex items-center justify-between p-4 rounded-2xl backdrop-blur-md"
                    style={{
                        backgroundColor: 'color-mix(in srgb, var(--pi-primary, #3b82f6) 20%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--pi-primary, #3b82f6) 30%, transparent)',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                            style={{ backgroundColor: 'var(--pi-primary, #3b82f6)' }}
                        >
                            <Package size={20} style={{ color: 'var(--pi-text)' }} />
                        </div>
                        <div>
                            <h1 className="text-base font-bold leading-none">{data.product_name}</h1>
                            <p
                                className="text-[10px] uppercase tracking-widest mt-1 font-bold"
                                style={{ color: 'var(--pi-primary, #3b82f6)' }}
                            >
                                {t('panels.batchManager.title')}
                            </p>
                        </div>
                    </div>
                </div>

                {items.map((model) => {
                    // `model` is a grouped_items entry; its per-model header is
                    // NESTED under `model.model` (real backend shape, widget_product.py),
                    // while `total_quantity`/`items`/`candidates` sit at the entry level.
                    const m = model.model;
                    const modelId = m.id;
                    return (
                    <div
                        key={modelId}
                        className="pi-card-dark rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm"
                        style={{ backgroundColor: 'var(--pi-surface)' }}
                    >
                        {/* Model Header */}
                        <div
                            className="p-5"
                            style={{
                                borderBottom: '1px solid var(--pi-border)',
                                backgroundColor: 'color-mix(in srgb, var(--pi-primary) 6%, transparent)',
                            }}
                        >
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <h3 className="text-base font-bold tracking-tight" style={{ color: 'var(--pi-text)' }}>{m.name}</h3>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-xs font-mono px-2 py-0.5 rounded-md"
                                            style={{
                                                color: 'var(--pi-muted, #64748b)',
                                                backgroundColor: 'var(--pi-surface)',
                                                border: '1px solid var(--pi-border)',
                                            }}
                                        >
                                            {m.sku}
                                        </span>
                                        <span
                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter"
                                            style={m.tracking_mode === 'INDIVIDUAL'
                                                ? {
                                                    backgroundColor: 'color-mix(in srgb, var(--pi-primary, #3b82f6) 10%, transparent)',
                                                    color: 'var(--pi-primary, #3b82f6)',
                                                    border: '1px solid color-mix(in srgb, var(--pi-primary, #3b82f6) 20%, transparent)',
                                                }
                                                : {
                                                    backgroundColor: 'color-mix(in srgb, var(--pi-success, #10b981) 10%, transparent)',
                                                    color: 'var(--pi-success, #10b981)',
                                                    border: '1px solid color-mix(in srgb, var(--pi-success, #10b981) 20%, transparent)',
                                                }
                                            }
                                        >
                                            {m.tracking_mode}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div
                                        className="text-2xl font-black leading-none"
                                        style={{ color: 'var(--pi-primary, #3b82f6)' }}
                                    >
                                        {model.total_quantity !== undefined
                                            ? model.total_quantity
                                            : model.items.reduce((acc: number, item) => acc + (Number(item.quantity) || 1), 0)
                                        }
                                    </div>
                                    <div
                                        className="text-[10px] font-bold uppercase mt-1"
                                        style={{ color: 'var(--pi-muted, #64748b)' }}
                                    >
                                        {t('panels.batchManager.totalStock')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* BULK: Per-Lot Controls */}
                            {m.tracking_mode === 'BULK' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label
                                            className="text-[10px] font-bold uppercase tracking-widest pl-1"
                                            style={{ color: 'var(--pi-muted, #64748b)' }}
                                        >
                                            {t('panels.batchManager.activeLots')}
                                        </label>
                                        <div className="grid gap-2">
                                            {model.items.map((batch) => (
                                                <div
                                                    key={batch.id}
                                                    className="rounded-2xl p-4 flex items-center justify-between transition-colors"
                                                    style={{
                                                        backgroundColor: 'var(--pi-surface)',
                                                        border: '1px solid var(--pi-border)',
                                                    }}
                                                >
                                                    <div>
                                                        <div className="text-sm font-bold" style={{ color: 'var(--pi-text)' }}>{batch.identifier}</div>
                                                        <div className="text-[10px] font-mono mt-0.5 uppercase" style={{ color: 'var(--pi-muted, #64748b)' }}>{t('panels.batchManager.lotIdentifier')}</div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right mr-2">
                                                            <div className="text-lg font-bold leading-none" style={{ color: 'var(--pi-text)' }}>{batch.quantity}</div>
                                                            <div className="text-[10px] uppercase font-bold" style={{ color: 'var(--pi-muted, #64748b)' }}>{t('common.qty')}</div>
                                                        </div>
                                                        {withdrawFor === batch.id ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    autoFocus
                                                                    value={withdrawQty}
                                                                    onChange={(e) => setWithdrawQty(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') confirmWithdraw(modelId, batch.id);
                                                                        if (e.key === 'Escape') setWithdrawFor(null);
                                                                    }}
                                                                    disabled={submitting}
                                                                    aria-label="Quantity to withdraw"
                                                                    placeholder={t('common.qty')}
                                                                    className="w-16 px-2 py-1.5 rounded-lg text-sm font-bold text-center outline-none"
                                                                    style={{
                                                                        backgroundColor: 'var(--pi-surface)',
                                                                        color: 'var(--pi-text)',
                                                                        border: '1px solid color-mix(in srgb, var(--pi-danger, #f43f5e) 30%, transparent)',
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => confirmWithdraw(modelId, batch.id)}
                                                                    disabled={submitting}
                                                                    aria-label="Confirm withdrawal"
                                                                    className="p-2 rounded-xl transition-all duration-150 active:scale-90"
                                                                    style={{
                                                                        backgroundColor: 'color-mix(in srgb, var(--pi-danger, #f43f5e) 15%, transparent)',
                                                                        color: 'var(--pi-danger, #f43f5e)',
                                                                        border: '1px solid color-mix(in srgb, var(--pi-danger, #f43f5e) 25%, transparent)',
                                                                    }}
                                                                >
                                                                    <Check size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => setWithdrawFor(null)}
                                                                    aria-label="Cancel withdrawal"
                                                                    className="p-2 rounded-xl transition-all duration-150 active:scale-90"
                                                                    style={{ color: 'var(--pi-muted, #64748b)' }}
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => { setWithdrawFor(batch.id); setWithdrawQty("1"); }}
                                                                disabled={submitting}
                                                                aria-label="Withdraw from lot"
                                                                className="flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 active:scale-90"
                                                                style={{
                                                                    backgroundColor: 'color-mix(in srgb, var(--pi-danger, #f43f5e) 10%, transparent)',
                                                                    color: 'var(--pi-danger, #f43f5e)',
                                                                    border: '1px solid color-mix(in srgb, var(--pi-danger, #f43f5e) 20%, transparent)',
                                                                }}
                                                            >
                                                                <Trash2 size={16} />
                                                                <span className="text-[8px] font-black uppercase mt-1">{t('common.remove')}</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {model.items.length === 0 && (
                                                <div
                                                    className="text-center py-6 text-xs italic rounded-2xl border border-dashed"
                                                    style={{
                                                        color: 'var(--pi-muted, #64748b)',
                                                        backgroundColor: 'var(--pi-surface)',
                                                        borderColor: 'var(--pi-border)',
                                                    }}
                                                >
                                                    {t('panels.batchManager.noActiveLots')}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* INDIVIDUAL: Serial Listing */}
                            {m.tracking_mode === 'INDIVIDUAL' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label
                                            className="text-[10px] font-bold uppercase tracking-widest pl-1"
                                            style={{ color: 'var(--pi-muted, #64748b)' }}
                                        >
                                            {t('panels.batchComposition.assignedSerials')}
                                        </label>
                                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 scroll-thin">
                                            {model.items.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="rounded-xl p-3 flex justify-between items-center group"
                                                    style={{
                                                        backgroundColor: 'var(--pi-surface)',
                                                        border: '1px solid var(--pi-border)',
                                                    }}
                                                >
                                                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--pi-primary, #3b82f6)' }}>{item.identifier}</span>
                                                    <button
                                                        onClick={async () => {
                                                            await onBatchTransaction(modelId, -1, item.identifier, item.id);
                                                        }}
                                                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors duration-150"
                                                        style={{ color: 'var(--pi-muted, #64748b)' }}
                                                        title={t('panels.batchManager.withdrawItem')}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            {model.items.length === 0 && (
                                                <div
                                                    className="col-span-2 text-center py-6 text-xs italic rounded-2xl border border-dashed"
                                                    style={{
                                                        color: 'var(--pi-muted, #64748b)',
                                                        backgroundColor: 'var(--pi-surface)',
                                                        borderColor: 'var(--pi-border)',
                                                    }}
                                                >
                                                    {t('panels.batchManager.noSerialsAssigned')}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Serial Add with Candidate Picker */}
                                    <div className="pt-2 space-y-3" style={{ borderTop: '1px solid var(--pi-border)' }}>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <input
                                                    type="text"
                                                    list={`candidates-${modelId}`}
                                                    placeholder={t('panels.batchManager.scanOrSearchSerial')}
                                                    className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors duration-150 font-mono"
                                                    style={{
                                                        backgroundColor: 'var(--pi-surface)',
                                                        border: '1px solid var(--pi-border)',
                                                        color: 'var(--pi-text)',
                                                    }}
                                                    value={serialInputs[modelId] || ""}
                                                    onChange={(e) => setSerialInputs({ ...serialInputs, [modelId]: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const val = serialInputs[modelId];
                                                            if (val) {
                                                                const candidate = model.candidates?.find((c) => c.identifier === val);
                                                                onBatchTransaction(modelId, 1, val, candidate?.id);
                                                                setSerialInputs({ ...serialInputs, [modelId]: "" });
                                                            }
                                                        }
                                                    }}
                                                />
                                                <datalist id={`candidates-${modelId}`}>
                                                    {model.candidates && model.candidates.map((c) => (
                                                        <option key={c.id} value={c.identifier} />
                                                    ))}
                                                </datalist>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const val = serialInputs[modelId];
                                                    if (val) {
                                                        const candidate = model.candidates?.find((c) => c.identifier === val);
                                                        onBatchTransaction(modelId, 1, val, candidate?.id);
                                                        setSerialInputs({ ...serialInputs, [modelId]: "" });
                                                    }
                                                }}
                                                disabled={!serialInputs[modelId] || submitting}
                                                className="px-5 rounded-xl transition-all duration-150 shadow-lg active:scale-95"
                                                style={{ backgroundColor: 'var(--pi-primary, #3b82f6)', color: '#fff' }}
                                            >
                                                <Plus size={20} />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-center italic" style={{ color: 'var(--pi-muted, #64748b)' }}>{t('panels.batchManager.onlyAvailableNote')}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    );
                })}

                {items.length === 0 && (
                    <div
                        className="text-center py-20 rounded-3xl border border-dashed"
                        style={{
                            backgroundColor: 'var(--pi-surface)',
                            borderColor: 'var(--pi-border)',
                        }}
                    >
                        <h3 className="font-bold" style={{ color: 'var(--pi-muted, #64748b)' }}>{t('panels.batchManager.noContentsDefined')}</h3>
                    </div>
                )}
            </div>

            {/* Fixed Footer Message Area */}
            <div className="fixed bottom-0 left-0 right-0 p-4 transition-all duration-300 z-50">
                <div className="max-w-md mx-auto">
                    {message && (
                        <div
                            className="p-4 rounded-2xl shadow-2xl backdrop-blur-md animate-slideUp"
                            style={{
                                backgroundColor: message.type === 'success' ? 'var(--pi-success, #10b981)' : 'var(--pi-danger, #f43f5e)',
                                color: '#fff',
                                border: `1px solid ${message.type === 'success' ? 'var(--pi-success, #10b981)' : 'var(--pi-danger, #f43f5e)'}`,
                            }}
                        >
                            <p className="text-center font-bold text-sm">{message.text}</p>
                        </div>
                    )}
                    {submitting && !message && (
                        <div
                            className="backdrop-blur-md p-4 rounded-2xl flex items-center justify-center gap-3"
                            style={{
                                backgroundColor: 'var(--pi-surface)',
                                border: '1px solid var(--pi-border)',
                            }}
                        >
                            <div
                                className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                                style={{ borderColor: 'var(--pi-primary, #3b82f6)', borderTopColor: 'transparent' }}
                            />
                            <span className="text-sm font-bold" style={{ color: 'var(--pi-text)' }}>{t('panels.batchManager.synchronizingStock')}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
