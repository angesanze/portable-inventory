import React from 'react';
import { Badge } from './Badge';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    count?: number;
    actions?: React.ReactNode;
    className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    count,
    actions,
    className = '',
}) => {
    return (
        <div className={`flex justify-between items-center mb-6 ${className}`}>
            <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold text-zinc-50">{title}</h1>
                    {count !== undefined && (
                        <Badge variant="neutral">{count.toLocaleString()}</Badge>
                    )}
                </div>
                {subtitle && (
                    <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>
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
