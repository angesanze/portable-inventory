import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CircleHelp } from "lucide-react";

type InfoTipPosition = "top" | "bottom" | "left" | "right";

interface InfoTipProps {
    content: string | React.ReactNode;
    title?: string;
    position?: InfoTipPosition;
}

export const InfoTip: React.FC<InfoTipProps> = ({
    content,
    title,
    position = "top",
}) => {
    const { t } = useTranslation("common");
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const gap = 8;

        let top = 0;
        let left = 0;

        switch (position) {
            case "top":
                top = rect.top - gap;
                left = rect.left + rect.width / 2;
                break;
            case "bottom":
                top = rect.bottom + gap;
                left = rect.left + rect.width / 2;
                break;
            case "left":
                top = rect.top + rect.height / 2;
                left = rect.left - gap;
                break;
            case "right":
                top = rect.top + rect.height / 2;
                left = rect.right + gap;
                break;
        }

        setCoords({ top, left });
    }, [position]);

    const handleToggle = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!open) updatePosition();
            setOpen((prev) => !prev);
        },
        [open, updatePosition],
    );

    // Close on click outside
    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                triggerRef.current?.contains(e.target as Node) ||
                popoverRef.current?.contains(e.target as Node)
            )
                return;
            setOpen(false);
        };

        // Close on escape
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [open]);

    const transformOrigin: Record<InfoTipPosition, string> = {
        top: "bottom center",
        bottom: "top center",
        left: "center right",
        right: "center left",
    };

    const positionStyles: Record<InfoTipPosition, React.CSSProperties> = {
        top: { bottom: "auto", top: coords.top, left: coords.left, transform: "translate(-50%, -100%)" },
        bottom: { top: coords.top, left: coords.left, transform: "translate(-50%, 0)" },
        left: { top: coords.top, left: coords.left, transform: "translate(-100%, -50%)" },
        right: { top: coords.top, left: coords.left, transform: "translate(0, -50%)" },
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={handleToggle}
                className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 rounded-full"
                aria-label={t("moreInfo")}
                aria-expanded={open}
            >
                <CircleHelp size={14} />
            </button>

            {open &&
                createPortal(
                    <div
                        ref={popoverRef}
                        role="tooltip"
                        style={{
                            position: "fixed",
                            zIndex: 9999,
                            transformOrigin: transformOrigin[position],
                            ...positionStyles[position],
                        }}
                        className="animate-in fade-in zoom-in-95 duration-150 max-w-xs bg-zinc-800 rounded-lg p-3 ring-1 ring-zinc-700 shadow-xl"
                    >
                        {title && (
                            <p className="text-xs font-medium text-zinc-100 mb-1">
                                {title}
                            </p>
                        )}
                        <div className="text-sm text-zinc-300">{content}</div>
                    </div>,
                    document.body,
                )}
        </>
    );
};

InfoTip.displayName = "InfoTip";
