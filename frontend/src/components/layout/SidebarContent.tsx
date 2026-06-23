import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
    LayoutGrid,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Search,
    LogOut,
    type LucideIcon,
} from "lucide-react";
import { BRAND_NAME } from "../../config";
import { type NavItem, type SidebarContentProps, SETTINGS_GROUP_KEY } from "./types";
import { iconMap } from "./navConfig";
import { LanguageSelector } from "./LanguageSelector";

/** Single sidebar nav entry (one row in a nav group). */
function SidebarNavItem({
    item,
    active,
    collapsed,
    label,
    Icon,
}: {
    item: NavItem;
    active: boolean;
    collapsed: boolean;
    label: string;
    Icon: LucideIcon;
}) {
    return (
        <Link
            to={item.route}
            title={collapsed ? label : undefined}
            className={`
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                transition-colors duration-150 relative
                ${active
                    ? "text-zinc-100 font-medium bg-indigo-500/10"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                }
                ${collapsed ? "justify-center px-0 flex-col gap-1" : ""}
            `}
        >
            {active && !collapsed && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-indigo-500 rounded-r" />
            )}
            <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
            {!collapsed && (
                <span className="whitespace-nowrap">{label}</span>
            )}
            {collapsed && active && (
                <div className="w-1 h-1 rounded-full bg-indigo-500" />
            )}
        </Link>
    );
}

// ---------- Sidebar content ----------
export function SidebarContent({
    collapsed,
    identity,
    navGroups,
    isActive,
    selectedKey,
    onLogout,
    onToggleCollapsed,
    showCollapseToggle,
    onOpenCommandPalette,
    settingsExpanded,
    onToggleSettingsExpanded,
}: SidebarContentProps) {
    const { t } = useTranslation("nav");
    return (
        <>
            {/* Logo / Brand */}
            <div className={`flex items-center gap-3 px-3 py-5 ${collapsed ? "justify-center" : ""}`}>
                <img
                    src="/shed-logo.png"
                    alt={BRAND_NAME}
                    className="w-8 h-8 flex-shrink-0 flex-none rounded-lg object-contain"
                />
                {!collapsed && (
                    <div className="flex flex-col leading-none">
                        <span className="text-sm font-bold text-zinc-100 tracking-wide whitespace-nowrap">
                            {BRAND_NAME}
                        </span>
                        {identity?.company?.name && (
                            <span className="text-[10px] text-zinc-500 whitespace-nowrap mt-0.5">
                                {identity.company.name}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Search / Command Palette trigger */}
            {!collapsed ? (
                <div className="px-2 mb-2">
                    <button
                        onClick={onOpenCommandPalette}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                        data-testid="sidebar-search-button"
                    >
                        <Search className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                        <span className="flex-1 text-left">{t("commandPalette")}</span>
                        <kbd className="text-[11px] font-medium text-zinc-600 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded">
                            ⌘K
                        </kbd>
                    </button>
                </div>
            ) : (
                <div className="px-2 mb-2 flex justify-center">
                    <button
                        onClick={onOpenCommandPalette}
                        className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                        title={`${t("search")} (⌘K)`}
                        data-testid="sidebar-search-button-collapsed"
                    >
                        <Search className="w-4 h-4" strokeWidth={2} />
                    </button>
                </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: "none" }}>
                {navGroups.map((group) => {
                    const isSettingsGroup = group.labelKey === SETTINGS_GROUP_KEY;
                    const isGroupExpanded = !isSettingsGroup || settingsExpanded;
                    const groupHasActive = group.items.some(
                        (item) => isActive(item.route) || selectedKey === item.name,
                    );
                    const groupLabel = t(group.labelKey);

                    return (
                        <div key={group.labelKey} className="mb-4">
                            {!collapsed && (
                                isSettingsGroup ? (
                                    <button
                                        onClick={onToggleSettingsExpanded}
                                        className={`flex items-center justify-between w-full text-[11px] font-medium uppercase tracking-wider px-3 mb-1 hover:text-zinc-400 transition-colors ${
                                            groupHasActive ? "text-zinc-300" : "text-zinc-500"
                                        }`}
                                        data-testid="settings-group-toggle"
                                    >
                                        <span className="flex items-center gap-1.5">
                                            {groupLabel}
                                            {!isGroupExpanded && (
                                                <span className="text-[10px] normal-case tracking-normal text-zinc-600">
                                                    ({group.items.length})
                                                </span>
                                            )}
                                        </span>
                                        <ChevronDown
                                            className={`w-3 h-3 transition-transform duration-200 ${isGroupExpanded ? "" : "-rotate-90"}`}
                                            strokeWidth={2}
                                        />
                                    </button>
                                ) : (
                                    <div className={`text-[11px] font-medium uppercase tracking-wider px-3 mb-1 transition-colors duration-150 ${
                                        groupHasActive ? "text-zinc-300" : "text-zinc-500"
                                    }`}>
                                        {groupLabel}
                                    </div>
                                )
                            )}
                            {collapsed && <div className="h-px bg-white/[0.06] mx-1 mb-2 mt-1" />}
                            <div
                                className={`flex flex-col gap-0.5 overflow-hidden transition-all duration-200 ${
                                    !isGroupExpanded && !collapsed ? "max-h-0" : "max-h-96"
                                }`}
                            >
                                {group.items.map((item) => {
                                    const active = isActive(item.route) || selectedKey === item.name;
                                    const Icon = iconMap[item.name] ?? LayoutGrid;
                                    const itemLabel = t(item.labelKey);
                                    return (
                                        <SidebarNavItem
                                            key={item.name}
                                            item={item}
                                            active={active}
                                            collapsed={collapsed}
                                            label={itemLabel}
                                            Icon={Icon}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            {/* Bottom section: language + user + collapse toggle */}
            <div className="mt-auto border-t border-white/[0.06] px-2 py-3 flex flex-col gap-2">
                {/* Language selector */}
                <LanguageSelector collapsed={collapsed} />

                <div className="h-px bg-white/[0.06] mx-1" />

                {/* User info */}
                {identity && (
                    <div
                        role="button"
                        aria-label={t("common:logout")}
                        className={`flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors ${collapsed ? "justify-center" : ""}`}
                        onClick={onLogout}
                        title={collapsed ? `${identity.name} — ${t("common:logout")}` : undefined}
                    >
                        <img
                            src={identity.avatar}
                            alt={identity.name}
                            className="w-7 h-7 rounded-full flex-shrink-0 bg-zinc-800"
                        />
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-zinc-200 truncate">{identity.name}</div>
                                <div className="text-[11px] text-zinc-500 truncate">{identity.email}</div>
                            </div>
                        )}
                        {!collapsed && (
                            <LogOut className="w-4 h-4 text-zinc-500 hover:text-red-400 flex-shrink-0" strokeWidth={2} />
                        )}
                    </div>
                )}

                {/* Collapse toggle (desktop only) */}
                {showCollapseToggle && (
                    <button
                        onClick={onToggleCollapsed}
                        className="flex items-center justify-center w-full py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                        title={`${collapsed ? t("expandSidebar") : t("collapseSidebar")} (⌘\\)`}
                        aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
                    >
                        {collapsed ? (
                            <ChevronRight className="w-4 h-4" strokeWidth={2} />
                        ) : (
                            <ChevronLeft className="w-4 h-4" strokeWidth={2} />
                        )}
                    </button>
                )}
            </div>
        </>
    );
}
