import React, { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";

/* ─── Shared styles ─────────────────────────────────────────────── */

const baseInput = [
    "w-full bg-zinc-900 border border-white/[0.06] rounded-lg",
    "text-sm text-zinc-50 placeholder:text-zinc-500",
    "transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500/50",
    "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

const errorRing = "ring-2 ring-red-500/30 border-red-500/50";

/* ─── Input ─────────────────────────────────────────────────────── */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    labelExtra?: React.ReactNode;
    error?: string;
    helperText?: string;
    icon?: LucideIcon;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, labelExtra, error, helperText, icon: Icon, className = "", id, ...props }, ref) => {
        const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <label htmlFor={inputId} className="text-sm font-medium text-zinc-300 inline-flex items-center gap-1.5">
                        {label}
                        {labelExtra}
                    </label>
                )}
                <div className="relative">
                    {Icon && (
                        <Icon
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                        />
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        className={[
                            baseInput,
                            "h-9 px-3",
                            Icon ? "pl-9" : "",
                            error ? errorRing : "",
                            className,
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        {...props}
                    />
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                {!error && helperText && <p className="text-xs text-zinc-500">{helperText}</p>}
            </div>
        );
    }
);

Input.displayName = "Input";

/* ─── Textarea ──────────────────────────────────────────────────── */

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    labelExtra?: React.ReactNode;
    error?: string;
    helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ label, labelExtra, error, helperText, className = "", id, ...props }, ref) => {
        const textareaId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <label htmlFor={textareaId} className="text-sm font-medium text-zinc-300 inline-flex items-center gap-1.5">
                        {label}
                        {labelExtra}
                    </label>
                )}
                <textarea
                    ref={ref}
                    id={textareaId}
                    className={[
                        baseInput,
                        "px-3 py-2 min-h-[80px] resize-y",
                        error ? errorRing : "",
                        className,
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    {...props}
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                {!error && helperText && <p className="text-xs text-zinc-500">{helperText}</p>}
            </div>
        );
    }
);

Textarea.displayName = "Textarea";
