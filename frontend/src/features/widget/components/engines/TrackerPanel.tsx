import { useTranslation } from 'react-i18next';
import { Select, type SelectOption } from '../../../../components/ui/Select';
import { StatusPicker } from './StatusPicker';

interface TrackerPanelProps {
    fields: Array<{ name: string; label: string; options?: string[] }>;
    trackerItemId: string;
    setTrackerItemId: (v: string) => void;
    trackerStatus: string;
    setTrackerStatus: (v: string) => void;
    trackerNotes: string;
    setTrackerNotes: (v: string) => void;
    submitting: boolean;
    onTransaction: (op: 'add' | 'subtract') => void;
}

// Canonical tracker form layout. TrackerEngine no longer leaks these as
// defaults from `get_ui_config()` (Phase 03), so the widget renders them
// itself when the product has no custom field schema.
const DEFAULT_TRACKER_FIELDS: TrackerPanelProps['fields'] = [
    { name: 'physical_product_id', label: 'Item' },
    { name: 'new_status', label: 'Status', options: ['ACTIVE', 'IN_USE', 'RETURNED', 'EXPIRED', 'DISPOSED'] },
    { name: 'notes', label: 'Notes' },
];

export const TrackerPanel: React.FC<TrackerPanelProps> = ({
    fields, trackerItemId, setTrackerItemId, trackerStatus, setTrackerStatus,
    trackerNotes, setTrackerNotes, submitting, onTransaction,
}) => {
    const { t } = useTranslation('widget');
    const effectiveFields = fields && fields.length > 0 ? fields : DEFAULT_TRACKER_FIELDS;
    return (
    <div className="space-y-4" data-testid="panel-tracker-form">
        <div className="grid gap-3">
            {effectiveFields.map((field: any) => {
                if (field.name === 'physical_product_id') {
                    return (
                        <div key={field.name}>
                            <label className="pi-label">
                                {field.label}
                            </label>
                            <Select
                                custom
                                placeholder={t('common.selectItemPlaceholder')}
                                value={trackerItemId}
                                onChange={val => setTrackerItemId(String(val))}
                                options={[] as SelectOption[]}
                            />
                            <p className="text-xs mt-1" style={{ color: 'var(--pi-muted, #64748b)' }}>{t('panels.trackerPanel.itemsLoadedFromProduct')}</p>
                        </div>
                    );
                }
                if (field.name === 'new_status') {
                    return (
                        <StatusPicker
                            key={field.name}
                            label={field.label}
                            statuses={field.options || []}
                            value={trackerStatus}
                            onChange={setTrackerStatus}
                        />
                    );
                }
                if (field.name === 'notes') {
                    return (
                        <div key={field.name}>
                            <label className="pi-label">
                                {field.label}
                            </label>
                            <input
                                type="text"
                                className="pi-input"
                                value={trackerNotes}
                                onChange={e => setTrackerNotes(e.target.value)}
                                placeholder={t('common.notesOptional')}
                            />
                        </div>
                    );
                }
                return null;
            })}
        </div>

        <button
            onClick={() => onTransaction('add')}
            disabled={submitting || !trackerItemId || !trackerStatus}
            className="w-full pi-btn-accent py-3 disabled:opacity-50 transition-colors"
        >
            {t('panels.trackerPanel.updateStatus')}
        </button>
    </div>
    );
};
