import { SidebarContent } from "./SidebarContent";
import type { SharedSidebarProps } from "./useLayoutNav";

interface DesktopSidebarProps extends SharedSidebarProps {
    collapsed: boolean;
    onToggleCollapsed: () => void;
}

/** Inline desktop sidebar (hidden on mobile, where the drawer is used instead). */
export function DesktopSidebar({ collapsed, onToggleCollapsed, ...sidebarProps }: DesktopSidebarProps) {
    return (
        <aside
            role="navigation"
            aria-label="Main navigation"
            className={`
                ${collapsed ? "w-14" : "w-60"}
                flex-shrink-0 bg-zinc-950 border-r border-white/[0.06]
                flex flex-col transition-all duration-300 z-20
            `}
        >
            <SidebarContent
                {...sidebarProps}
                collapsed={collapsed}
                onToggleCollapsed={onToggleCollapsed}
                showCollapseToggle
            />
        </aside>
    );
}
