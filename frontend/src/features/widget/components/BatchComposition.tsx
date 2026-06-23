import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PhysicalItem, BatchCompositionDataSource, BatchManagerModel } from '../types';

interface BatchCompositionProps {
    dataSource: BatchCompositionDataSource | null;
    expandedModelId: string | null;
    setExpandedModelId: (id: string | null) => void;
    setIdentifier: (id: string) => void;
    setQuantity: (q: string) => void;
    setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
    quantity: string;
    identifier: string;
    availableItems: PhysicalItem[];
    handleMove: (isAdd: boolean, overrideProductId?: string) => Promise<void>;
    loadComponentBatches: (modelId: string) => Promise<void>;
    loadAvailableItems: (prodId: string, locId: string) => Promise<void>;
    selectedLocation: string;
    actionLoading?: boolean;
}

export const BatchComposition: React.FC<BatchCompositionProps> = ({
    dataSource,
    expandedModelId,
    setExpandedModelId,
    setIdentifier,
    setQuantity,
    setMessage,
    quantity,
    identifier,
    availableItems,
    handleMove,
    loadComponentBatches,
    loadAvailableItems,
    selectedLocation,
    actionLoading = false,
}) => {
    const { t } = useTranslation('widget');
    const parsedQty = parseFloat(quantity);
    const hasQty = !isNaN(parsedQty) && parsedQty > 0;
    const hasSerial = identifier.trim().length > 0;
    if (!dataSource || !dataSource.grouped_items) return null;

    return (
        <div
            className="mb-6 mt-4 pt-4"
            style={{ borderTop: '1px solid var(--pi-border, rgba(255,255,255,0.08))' }}
            data-testid="panel-batch-composition"
        >
            <h3
                className="text-sm font-semibold uppercase tracking-wider mb-3 pb-2 flex items-center gap-2"
                style={{
                    color: 'var(--pi-primary, #6366f1)',
                    borderBottom: '1px solid var(--pi-border, rgba(255,255,255,0.06))',
                }}
            >
                <span className="text-lg">📦</span> {t('panels.batchComposition.title')}
            </h3>
            <div className="space-y-3">
                {(Object.entries(dataSource.grouped_items || {}) as [string, BatchManagerModel][]).map(([modelId, modelData]) => {
                    const isBulk = modelData.model?.tracking_mode !== 'INDIVIDUAL';
                    const isExpanded = expandedModelId === modelId;
                    const itemCount = Array.isArray(modelData.items) ? modelData.items.length : 0;
                    const totalQty = isBulk ? modelData.items?.reduce((acc: number, i) => acc + (Number(i.quantity) || 0), 0) : itemCount;

                    return (
                        <div
                            key={modelId}
                            className="rounded-xl transition-all duration-150"
                            style={{
                                backgroundColor: 'var(--pi-surface, #18181b)',
                                border: isExpanded
                                    ? '1px solid var(--pi-primary, #6366f1)'
                                    : '1px solid var(--pi-border, rgba(255,255,255,0.08))',
                                boxShadow: isExpanded
                                    ? '0 6px 18px -6px color-mix(in srgb, var(--pi-primary, #6366f1) 35%, transparent)'
                                    : undefined,
                            }}
                        >
                            <button
                                onClick={() => {
                                    if (isExpanded) {
                                        setExpandedModelId(null);
                                    } else {
                                        setExpandedModelId(modelId);
                                        setIdentifier("");
                                        setQuantity("1");
                                        setMessage(null);
                                        if (isBulk) {
                                            loadComponentBatches(modelId);
                                        } else {
                                            loadAvailableItems(modelId, selectedLocation);
                                        }
                                    }
                                }}
                                className="w-full text-left p-4 flex items-center justify-between"
                            >
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h4
                                            className="text-base font-bold"
                                            style={{ color: isExpanded ? 'var(--pi-primary, #6366f1)' : 'var(--pi-text, #f4f4f5)' }}
                                        >
                                            {modelData.model?.name || t('common.unknownModel')}
                                        </h4>
                                        <span
                                            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                                            style={{
                                                backgroundColor: isBulk
                                                    ? 'color-mix(in srgb, var(--pi-primary, #6366f1) 18%, transparent)'
                                                    : 'color-mix(in srgb, var(--pi-muted, #a1a1aa) 18%, transparent)',
                                                color: isBulk ? 'var(--pi-primary, #6366f1)' : 'var(--pi-text, #f4f4f5)',
                                            }}
                                        >
                                            {isBulk ? t('panels.batchComposition.modeBulk') : t('panels.batchComposition.modeSerial')}
                                        </span>
                                    </div>
                                    <div
                                        className="text-xs font-mono mt-1 flex gap-3"
                                        style={{ color: 'var(--pi-muted, #a1a1aa)' }}
                                    >
                                        <span>{modelData.model?.sku}</span>
                                        <span className="font-bold" style={{ color: 'var(--pi-text, #f4f4f5)' }}>
                                            {t('common.qtyColon')} {Math.round(totalQty * 100) / 100}
                                        </span>
                                    </div>
                                </div>
                                <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                    <svg
                                        className="w-5 h-5"
                                        style={{ color: 'var(--pi-muted, #a1a1aa)' }}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="p-4 pt-0">
                                    <div
                                        className="pt-4"
                                        style={{ borderTop: '1px solid var(--pi-border, rgba(255,255,255,0.08))' }}
                                    >
                                        {isBulk ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="pi-label">{t('common.quantity')}</label>
                                                    <input
                                                        type="number"
                                                        placeholder={t('common.qty')}
                                                        value={quantity}
                                                        onChange={e => setQuantity(e.target.value)}
                                                        className="pi-input text-center text-lg font-bold"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={() => handleMove(true, modelId)}
                                                        disabled={actionLoading || !hasQty}
                                                        className="pi-btn-primary"
                                                    >
                                                        {t('common.addPlus')}
                                                    </button>
                                                    <button
                                                        onClick={() => handleMove(false, modelId)}
                                                        disabled={actionLoading || !hasQty}
                                                        className="pi-btn-ghost"
                                                    >
                                                        {t('common.removeMinus')}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {Array.isArray(modelData.items) && modelData.items.length > 0 && (
                                                    <div className="mb-4">
                                                        <span className="pi-label">{t('panels.batchComposition.assignedSerials')}</span>
                                                        <div className="flex flex-wrap gap-2">
                                                            {modelData.items.map((item) => (
                                                                <div
                                                                    key={item.id}
                                                                    className="px-2 py-1 rounded text-sm font-mono flex items-center gap-2"
                                                                    style={{
                                                                        backgroundColor: 'var(--pi-surface, #18181b)',
                                                                        border: '1px solid var(--pi-border, rgba(255,255,255,0.08))',
                                                                        color: 'var(--pi-text, #f4f4f5)',
                                                                    }}
                                                                >
                                                                    <span>{item.identifier}</span>
                                                                    <button
                                                                        onClick={() => setIdentifier(item.identifier as string)}
                                                                        className="font-bold"
                                                                        style={{ color: 'var(--pi-muted, #a1a1aa)' }}
                                                                        title="Copy to input"
                                                                    >
                                                                        ↓
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div>
                                                    <span className="pi-label">{t('panels.batchComposition.addRemoveSerial')}</span>
                                                    <input
                                                        type="text"
                                                        placeholder={t('common.scanOrTypeSerial')}
                                                        value={identifier}
                                                        onChange={e => setIdentifier(e.target.value)}
                                                        className="pi-input font-mono mb-2"
                                                    />
                                                    {availableItems.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mb-2">
                                                            {availableItems.map(item => (
                                                                <button
                                                                    key={item.id}
                                                                    onClick={() => setIdentifier(item.identifier)}
                                                                    className="px-2 py-0.5 text-xs rounded"
                                                                    style={{
                                                                        backgroundColor: 'var(--pi-surface, #18181b)',
                                                                        border: '1px solid var(--pi-border, rgba(255,255,255,0.08))',
                                                                        color: 'var(--pi-text, #f4f4f5)',
                                                                    }}
                                                                >
                                                                    {item.identifier}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            onClick={() => handleMove(true, modelId)}
                                                            disabled={actionLoading || !hasSerial}
                                                            className="pi-btn-primary"
                                                        >
                                                            {t('common.checkInCaps')}
                                                        </button>
                                                        <button
                                                            onClick={() => handleMove(false, modelId)}
                                                            disabled={actionLoading || !hasSerial}
                                                            className="pi-btn-ghost"
                                                        >
                                                            {t('common.checkOutCaps')}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
