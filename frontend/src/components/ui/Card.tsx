import React from 'react';

type PaddingSize = 'sm' | 'md' | 'lg' | 'none';

const paddingClasses: Record<PaddingSize, string> = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-7',
};

// --- Card ---

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    children: React.ReactNode;
    padding?: PaddingSize;
    hover?: boolean;
    header?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
    className = '',
    padding = 'md',
    hover = false,
    header,
    children,
    ...props
}) => {
    const baseClasses = 'bg-zinc-900/80 border border-white/[0.06] rounded-xl overflow-hidden';
    const hoverClasses = hover
        ? 'hover:border-white/[0.1] hover:bg-zinc-900 transition-colors duration-150'
        : '';

    return (
        <div {...props} className={`${baseClasses} ${hoverClasses} ${className}`}>
            {header && (
                <div className="px-5 py-4 border-b border-white/[0.06]">
                    {header}
                </div>
            )}
            <div className={paddingClasses[padding]}>
                {children}
            </div>
        </div>
    );
};

// --- CardHeader ---

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    children: React.ReactNode;
}

export const CardHeader: React.FC<CardSectionProps> = ({
    className = '',
    children,
    ...props
}) => (
    <div
        {...props}
        className={`px-5 py-4 border-b border-white/[0.06] ${className}`}
    >
        {children}
    </div>
);

// --- CardContent ---

export const CardContent: React.FC<CardSectionProps> = ({
    className = '',
    children,
    ...props
}) => (
    <div {...props} className={`p-5 ${className}`}>
        {children}
    </div>
);

// --- CardFooter ---

export const CardFooter: React.FC<CardSectionProps> = ({
    className = '',
    children,
    ...props
}) => (
    <div
        {...props}
        className={`px-5 py-4 border-t border-white/[0.06] ${className}`}
    >
        {children}
    </div>
);
