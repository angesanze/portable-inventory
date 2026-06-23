import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PhysicalItem, Product } from '../types';
import { BatchForm } from './BatchForm';
import { Select, type SelectOption } from '../../../components/ui/Select';

interface TrackerFormProps {
    identifier: string;
    setIdentifier: (id: string) => void;
    identifierLocked: boolean;
    availableItems: PhysicalItem[];
    activeProduct: Product;
    batchData: Record<string, string>;
    setBatchData: (d: Record<string, string>) => void;
    handleMove: (isAdd: boolean) => Promise<void>;
    actionLoading: boolean;
}

export const TrackerForm: React.FC<TrackerFormProps> = ({
    identifier,
    setIdentifier,
    identifierLocked,
    availableItems,
    activeProduct,
    batchData,
    setBatchData,
    handleMove,
    actionLoading,
}) => {
    const { t } = useTranslation('widget');
    // Only show extra batch fields when the product itself defines them via
    // `attributes.fields`. Do NOT fall back to `calc_config.ui_config.fields`:
    // TrackerEngine.get_ui_config() returns engine defaults (item/status/notes)
    // that have nothing to do with the product schema and leak into a generic
    // BatchForm here, rendering bogus ITEM/STATUS inputs for plain SERIALIZED
    // products.
    const schemaFields = activeProduct.attributes?.fields || [];

    return (
        <div
            className="mb-6 p-4 rounded-lg"
            data-testid="panel-tracker-form"
            style={{
                backgroundColor: 'var(--pi-surface, #18181b)',
                border: '1px solid var(--pi-border, rgba(255,255,255,0.08))',
            }}
        >
            <h3
                className="text-sm font-semibold uppercase tracking-wider mb-3 pb-2 flex items-center gap-2"
                style={{
                    color: 'var(--pi-primary, #6366f1)',
                    borderBottom: '1px solid var(--pi-border, rgba(255,255,255,0.06))',
                }}
            >
                <span className="text-lg">🏷️</span> {t('panels.trackerForm.title')}
            </h3>
            <div className="space-y-4">
                <div>
                    {availableItems.length > 0 ? (
                        <Select
                            label={t('common.selectItem')}
                            value={identifier}
                            onChange={(val) => setIdentifier(String(val))}
                            disabled={identifierLocked}
                            placeholder={t('common.chooseSerial')}
                            options={availableItems.map<SelectOption>(item => ({
                                value: item.identifier,
                                label: item.identifier,
                                description: item.status || undefined,
                            }))}
                        />
                    ) : (
                        <>
                            <label className="pi-label">{t('common.scanOrEnterId')}</label>
                            <input
                                type="text"
                                value={identifier}
                                disabled={identifierLocked}
                                onChange={e => setIdentifier(e.target.value)}
                                placeholder={t('common.serialBarcode')}
                                className="pi-input font-mono"
                                style={identifierLocked ? {
                                    color: 'var(--pi-muted, #a1a1aa)',
                                    backgroundColor: 'color-mix(in srgb, var(--pi-input-bg, #27272a) 70%, black)',
                                    cursor: 'not-allowed',
                                } : undefined}
                                autoFocus={!identifierLocked}
                            />
                        </>
                    )}
                </div>

                {schemaFields.length > 0 && (
                    <BatchForm
                        fields={schemaFields}
                        batchData={batchData}
                        setBatchData={setBatchData}
                    />
                )}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                    onClick={() => handleMove(true)}
                    disabled={actionLoading || !identifier.trim()}
                    className="pi-btn-accent p-4 flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                        background:
                            'linear-gradient(135deg, var(--pi-primary, #6366f1), color-mix(in srgb, var(--pi-primary, #6366f1) 70%, black))',
                    }}
                >
                    <span className="text-sm uppercase tracking-wider">{t('common.checkInCaps')}</span>
                    <span className="text-xs opacity-75">{t('common.receiveItem')}</span>
                </button>
                <button
                    onClick={() => handleMove(false)}
                    disabled={actionLoading || !identifier.trim()}
                    className="pi-btn-ghost p-4 flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="text-sm uppercase tracking-wider">{t('common.checkOutCaps')}</span>
                    <span className="text-xs opacity-75">{t('common.releaseItem')}</span>
                </button>
            </div>
        </div>
    );
};
