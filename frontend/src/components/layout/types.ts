import type { Capabilities } from "../../hooks/useCapabilities";

// ---------- Navigation structure ----------
/**
 * Static nav structure holding i18n keys (resolved with `t()` at render time)
 * rather than literal strings. `labelKey` maps into the `nav` namespace.
 */
export interface NavItem {
    name: string;
    labelKey: string;
    route: string;
    /**
     * Capability required to render this entry. Absent = always visible.
     * Manager accounts fail closed (see {@link useCapabilities}), so
     * developer-only surfaces stay hidden until identity grants the flag.
     */
    capability?: keyof Capabilities;
    /**
     * If true, render only for platform superusers. Kept separate from the
     * capability map on purpose — `is_superuser` is a platform-wide flag, not a
     * per-company capability.
     */
    superuser?: boolean;
}

export interface NavGroup {
    labelKey: string;
    items: NavItem[];
    /**
     * When true, the group renders collapsed on first load. A stored per-group
     * preference (see {@link SidebarContentProps.expandedGroups}) or the group
     * owning the active route overrides this. Absent = expanded by default.
     */
    collapsedByDefault?: boolean;
}

export const SETTINGS_GROUP_KEY = "settings";

// ---------- Identity type ----------
export interface UserIdentity {
    name: string;
    email: string;
    avatar: string;
    company?: { name: string };
}

// ---------- Breadcrumb types ----------
export interface BreadcrumbSegment {
    /** Titleized fallback label, used when no i18n key matches or a fetch fails */
    label: string;
    /** Namespace-qualified i18n key (resolved with `t()`); absent for resource IDs */
    labelKey?: string;
    path: string;
    /** If set, this segment is a resource ID that needs fetching */
    resourceInfo?: { resource: string; id: string; nameField: string };
}

// ---------- Sidebar content props ----------
export interface SidebarContentProps {
    collapsed: boolean;
    identity: UserIdentity | undefined;
    navGroups: NavGroup[];
    isActive: (route: string) => boolean;
    selectedKey: string;
    onLogout: () => void;
    onToggleCollapsed: () => void;
    showCollapseToggle: boolean;
    onOpenCommandPalette: () => void;
    /**
     * Per-group expanded state keyed by `labelKey`. A missing entry falls back
     * to the group's {@link NavGroup.collapsedByDefault}; the group owning the
     * active route is always shown expanded.
     */
    expandedGroups: Record<string, boolean>;
    /** Toggle a nav group's expanded/collapsed state (persisted). */
    onToggleGroup: (labelKey: string) => void;
}
