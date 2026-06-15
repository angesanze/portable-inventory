import { useTranslation } from "react-i18next";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useCapabilities } from "../../hooks/useCapabilities";

/** Days remaining before a banner warning kicks in. */
const WARN_WINDOW_DAYS = 30;

function daysUntil(iso: string): number {
    const expiry = new Date(iso).getTime();
    const now = Date.now();
    return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}

/**
 * License-state banner (GOVERNANCE-11 / C1).
 *
 * Reads the `license` envelope from the identity payload (via
 * {@link useCapabilities}) and renders:
 *
 * - a loud red bar when the license is expired (every write is server-side
 *   blocked with `code: license_expired`, the workspace is read-only);
 * - an amber bar when the license expires within {@link WARN_WINDOW_DAYS} days.
 *
 * Renders `null` for perpetual licenses or when expiry is comfortably far off,
 * so the normal dashboard chrome is untouched.
 */
export const LicenseBanner = () => {
    const { t } = useTranslation("nav");
    const { license, isLoading } = useCapabilities();

    if (isLoading || !license) return null;

    if (license.expired) {
        return (
            <div
                role="alert"
                data-testid="license-banner-expired"
                className="flex items-center gap-3 px-3 py-2 sm:px-4 md:px-6 bg-red-500/15 border-b border-red-500/30 text-red-200"
            >
                <ShieldAlert className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                <span className="flex-1 text-sm min-w-0">{t("licenseExpired")}</span>
            </div>
        );
    }

    if (!license.expires_at) return null;

    const remaining = daysUntil(license.expires_at);
    if (remaining > WARN_WINDOW_DAYS) return null;

    return (
        <div
            role="status"
            data-testid="license-banner-expiring"
            className="flex items-center gap-3 px-3 py-2 sm:px-4 md:px-6 bg-amber-500/15 border-b border-amber-500/30 text-amber-200"
        >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
            <span className="flex-1 text-sm min-w-0">
                {t("licenseExpiring", { days: Math.max(remaining, 0) })}
            </span>
        </div>
    );
};
