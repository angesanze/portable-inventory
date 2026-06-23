import React from 'react';
import type { UiConfigField } from '../types';

interface BatchFormProps {
    fields: UiConfigField[];
    batchData: Record<string, string>;
    setBatchData: (d: Record<string, string>) => void;
}

const fieldKey = (f: UiConfigField) => f.key ?? f.name ?? f.label;

export const BatchForm: React.FC<BatchFormProps> = ({
    fields,
    batchData,
    setBatchData,
}) => {
    const visibleFields = fields.filter(f => fieldKey(f) !== 'batch_identifier');

    if (visibleFields.length === 0) return null;

    return (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--pi-border)' }}>
            <div className="pi-label">Batch Details</div>
            {visibleFields.map(field => {
                const key = fieldKey(field);
                return (
                <div key={key} className="mb-2">
                    <label className="pi-label">{field.label}</label>
                    <input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        placeholder={field.label}
                        value={batchData[key] || ''}
                        onChange={e => setBatchData({ ...batchData, [key]: e.target.value })}
                        className="pi-input"
                    />
                </div>
                );
            })}
        </div>
    );
};
