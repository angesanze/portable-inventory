import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Lightbulb, X, type LucideIcon } from "lucide-react";

interface DismissableHintProps {
    id: string;
    children: React.ReactNode;
    icon?: LucideIcon;
    className?: string;
}

function getStorageKey(id: string): string {
    return `hint_dismissed_${id}`;
}

export const DismissableHint: React.FC<DismissableHintProps> = ({
    id,
    children,
    icon: Icon = Lightbulb,
    className,
}) => {
    const { t } = useTranslation("common");
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(getStorageKey(id)) === "true";
        } catch {
            return false;
        }
    });

    // Sync if id changes
    useEffect(() => {
        try {
            setDismissed(localStorage.getItem(getStorageKey(id)) === "true");
        } catch {
            setDismissed(false);
        }
    }, [id]);

    const handleDismiss = useCallback(() => {
        try {
            localStorage.setItem(getStorageKey(id), "true");
        } catch {
            // localStorage unavailable — dismiss for session only
        }
        setDismissed(true);
    }, [id]);

    if (dismissed) return null;

    return (
        <div className={`bg-zinc-800/50 rounded-lg p-3 flex items-start gap-3${className ? ` ${className}` : ""}`}>
            <Icon size={16} className="text-zinc-400 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm text-zinc-300">{children}</div>
            <button
                type="button"
                onClick={handleDismiss}
                className="text-zinc-500 hover:text-zinc-300 transition-colors duration-150 shrink-0"
                aria-label={t("dismissHint")}
            >
                <X size={14} />
            </button>
        </div>
    );
};

DismissableHint.displayName = "DismissableHint";
