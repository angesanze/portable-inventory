import React from 'react';
import { Badge } from './Badge';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    /** Alias for {@link subtitle}; rendered identically when subtitle is absent. */
    description?: string;
    count?: number;
    actions?: React.ReactNode;
    className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    description,
    count,
    actions,
    className = '',
}) => {
    const subtitleText = subtitle ?? description;
    return (
        <div className={`flex justify-between items-center mb-6 ${className}`}>
            <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold text-zinc-50">{title}</h1>
                    {count !== undefined && (
                        <Badge variant="neutral">{count.toLocaleString()}</Badge>
                    )}
                </div>
                {subtitleText && (
                    <p className="text-sm text-zinc-400 mt-1">{subtitleText}</p>
                )}
            </div>
            {actions && (
                <div className="flex items-center gap-2">
                    {actions}
                </div>
            )}
        </div>
    );
};
