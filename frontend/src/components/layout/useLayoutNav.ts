import { useState, useEffect, useCallback, useMemo } from "react";
import { useMenu, useLogout, useGetIdentity } from "@refinedev/core";
import { useLocation } from "react-router-dom";
import { useCapabilities } from "../../hooks/useCapabilities";
import { type NavGroup, type UserIdentity, SETTINGS_GROUP_KEY } from "./types";
import { visibleNavGroups } from "./navConfig";
import {
    SIDEBAR_KEY,
    SETTINGS_NAV_KEY,
    getStoredCollapsed,
    getStoredSettingsExpanded,
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
    settingsExpanded: boolean;
    onToggleSettingsExpanded: () => void;
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
 * collapse/drawer/command-palette toggles, keyboard shortcuts, and the
 * Settings auto-expand effect. Returns the derived props consumed by the
 * desktop sidebar and the mobile drawer so {@link Layout} stays a thin shell.
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
    const [settingsExpanded, setSettingsExpanded] = useState(getStoredSettingsExpanded);

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

    const toggleSettingsExpanded = useCallback(() => {
        setSettingsExpanded((prev) => {
            const next = !prev;
            try { localStorage.setItem(SETTINGS_NAV_KEY, String(next)); } catch { /* noop */ }
            return next;
        });
    }, []);

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

    // Auto-expand Settings group when a settings route is active
    const isSettingsRouteActive = navGroups
        .find((g) => g.labelKey === SETTINGS_GROUP_KEY)
        ?.items.some((item) => isActive(item.route)) ?? false;

    useEffect(() => {
        if (isSettingsRouteActive && !settingsExpanded) {
            // Auto-expand the Settings group when the router lands on one of its
            // routes; reacts to external nav state and persists the choice.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSettingsExpanded(true);
            try { localStorage.setItem(SETTINGS_NAV_KEY, "true"); } catch { /* noop */ }
        }
    }, [isSettingsRouteActive, settingsExpanded]);

    const sidebarProps: SharedSidebarProps = {
        identity: identity ?? undefined,
        navGroups,
        isActive,
        selectedKey,
        onLogout: () => logout(),
        onOpenCommandPalette: () => setCommandPaletteOpen(true),
        settingsExpanded,
        onToggleSettingsExpanded: toggleSettingsExpanded,
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
