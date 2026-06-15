import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

export interface BulkAction {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    variant?: "default" | "danger";
}

interface BulkActionsBarProps {
    count: number;
    onClear: () => void;
    actions: BulkAction[];
}

export const BulkActionsBar = ({ count, onClear, actions }: BulkActionsBarProps) => {
    const { t } = useTranslation("common");

    if (count === 0) return null;

    return (
        <div
            role="region"
            aria-label={t("bulkSelected", { count })}
            className="sticky top-0 z-10 mb-3 flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-2"
            style={{
                backgroundColor: "var(--pi-surface, #18181b)",
                borderColor: "var(--pi-border, rgba(255,255,255,0.08))",
            }}
        >
            <span className="text-sm font-medium text-zinc-200">
                {t("bulkSelected", { count })}
            </span>
            <div className="flex items-center gap-2">
                {actions.map((action) => (
                    <Button
                        key={action.label}
                        size="sm"
                        variant={action.variant === "danger" ? "danger" : "secondary"}
                        icon={action.icon}
                        onClick={action.onClick}
                    >
                        {action.label}
                    </Button>
                ))}
                <button
                    type="button"
                    onClick={onClear}
                    aria-label={t("bulkClearSelection")}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};
