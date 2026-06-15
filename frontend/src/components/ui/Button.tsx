import React, { forwardRef } from "react";
import { Loader } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: LucideIcon;
    children?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
    primary: [
        "bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-500",
        "bg-[length:200%_100%]",
        "text-white font-medium",
        "hover:animate-shimmer hover:shadow-glow-sm",
        "active:brightness-90",
    ].join(" "),
    secondary: [
        "bg-transparent border border-white/[0.06]",
        "text-zinc-300",
        "hover:bg-white/5 hover:text-zinc-100",
    ].join(" "),
    ghost: [
        "bg-transparent",
        "text-zinc-400",
        "hover:bg-white/5 hover:text-zinc-200",
    ].join(" "),
    danger: [
        "bg-red-500/10",
        "text-red-400",
        "hover:bg-red-500/20",
    ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-sm gap-1.5",
    md: "h-9 px-4 text-sm gap-2",
    lg: "h-10 px-5 text-base gap-2",
};

const iconSizes: Record<ButtonSize, number> = {
    sm: 14,
    md: 16,
    lg: 18,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = "primary",
            size = "md",
            loading = false,
            icon: Icon,
            children,
            disabled,
            className = "",
            ...props
        },
        ref
    ) => {
        const isDisabled = disabled || loading;

        return (
            <button
                ref={ref}
                disabled={isDisabled}
                className={[
                    "inline-flex items-center justify-center",
                    "rounded-lg font-medium",
                    "transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
                    "disabled:opacity-50 disabled:pointer-events-none",
                    variantStyles[variant],
                    sizeStyles[size],
                    className,
                ]
                    .filter(Boolean)
                    .join(" ")}
                {...props}
            >
                {loading ? (
                    <Loader size={iconSizes[size]} className="animate-spin" />
                ) : Icon ? (
                    <Icon size={iconSizes[size]} />
                ) : null}
                {children}
            </button>
        );
    }
);

Button.displayName = "Button";
