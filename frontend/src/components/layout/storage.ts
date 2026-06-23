// ---------- Storage helpers ----------
export const SIDEBAR_KEY = "sidebar_collapsed";
export const SETTINGS_NAV_KEY = "nav_settings_expanded";

export function getStoredCollapsed(): boolean {
    try {
        return localStorage.getItem(SIDEBAR_KEY) === "true";
    } catch {
        return false;
    }
}

export function getStoredSettingsExpanded(): boolean {
    try {
        return localStorage.getItem(SETTINGS_NAV_KEY) === "true";
    } catch {
        return false;
    }
}
