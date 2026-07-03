import { useState, useEffect, useCallback, useMemo } from "react";
import { useMenu, useLogout, useGetIdentity } from "@refinedev/core";
import { useLocation } from "react-router-dom";
import { useCapabilities } from "../../hooks/useCapabilities";
import { type NavGroup, type UserIdentity } from "./types";
import { visibleNavGroups } from "./navConfig";
import {
    SIDEBAR_KEY,
    NAV_GROUPS_KEY,
    getStoredCollapsed,
    getStoredExpandedGroups,
} from "./storage";
import { useIsMobile } from "./useIsMobile";

/** Props consumed by `SidebarContent` that don't vary between desktop/drawer. */
export interface SharedSidebarProps {
    identity: UserIdentity | undefined;
    navGroups: NavGroup[];
    isActive: (route: string) => boolean;
    selectedKey: string;
    onLogout: () => void;
    onOpenCommandPalette: () => void;
    expandedGroups: Record<string, boolean>;
    onToggleGroup: (labelKey: string) => void;
}

export interface LayoutNav {
    pathname: string;
    isMobile: boolean;
    collapsed: boolean;
    drawerOpen: boolean;
    setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
    commandPaletteOpen: boolean;
    setCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
    toggleCollapsed: () => void;
    sidebarProps: SharedSidebarProps;
}

/**
 * Owns the app-shell navigation state: capability-gated menu, sidebar
 * collapse/drawer/command-palette toggles, keyboard shortcuts, and per-group
 * expand/collapse state. Returns the derived props consumed by the desktop
 * sidebar and the mobile drawer so {@link Layout} stays a thin shell.
 */
export function useLayoutNav(): LayoutNav {
    const { selectedKey } = useMenu();
    const { mutate: logout } = useLogout();
    const { data: identity } = useGetIdentity<UserIdentity>();
    const { capabilities, is_superuser } = useCapabilities();
    const location = useLocation();

    // Capability-gated menu: managers never see API Keys / Widget Generator,
    // and only platform superusers see the Console. Recomputed when identity
    // resolves.
    const navGroups = useMemo(
        () => visibleNavGroups(capabilities, is_superuser),
        [capabilities, is_superuser],
    );

    const isMobile = useIsMobile();
    const [collapsed, setCollapsed] = useState(getStoredCollapsed);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(getStoredExpandedGroups);

    // Close drawer on route change
    useEffect(() => {
        // Sync the drawer to the router: navigating to a new path always
        // dismisses the mobile drawer. Driven by external nav state, not props.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDrawerOpen(false);
    }, [location.pathname]);

    const toggleCollapsed = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* noop */ }
            return next;
        });
    }, []);

    const toggleGroup = useCallback((labelKey: string) => {
        setExpandedGroups((prev) => {
            // Flip the group's *effective* state: an explicit stored value wins,
            // otherwise fall back to !collapsedByDefault so the first click on an
            // untouched group does the visually-obvious thing.
            const group = navGroups.find((g) => g.labelKey === labelKey);
            const currentlyExpanded = prev[labelKey] ?? !(group?.collapsedByDefault ?? false);
            const next = { ...prev, [labelKey]: !currentlyExpanded };
            try { localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next)); } catch { /* noop */ }
            return next;
        });
    }, [navGroups]);

    // Keyboard shortcuts: Cmd/Ctrl + \ (toggle sidebar), Cmd/Ctrl + K (command palette placeholder)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            if (e.key === "\\") {
                e.preventDefault();
                if (isMobile) {
                    setDrawerOpen((prev) => !prev);
                } else {
                    toggleCollapsed();
                }
            } else if (e.key === "k") {
                e.preventDefault();
                setCommandPaletteOpen(true);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [toggleCollapsed, isMobile]);

    const isActive = (route: string) => {
        if (route === "/") return location.pathname === "/";
        return location.pathname.startsWith(route);
    };

    // The group owning the active route is force-expanded in SidebarContent
    // (see `groupHasActive`), so no per-group auto-expand effect is needed here.
    const sidebarProps: SharedSidebarProps = {
        identity: identity ?? undefined,
        navGroups,
        isActive,
        selectedKey,
        onLogout: () => logout(),
        onOpenCommandPalette: () => setCommandPaletteOpen(true),
        expandedGroups,
        onToggleGroup: toggleGroup,
    };

    return {
        pathname: location.pathname,
        isMobile,
        collapsed,
        drawerOpen,
        setDrawerOpen,
        commandPaletteOpen,
        setCommandPaletteOpen,
        toggleCollapsed,
        sidebarProps,
    };
}
