import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, type LucideIcon } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
    message: string;
    variant?: ToastVariant;
    duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, "duration">> {
    id: number;
    duration: number;
}

interface ToastContextValue {
    toast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;

const variantConfig: Record<ToastVariant, { icon: LucideIcon; className: string }> = {
    success: { icon: CheckCircle2, className: "text-emerald-400" },
    error: { icon: AlertCircle, className: "text-red-400" },
    info: { icon: Info, className: "text-zinc-300" },
};

const ToastView: React.FC<{ item: ToastItem; onDismiss: (id: number) => void }> = ({ item, onDismiss }) => {
    const { icon: Icon, className } = variantConfig[item.variant];
    return (
        <button
            type="button"
            onClick={() => onDismiss(item.id)}
            className="flex items-start gap-3 bg-zinc-900 border border-white/[0.06] rounded-lg shadow-xl px-4 py-3 text-sm text-left w-full max-w-sm cursor-pointer"
            data-testid="toast"
        >
            <Icon size={16} className={`${className} mt-0.5 shrink-0`} />
            <span className="flex-1 text-zinc-200">{item.message}</span>
        </button>
    );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const idRef = useRef(0);
    const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const toast = useCallback(
        ({ message, variant = "info", duration = DEFAULT_DURATION }: ToastOptions) => {
            const id = ++idRef.current;
            setToasts((prev) => [...prev, { id, message, variant, duration }]);
            const timer = setTimeout(() => dismiss(id), duration);
            timers.current.set(id, timer);
        },
        [dismiss],
    );

    // Clean up any pending timers on unmount
    useEffect(() => {
        const map = timers.current;
        return () => {
            map.forEach((timer) => clearTimeout(timer));
            map.clear();
        };
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {createPortal(
                <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
                    {toasts.map((item) => (
                        <ToastView key={item.id} item={item} onDismiss={dismiss} />
                    ))}
                </div>,
                document.body,
            )}
        </ToastContext.Provider>
    );
};

ToastProvider.displayName = "ToastProvider";

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return ctx;
}
