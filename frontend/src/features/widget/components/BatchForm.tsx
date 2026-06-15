import React from 'react';

interface SchemaField {
    key: string;
    label: string;
    type: string;
}

interface BatchFormProps {
    fields: SchemaField[];
    batchData: any;
    setBatchData: (d: any) => void;
}

export const BatchForm: React.FC<BatchFormProps> = ({
    fields,
    batchData,
    setBatchData,
}) => {
    const visibleFields = fields.filter(f => f.key !== 'batch_identifier');

    if (visibleFields.length === 0) return null;

    return (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--pi-border)' }}>
            <div className="pi-label">Batch Details</div>
            {visibleFields.map(field => (
                <div key={field.key} className="mb-2">
                    <label className="pi-label">{field.label}</label>
                    <input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        placeholder={field.label}
                        value={batchData[field.key] || ''}
                        onChange={e => setBatchData({ ...batchData, [field.key]: e.target.value })}
                        className="pi-input"
                    />
                </div>
            ))}
        </div>
    );
};
