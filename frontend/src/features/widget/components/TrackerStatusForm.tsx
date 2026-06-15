import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PhysicalItem } from '../types';
import { StatusPicker } from './engines/StatusPicker';
import { Select, type SelectOption } from '../../../components/ui/Select';

interface TrackerStatusFormProps {
    identifier: string;
    setIdentifier: (id: string) => void;
    identifierLocked: boolean;
    availableItems: PhysicalItem[];
    transitions: Record<string, string[]>;
    onStatusChange: (payload: { identifier: string; newStatus: string; notes?: string }) => Promise<void>;
    actionLoading: boolean;
}

export const TrackerStatusForm: React.FC<TrackerStatusFormProps> = ({
    identifier,
    setIdentifier,
    identifierLocked,
    availableItems,
    transitions,
    onStatusChange,
    actionLoading,
}) => {
    const { t } = useTranslation('widget');
    const [newStatus, setNewStatus] = useState('');
    const [notes, setNotes] = useState('');

    const currentItem = useMemo(
        () => availableItems.find(i => i.identifier === identifier),
        [availableItems, identifier]
    );
    const currentStatus = currentItem?.status;
    const allowedTargets = useMemo(() => {
        if (currentStatus && transitions[currentStatus]) {
            return transitions[currentStatus];
        }
        // No (or unknown) current status → show every status reachable in the
        // configured machine, not just the keys. Previously we returned
        // Object.keys(transitions) which for a preset like
        // {BROKEN: [REPAIRED]} only surfaced "BROKEN" — the user could not
        // pick "REPAIRED" at all.
        const union = new Set<string>(Object.keys(transitions));
        for (const targets of Object.values(transitions)) {
            for (const s of targets) union.add(s);
        }
        return Array.from(union);
    }, [currentStatus, transitions]);

    const handleSubmit = async () => {
        if (!identifier || !newStatus) return;
        await onStatusChange({ identifier, newStatus, notes: notes || undefined });
        setNewStatus('');
        setNotes('');
    };

    return (
        <div className="mb-6 p-4 rounded-lg" data-testid="panel-tracker-status" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3 pb-2 flex items-center gap-2" style={{ color: 'var(--pi-primary, #6366f1)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {t('panels.trackerStatusForm.title')}
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
                                className="pi-input"
                                autoFocus={!identifierLocked}
                            />
                        </>
                    )}
                </div>

                <StatusPicker
                    label={t('panels.trackerStatusForm.newStatus')}
                    statuses={allowedTargets}
                    value={newStatus}
                    onChange={setNewStatus}
                    currentStatus={currentStatus}
                    disabled={actionLoading}
                />

                <div>
                    <label className="pi-label">{t('common.notes')}</label>
                    <input
                        type="text"
                        className="pi-input"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder={t('common.notesOptional')}
                    />
                </div>
            </div>

            <button
                type="button"
                onClick={handleSubmit}
                disabled={actionLoading || !identifier || !newStatus}
                className="w-full pi-btn-accent py-3 mt-4 disabled:opacity-50 transition-colors"
            >
                {t('panels.trackerStatusForm.submit')}
            </button>
        </div>
    );
};
