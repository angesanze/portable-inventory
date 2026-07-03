// ---------- Storage helpers ----------
export const SIDEBAR_KEY = "sidebar_collapsed";
export const NAV_GROUPS_KEY = "nav_groups_expanded";

export function getStoredCollapsed(): boolean {
    try {
        return localStorage.getItem(SIDEBAR_KEY) === "true";
    } catch {
        return false;
    }
}

/**
 * Per-group expanded state (`{ [labelKey]: boolean }`). A missing entry means
 * "use the group's default"; callers layer {@link NavGroup.collapsedByDefault}
 * on top. Corrupt or absent storage yields an empty map.
 */
export function getStoredExpandedGroups(): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(NAV_GROUPS_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, boolean>;
        }
        return {};
    } catch {
        return {};
    }
}
