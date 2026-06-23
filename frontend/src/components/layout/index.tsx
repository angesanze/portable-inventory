import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { CommandPalette } from "../ui/CommandPalette";
import { ActingTenantBanner } from "./ActingTenantBanner";
import { LicenseBanner } from "./LicenseBanner";
import { BreadcrumbBar } from "./Breadcrumbs";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileNav } from "./MobileNav";
import { useLayoutNav } from "./useLayoutNav";

// ---------- Layout Component ----------
export const Layout = ({ children }: { children?: React.ReactNode }) => {
    const {
        pathname,
        isMobile,
        collapsed,
        drawerOpen,
        setDrawerOpen,
        commandPaletteOpen,
        setCommandPaletteOpen,
        toggleCollapsed,
        sidebarProps,
    } = useLayoutNav();

    return (
        <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
            <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
            {/* ---- Desktop Sidebar (inline) ---- */}
            {!isMobile && (
                <DesktopSidebar
                    {...sidebarProps}
                    collapsed={collapsed}
                    onToggleCollapsed={toggleCollapsed}
                />
            )}

            {/* ---- Mobile Drawer Overlay ---- */}
            {isMobile && drawerOpen && (
                <MobileNav {...sidebarProps} onClose={() => setDrawerOpen(false)} />
            )}

            {/* ---- Main Content ---- */}
            <main className="flex-1 overflow-y-auto bg-zinc-950">
                {/* Acting-as-tenant banner (developer impersonating a child tenant) */}
                <ActingTenantBanner />
                {/* License expiry / expiring banner (GOVERNANCE-11) */}
                <LicenseBanner />
                {/* Mobile hamburger + Breadcrumb bar */}
                <div className="flex items-center gap-3 px-3 pt-3 pb-0 sm:px-4 md:px-6 sm:pt-4">
                    {isMobile && (
                        <button
                            onClick={() => setDrawerOpen(true)}
                            className="p-1.5 -ml-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
                            aria-label="Open menu"
                            data-testid="hamburger-button"
                        >
                            <Menu className="w-5 h-5" strokeWidth={2} />
                        </button>
                    )}
                    <BreadcrumbBar pathname={pathname} />
                </div>
                {/* Content wrapper: responsive padding + conditional max-width */}
                <div className={`p-3 sm:p-4 md:p-6 ${pathname === "/" ? "w-full" : "max-w-7xl mx-auto"}`}>
                    <div className="overflow-x-auto">
                        {children || <Outlet />}
                    </div>
                </div>
            </main>
        </div>
    );
};
