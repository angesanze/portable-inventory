import { SidebarContent } from "./SidebarContent";
import type { SharedSidebarProps } from "./useLayoutNav";

interface MobileNavProps extends SharedSidebarProps {
    onClose: () => void;
}

/**
 * Mobile drawer overlay. Rendered only when the drawer is open on a mobile
 * viewport; the backdrop closes it, while clicks inside the panel are stopped.
 */
export function MobileNav({ onClose, ...sidebarProps }: MobileNavProps) {
    return (
        <div
            className="fixed inset-0 z-40 backdrop-blur-sm bg-black/50"
            onClick={onClose}
            data-testid="drawer-backdrop"
        >
            <aside
                role="navigation"
                aria-label="Main navigation"
                className="w-60 h-full bg-zinc-950 border-r border-white/[0.06] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <SidebarContent
                    {...sidebarProps}
                    collapsed={false}
                    onToggleCollapsed={onClose}
                    showCollapseToggle={false}
                />
            </aside>
        </div>
    );
}
