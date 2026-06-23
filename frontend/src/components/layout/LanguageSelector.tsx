import { useTranslation } from "react-i18next";
import { Globe, ChevronDown } from "lucide-react";

// ---------- Language selector ----------
/** Toggles between English and Italian. Persists via LanguageDetector → localStorage. */
export function LanguageSelector({ collapsed }: { collapsed: boolean }) {
    const { t, i18n } = useTranslation();
    const isItalian = (i18n.language ?? "en").startsWith("it");
    const currentLabel = isItalian ? t("common:italian") : t("common:english");

    const toggle = () => {
        i18n.changeLanguage(isItalian ? "en" : "it");
    };

    if (collapsed) {
        return (
            <button
                onClick={toggle}
                className="flex items-center justify-center w-full py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                title={`${t("common:language")}: ${currentLabel}`}
                aria-label={`${t("common:language")}: ${currentLabel}`}
                data-testid="language-selector-collapsed"
            >
                <Globe className="w-4 h-4" strokeWidth={2} />
            </button>
        );
    }

    return (
        <button
            onClick={toggle}
            className="flex items-center gap-3 w-full px-2 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
            title={t("common:language")}
            aria-label={`${t("common:language")}: ${currentLabel}`}
            data-testid="language-selector"
        >
            <Globe className="w-4 h-4 flex-shrink-0 text-zinc-500" strokeWidth={2} />
            <span className="flex-1 text-left whitespace-nowrap">{currentLabel}</span>
            <ChevronDown className="w-3 h-3 text-zinc-600 flex-shrink-0" strokeWidth={2} />
        </button>
    );
}
