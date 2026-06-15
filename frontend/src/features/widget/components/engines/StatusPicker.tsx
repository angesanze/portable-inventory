import { useState } from 'react';
import { Check } from 'lucide-react';

interface StatusPickerProps {
    statuses: string[];
    value: string;
    onChange: (status: string) => void;
    currentStatus?: string;
    disabled?: boolean;
    label?: string;
}

const ACTIVE_STYLE: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--pi-primary, #6366f1) 22%, transparent)',
    color: 'var(--pi-text, #f4f4f5)',
    boxShadow: '0 0 0 2px color-mix(in srgb, var(--pi-primary, #6366f1) 60%, transparent)',
};

const INACTIVE_BG = 'var(--pi-input-bg, #27272a)';
const INACTIVE_HOVER_BG =
    'color-mix(in srgb, var(--pi-text, #f4f4f5) 5%, var(--pi-input-bg, #27272a))';

const inactiveStyle = (hover: boolean): React.CSSProperties => ({
    backgroundColor: hover ? INACTIVE_HOVER_BG : INACTIVE_BG,
    color: 'var(--pi-text, #f4f4f5)',
    boxShadow: '0 0 0 1px var(--pi-border, #3f3f46)',
});

const StatusButton: React.FC<{
    status: string;
    isActive: boolean;
    disabled?: boolean;
    onClick: () => void;
}> = ({ status, isActive, disabled, onClick }) => {
    const [hover, setHover] = useState(false);
    return (
        <button
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className={`pi-status-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed${
                isActive ? ' active' : ''
            }`}
            style={isActive ? ACTIVE_STYLE : inactiveStyle(hover)}
        >
            {isActive && (
                <Check
                    className="w-4 h-4"
                    strokeWidth={3}
                    aria-hidden="true"
                    style={{ color: 'var(--pi-primary, #6366f1)' }}
                />
            )}
            {status}
        </button>
    );
};

export const StatusPicker: React.FC<StatusPickerProps> = ({
    statuses,
    value,
    onChange,
    currentStatus,
    disabled,
    label,
}) => (
    <div>
        {label && <label className="pi-label">{label}</label>}
        {currentStatus && (
            <p className="text-xs mb-2" style={{ color: 'var(--pi-muted, #64748b)' }}>
                Current: <span className="font-semibold">{currentStatus}</span>
            </p>
        )}
        <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
                <StatusButton
                    key={status}
                    status={status}
                    isActive={value === status}
                    disabled={disabled}
                    onClick={() => onChange(status)}
                />
            ))}
        </div>
    </div>
);
