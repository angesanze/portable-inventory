import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Input } from './Input';
import { Select, type SelectOption } from './Select';
import { Card } from './Card';

/* ─── Types ───────────────────────────────────────────────────── */

export interface FilterConfig {
    key: string;
    label: string;
    type: 'text' | 'select';
    options?: SelectOption[];
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
}

interface FilterBarProps {
    filters: FilterConfig[];
    className?: string;
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function getActiveFilters(filters: FilterConfig[]) {
    return filters.filter((f) => f.value !== '');
}

function getDisplayValue(filter: FilterConfig): string {
    if (filter.type === 'select' && filter.options) {
        const opt = filter.options.find((o) => String(o.value) === filter.value);
        return opt?.label ?? filter.value;
    }
    return filter.value;
}

/* ─── FilterBar ───────────────────────────────────────────────── */

export const FilterBar: React.FC<FilterBarProps> = ({ filters, className = '' }) => {
    const { t } = useTranslation('common');
    const activeFilters = getActiveFilters(filters);

    const handleClearAll = () => {
        filters.forEach((f) => {
            if (f.value !== '') f.onChange('');
        });
    };

    return (
        <Card padding="sm" className={className}>
            {/* Filter controls row */}
            <div className="flex items-end gap-3 flex-wrap">
                {filters.map((filter) => {
                    if (filter.type === 'select') {
                        return (
                            <div key={filter.key} className="min-w-[160px]">
                                <Select
                                    label={filter.label}
                                    placeholder={filter.placeholder ?? t('allOf', { label: filter.label })}
                                    options={filter.options ?? []}
                                    value={filter.value}
                                    onChange={(val) => filter.onChange(String(val))}
                                />
                            </div>
                        );
                    }

                    return (
                        <div key={filter.key} className="min-w-[200px]">
                            <Input
                                label={filter.label}
                                placeholder={filter.placeholder ?? t('filterByLabel', { label: filter.label.toLowerCase() })}
                                value={filter.value}
                                onChange={(e) => filter.onChange(e.target.value)}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Active filter pills */}
            {activeFilters.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-3">
                    {activeFilters.map((filter) => (
                        <span
                            key={filter.key}
                            className="inline-flex items-center gap-1.5 text-xs bg-indigo-500/10 text-indigo-400 rounded-full px-2.5 py-1"
                        >
                            <span className="text-indigo-400/60">{filter.label}:</span>
                            {getDisplayValue(filter)}
                            <button
                                type="button"
                                onClick={() => filter.onChange('')}
                                className="hover:text-white transition-colors"
                                aria-label={t('removeFilter', { label: filter.label })}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                    <button
                        type="button"
                        onClick={handleClearAll}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
                    >
                        {t('clearAll')}
                    </button>
                </div>
            )}
        </Card>
    );
};
