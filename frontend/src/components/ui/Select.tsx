import React, { useState, useRef, useEffect, useLayoutEffect, forwardRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ─── Shared styles (matches Input component tokens) ───────────── */

const baseInput = [
    "w-full bg-zinc-900 border border-white/[0.06] rounded-lg",
    "text-sm text-zinc-50 placeholder:text-zinc-500",
    "transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500/50",
    "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

const errorRing = "ring-2 ring-red-500/30 border-red-500/50";

/* ─── Types ────────────────────────────────────────────────────── */

export interface SelectOption {
    value: string | number;
    label: string;
    description?: string;
    icon?: LucideIcon;
}

interface SelectBaseProps {
    label?: string;
    labelExtra?: React.ReactNode;
    options: SelectOption[];
    error?: string;
    helperText?: string;
    placeholder?: string;
    className?: string;
}

/** Native HTML select — use for simple option lists. */
interface NativeSelectProps
    extends SelectBaseProps,
        Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className"> {
    custom: false;
    value?: string | number;
    onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}

/** Custom dropdown — platform-styled combobox (default). */
interface CustomSelectProps extends SelectBaseProps {
    custom?: true;
    value?: string | number | null;
    onChange?: (value: string | number) => void;
    disabled?: boolean;
    required?: boolean;
    id?: string;
    name?: string;
}

export type SelectProps = NativeSelectProps | CustomSelectProps;

/* ─── Native Select ────────────────────────────────────────────── */

const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
    ({ label, labelExtra, options, error, helperText, placeholder, className = "", ...props }, ref) => {
        const inputId = props.id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <label htmlFor={inputId} className="text-sm font-medium text-zinc-300 inline-flex items-center gap-1.5">
                        {label}
                        {labelExtra}
                    </label>
                )}
                <div className="relative">
                    <select
                        ref={ref}
                        id={inputId}
                        className={[
                            baseInput,
                            "h-9 px-3 appearance-none pr-9",
                            error ? errorRing : "",
                            className,
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        {...props}
                    >
                        {placeholder && (
                            <option key="__placeholder" value="">
                                {placeholder}
                            </option>
                        )}
                        {options.map((opt, idx) => (
                            <option key={`${opt.value}-${idx}`} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                    />
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                {!error && helperText && <p className="text-xs text-zinc-500">{helperText}</p>}
            </div>
        );
    }
);

NativeSelect.displayName = "NativeSelect";

/* ─── Custom Select (portal dropdown) ─────────────────────────── */

const CustomDropdown: React.FC<CustomSelectProps> = ({
    id,
    name,
    label,
    labelExtra,
    value,
    onChange,
    options,
    placeholder = "Select an option…",
    error,
    helperText,
    disabled = false,
    required = false,
    className = "",
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Position dropdown using fixed positioning (escapes overflow clipping)
    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current || !menuRef.current) return;

        const trigger = triggerRef.current.getBoundingClientRect();
        const menu = menuRef.current;
        const menuRect = menu.getBoundingClientRect();

        // Match trigger width
        menu.style.width = `${trigger.width}px`;

        // Vertical: prefer below, flip above if overflows
        let top = trigger.bottom + 4;
        if (top + menuRect.height > window.innerHeight) {
            top = trigger.top - menuRect.height - 4;
        }

        // Clamp to viewport
        top = Math.max(4, Math.min(top, window.innerHeight - menuRect.height - 4));

        menu.style.top = `${top}px`;
        menu.style.left = `${trigger.left}px`;
    });

    // Click outside
    useEffect(() => {
        if (!isOpen) return;
        const onClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                menuRef.current && !menuRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [isOpen]);

    // Close on scroll (but not when scrolling inside the dropdown itself)
    useEffect(() => {
        if (!isOpen) return;
        const onScroll = (e: Event) => {
            if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        window.addEventListener("scroll", onScroll, true);
        return () => window.removeEventListener("scroll", onScroll, true);
    }, [isOpen]);

    const selected = options.find((o) => o.value === value);

    const handleSelect = (val: string | number) => {
        onChange?.(val);
        setIsOpen(false);
    };

    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    const dropdownContent = isOpen
        ? createPortal(
              <div
                  ref={menuRef}
                  role="listbox"
                  style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      backgroundColor: "var(--pi-surface, #27272a)",
                      border: "1px solid var(--pi-border, rgba(255,255,255,0.08))",
                  }}
                  className="z-[9999] rounded-lg shadow-xl max-h-60 overflow-auto"
              >
                  <div className="p-1">
                      {options.length === 0 ? (
                          <div
                              className="px-3 py-2 text-sm text-center italic"
                              style={{ color: "var(--pi-muted, #71717a)" }}
                          >
                              No options available
                          </div>
                      ) : (
                          options.map((option) => {
                              const isSelected = option.value === value;
                              const Icon = option.icon;
                              const rowStyle: React.CSSProperties = isSelected
                                  ? {
                                        backgroundColor:
                                            "color-mix(in srgb, var(--pi-primary, #6366f1) 12%, transparent)",
                                        color: "var(--pi-primary, #818cf8)",
                                    }
                                  : { color: "var(--pi-text, #d4d4d8)" };
                              return (
                                  <div
                                      key={option.value}
                                      role="option"
                                      aria-selected={isSelected}
                                      onClick={() => handleSelect(option.value)}
                                      style={rowStyle}
                                      className={[
                                          "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm",
                                          "transition-colors",
                                          isSelected
                                              ? ""
                                              : "hover:bg-white/[0.05] hover:text-zinc-50",
                                      ].join(" ")}
                                  >
                                      <div className="flex items-center gap-2 min-w-0">
                                          {Icon && (
                                              <Icon
                                                  size={14}
                                                  className="shrink-0"
                                                  style={{
                                                      color: isSelected
                                                          ? "var(--pi-primary, #818cf8)"
                                                          : "var(--pi-muted, #71717a)",
                                                  }}
                                              />
                                          )}
                                          <div className="flex flex-col min-w-0">
                                              <span className="truncate">{option.label}</span>
                                              {option.description && (
                                                  <span
                                                      className="text-xs truncate"
                                                      style={{
                                                          color: isSelected
                                                              ? "color-mix(in srgb, var(--pi-primary, #818cf8) 60%, transparent)"
                                                              : "var(--pi-muted, #71717a)",
                                                      }}
                                                  >
                                                      {option.description}
                                                  </span>
                                              )}
                                          </div>
                                      </div>
                                      {isSelected && (
                                          <Check
                                              size={14}
                                              className="shrink-0"
                                              style={{ color: "var(--pi-primary, #818cf8)" }}
                                          />
                                      )}
                                  </div>
                              );
                          })
                      )}
                  </div>
              </div>,
              document.body
          )
        : null;

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            {label && (
                <label htmlFor={inputId} className="text-sm font-medium text-zinc-300 inline-flex items-center gap-1.5">
                    {label} {required && <span className="text-red-400">*</span>}
                    {labelExtra}
                </label>
            )}

            {/* Trigger */}
            <button
                ref={triggerRef}
                type="button"
                id={inputId}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                style={{
                    backgroundColor: "var(--pi-input-bg, #18181b)",
                    borderColor: "var(--pi-border, rgba(255,255,255,0.06))",
                    color: "var(--pi-text, #fafafa)",
                }}
                className={[
                    baseInput,
                    "h-9 px-3 flex items-center justify-between text-left cursor-pointer",
                    error ? errorRing : "",
                    isOpen ? "ring-2 ring-indigo-500/30 border-indigo-500/50" : "",
                    disabled ? "opacity-50 cursor-not-allowed" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
            >
                <span
                    className="block truncate"
                    style={!selected ? { color: "var(--pi-muted, #71717a)" } : undefined}
                >
                    {selected ? (
                        <span className="flex items-center gap-2">
                            {selected.icon &&
                                React.createElement(selected.icon, {
                                    size: 14,
                                    className: "shrink-0",
                                    style: { color: "var(--pi-muted, #a1a1aa)" },
                                })}
                            {selected.label}
                        </span>
                    ) : (
                        placeholder
                    )}
                </span>
                <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                    style={{ color: "var(--pi-muted, #71717a)" }}
                />
            </button>

            {/* Dropdown via portal */}
            {dropdownContent}

            {error && <p className="text-xs text-red-400">{error}</p>}
            {!error && helperText && <p className="text-xs text-zinc-500">{helperText}</p>}
            {name && <input type="hidden" name={name} value={value ?? ""} />}
        </div>
    );
};

/* ─── Unified Select ───────────────────────────────────────────── */

export const Select = forwardRef<HTMLSelectElement, SelectProps>((props, ref) => {
    const useCustom = props.custom !== false;

    if (useCustom) {
        const { custom: _, ...rest } = props as CustomSelectProps & { custom?: boolean };
        return <CustomDropdown {...rest} custom={true} />;
    }

    const { custom: _, ...rest } = props as NativeSelectProps & { custom?: boolean };
    return <NativeSelect ref={ref} {...rest} />;
});

Select.displayName = "Select";
