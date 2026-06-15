import React, { forwardRef, useEffect, useRef } from "react";

export interface CheckboxProps
    extends Omit<
        React.InputHTMLAttributes<HTMLInputElement>,
        "checked" | "onChange" | "type"
    > {
    checked: boolean | "indeterminate";
    onChange: (next: boolean) => void;
    "aria-label": string;
}

/**
 * Styled tri-state checkbox primitive. `checked="indeterminate"` is reflected
 * to the underlying `<input>` via the DOM property (HTML attribute alone is
 * not sufficient).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    ({ checked, onChange, className = "", disabled, ...props }, forwardedRef) => {
        const innerRef = useRef<HTMLInputElement | null>(null);

        useEffect(() => {
            if (innerRef.current) {
                innerRef.current.indeterminate = checked === "indeterminate";
            }
        }, [checked]);

        return (
            <input
                ref={(node) => {
                    innerRef.current = node;
                    if (typeof forwardedRef === "function") {
                        forwardedRef(node);
                    } else if (forwardedRef) {
                        forwardedRef.current = node;
                    }
                }}
                type="checkbox"
                checked={checked === true}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                className={[
                    "h-4 w-4 rounded border border-white/[0.12]",
                    "bg-zinc-900 text-indigo-500",
                    "accent-indigo-500 cursor-pointer",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    className,
                ]
                    .filter(Boolean)
                    .join(" ")}
                {...props}
            />
        );
    },
);

Checkbox.displayName = "Checkbox";
