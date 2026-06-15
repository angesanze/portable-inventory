import React, { useState, useRef, useCallback } from "react";

type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps {
    content: React.ReactNode;
    side?: TooltipSide;
    delayMs?: number;
    children: React.ReactElement;
    className?: string;
}

const sideStyles: Record<TooltipSide, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    side = "top",
    delayMs = 200,
    children,
    className = "",
}) => {
    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = useCallback(() => {
        timeoutRef.current = setTimeout(() => setVisible(true), delayMs);
    }, [delayMs]);

    const hide = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setVisible(false);
    }, []);

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            {children}
            {visible && (
                <div
                    role="tooltip"
                    className={[
                        "absolute z-50 whitespace-nowrap",
                        "bg-zinc-800 border border-white/[0.08] rounded-md",
                        "px-2.5 py-1.5 text-xs text-zinc-200 shadow-lg",
                        "pointer-events-none",
                        "animate-in fade-in duration-150",
                        sideStyles[side],
                        className,
                    ]
                        .filter(Boolean)
                        .join(" ")}
                >
                    {content}
                </div>
            )}
        </div>
    );
};

Tooltip.displayName = "Tooltip";
