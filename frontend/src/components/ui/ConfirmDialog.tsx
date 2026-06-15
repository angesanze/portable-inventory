import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    variant = "default",
    onConfirm,
    onCancel,
}) => {
    const { t } = useTranslation("common");
    if (!isOpen) return null;

    const resolvedConfirmLabel = confirmLabel ?? t("confirm");
    const resolvedCancelLabel = cancelLabel ?? t("cancel");

    const confirmClasses =
        variant === "danger"
            ? "bg-red-600 hover:bg-red-500 shadow-red-900/20"
            : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={onCancel}
            data-testid="confirm-dialog-overlay"
        >
            <div
                className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                data-testid="confirm-dialog"
            >
                <div className="p-6 space-y-4">
                    <div className="flex items-start gap-3">
                        {variant === "danger" && (
                            <div className="shrink-0 w-10 h-10 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center">
                                <AlertTriangle size={20} />
                            </div>
                        )}
                        <div>
                            <h3 className="text-lg font-bold text-white">{title}</h3>
                            <p className="text-sm text-zinc-400 mt-1 whitespace-pre-line">{message}</p>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 px-6 pb-6">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                        data-testid="confirm-dialog-cancel"
                    >
                        {resolvedCancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-6 py-2 text-white rounded-lg font-bold shadow-lg active:scale-95 transition-all duration-150 ${confirmClasses}`}
                        data-testid="confirm-dialog-confirm"
                    >
                        {resolvedConfirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
}

interface UseConfirmDialogReturn {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    dialogProps: ConfirmDialogProps;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({
        title: "",
        message: "",
    });
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
        setOptions(opts);
        setIsOpen(true);
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    const handleConfirm = useCallback(() => {
        setIsOpen(false);
        resolveRef.current?.(true);
        resolveRef.current = null;
    }, []);

    const handleCancel = useCallback(() => {
        setIsOpen(false);
        resolveRef.current?.(false);
        resolveRef.current = null;
    }, []);

    return {
        confirm,
        dialogProps: {
            isOpen,
            title: options.title,
            message: options.message,
            confirmLabel: options.confirmLabel,
            cancelLabel: options.cancelLabel,
            variant: options.variant,
            onConfirm: handleConfirm,
            onCancel: handleCancel,
        },
    };
}
