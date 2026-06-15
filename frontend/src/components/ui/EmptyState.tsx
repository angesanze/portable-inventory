import React from "react";
import { useTranslation } from "react-i18next";
import { Search, type LucideIcon } from "lucide-react";
import { Button } from "./Button";

interface HelpItem {
    icon: LucideIcon;
    text: string;
}

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
    helpItems?: HelpItem[];
    learnMoreUrl?: string;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    secondaryActionLabel,
    onSecondaryAction,
    helpItems,
    learnMoreUrl,
    className = "",
}) => {
    const { t } = useTranslation("common");
    return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 ${className}`}>
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800/80 mb-4">
            <Icon size={24} className="text-zinc-500" />
        </div>
        <h3 className="text-sm font-medium text-zinc-300 mb-1">{title}</h3>
        <p className="text-sm text-zinc-500 text-center max-w-sm">{description}</p>
        {helpItems && helpItems.length > 0 && (
            <ul className="mt-4 space-y-2 max-w-sm w-full">
                {helpItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-zinc-500">
                        <item.icon size={16} className="mt-0.5 shrink-0" />
                        <span>{item.text}</span>
                    </li>
                ))}
            </ul>
        )}
        {actionLabel && onAction && (
            <div className="mt-4">
                <Button variant="secondary" onClick={onAction}>
                    {actionLabel}
                </Button>
            </div>
        )}
        {secondaryActionLabel && onSecondaryAction && (
            <button
                type="button"
                className="mt-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                onClick={onSecondaryAction}
            >
                {secondaryActionLabel}
            </button>
        )}
        {learnMoreUrl && (
            <a
                href={learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
            >
                {t("learnMore")}
            </a>
        )}
    </div>
    );
};

interface FilteredEmptyStateProps {
    className?: string;
}

export const FilteredEmptyState: React.FC<FilteredEmptyStateProps> = ({
    className = "",
}) => {
    const { t } = useTranslation("common");
    return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 ${className}`}>
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800/80 mb-4">
            <Search size={24} className="text-zinc-500" />
        </div>
        <h3 className="text-sm font-medium text-zinc-300 mb-1">{t("noResults")}</h3>
        <p className="text-sm text-zinc-500 text-center max-w-sm">
            {t("tryAdjustingFilters")}
        </p>
    </div>
    );
};
