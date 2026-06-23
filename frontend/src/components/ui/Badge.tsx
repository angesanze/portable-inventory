import React from 'react';

export type BadgeVariant =
    | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'
    | 'emerald' | 'amber' | 'rose' | 'red' | 'cyan' | 'slate' | 'indigo';

export type BadgeSize = 'sm' | 'md';

interface BadgeProps {
    variant?: BadgeVariant;
    size?: BadgeSize;
    dot?: boolean;
    className?: string;
    children: React.ReactNode;
}

const sizeStyles: Record<BadgeSize, string> = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-[11px]',
};

const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; dot: string }> = {
    // Semantic variants
    success:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
    warning:  { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   dot: 'bg-amber-400' },
    error:    { bg: 'bg-rose-500/10',     text: 'text-rose-400',    border: 'border-rose-500/20',    dot: 'bg-rose-400' },
    info:     { bg: 'bg-cyan-500/10',     text: 'text-cyan-400',    border: 'border-cyan-500/20',    dot: 'bg-cyan-400' },
    neutral:  { bg: 'bg-zinc-500/10',     text: 'text-zinc-400',    border: 'border-zinc-500/20',    dot: 'bg-zinc-400' },
    primary:  { bg: 'bg-indigo-500/10',   text: 'text-indigo-400',  border: 'border-indigo-500/20',  dot: 'bg-indigo-400' },
    // Color aliases (backward compat)
    emerald:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
    amber:    { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   dot: 'bg-amber-400' },
    rose:     { bg: 'bg-rose-500/10',     text: 'text-rose-400',    border: 'border-rose-500/20',    dot: 'bg-rose-400' },
    red:      { bg: 'bg-red-500/10',      text: 'text-red-400',     border: 'border-red-500/20',     dot: 'bg-red-400' },
    cyan:     { bg: 'bg-cyan-500/10',     text: 'text-cyan-400',    border: 'border-cyan-500/20',    dot: 'bg-cyan-400' },
    slate:    { bg: 'bg-zinc-500/10',     text: 'text-zinc-400',    border: 'border-zinc-500/20',    dot: 'bg-zinc-400' },
    indigo:   { bg: 'bg-indigo-500/10',   text: 'text-indigo-400',  border: 'border-indigo-500/20',  dot: 'bg-indigo-400' },
};

export const Badge: React.FC<BadgeProps> = ({
    variant = 'neutral',
    size = 'md',
    dot = false,
    className = '',
    children
}) => {
    const styles = variantStyles[variant];

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full font-medium uppercase tracking-wider border ${sizeStyles[size]} ${styles.bg} ${styles.text} ${styles.border} ${className}`}
        >
            {dot && (
                <span className={`size-1.5 rounded-full ${styles.dot} shrink-0`} />
            )}
            {children}
        </span>
    );
};
