import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: "sm" | "md" | "lg";
    closeOnBackdrop?: boolean;
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
};

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    size = "md",
    closeOnBackdrop = true,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);

    // Escape closes
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [isOpen, onClose]);

    // Move initial focus into the panel (no focus trap required)
    useEffect(() => {
        if (isOpen) panelRef.current?.focus();
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => {
                if (closeOnBackdrop) onClose();
            }}
            data-testid="modal-overlay"
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                className={`bg-zinc-900 border border-white/[0.06] rounded-xl shadow-2xl w-full ${sizeClasses[size]} overflow-hidden outline-none`}
                onClick={(e) => e.stopPropagation()}
                data-testid="modal"
            >
                {title && (
                    <div className="flex items-start justify-between gap-4 px-6 pt-6">
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg p-1 transition-colors"
                            aria-label="Close"
                            data-testid="modal-close"
                        >
                            <X size={18} />
                        </button>
                    </div>
                )}
                <div className="p-6">{children}</div>
                {footer && <div className="flex justify-end gap-3 px-6 pb-6">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
};
