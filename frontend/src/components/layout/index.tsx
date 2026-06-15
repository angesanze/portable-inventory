import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMenu, useLogout, useGetIdentity, useOne } from "@refinedev/core";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
    LayoutGrid,
    MapPin,
    Box,
    Archive,
    ClipboardList,
    ClipboardCheck,
    ArrowLeftRight,
    Bell,
    QrCode,
    Bookmark,
    Calculator,
    KeyRound,
    LogOut,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Globe,
    Menu,
    X,
    Layers,
    Search,
    Truck,
    ShieldCheck,
    Eye,
    Building2,
    Kanban,
    ShoppingCart,
    Users,
    PackageOpen,
    Wallet,
    Receipt,
    Undo2,
    Upload,
    DownloadCloud,
    type LucideIcon,
} from "lucide-react";
import { CommandPalette } from "../ui/CommandPalette";
import { ActingTenantBanner } from "./ActingTenantBanner";
import { LicenseBanner } from "./LicenseBanner";
import { useCapabilities, type Capabilities } from "../../hooks/useCapabilities";
import { BRAND_NAME } from "../../config";

// ---------- Icon registry ----------
const iconMap: Record<string, LucideIcon> = {
    dashboard: LayoutGrid,
    locations: MapPin,
    suppliers: Truck,
    customers: Users,
    "product-models": Box,
    "physical-products": Archive,
    "work-orders": ClipboardList,
    movements: ArrowLeftRight,
    reservations: Bookmark,
    "count-sessions": ClipboardCheck,
    "qr-codes": QrCode,
    restock: Kanban,
    "report-valuation": Wallet,
    "report-cogs": Receipt,
    "purchase-orders": ShoppingCart,
    "sales-orders": PackageOpen,
    "transfer-orders": Truck,
    "return-orders": Undo2,
    "notification-channels": Bell,
    "product-import": Upload,
    "data-export": DownloadCloud,
    "calculator-templates": Calculator,
    "api-keys": KeyRound,
    "widget-generator": Layers,
    "widget-preview": Eye,
    console: ShieldCheck,
    tenants: Building2,
    "company-users": Users,
};

// ---------- Navigation structure ----------
/**
 * Static nav structure holding i18n keys (resolved with `t()` at render time)
 * rather than literal strings. `labelKey` maps into the `nav` namespace.
 */
interface NavItem {
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

interface NavGroup {
    labelKey: string;
    items: NavItem[];
}

const SETTINGS_GROUP_KEY = "settings";

const NAV_GROUPS: NavGroup[] = [
    {
        labelKey: "overview",
        items: [{ name: "dashboard", labelKey: "dashboard", route: "/" }],
    },
    {
        labelKey: "workspace",
        items: [
            { name: "tenants", labelKey: "tenants", route: "/tenants", capability: "manage_tenants" },
        ],
    },
    {
        labelKey: "inventory",
        items: [
            { name: "product-models", labelKey: "catalog", route: "/products" },
            { name: "physical-products", labelKey: "stock", route: "/stock" },
            { name: "locations", labelKey: "locations", route: "/locations" },
            { name: "suppliers", labelKey: "suppliers", route: "/suppliers" },
            { name: "customers", labelKey: "customers", route: "/customers" },
            { name: "movements", labelKey: "movements", route: "/movements" },
            { name: "reservations", labelKey: "reservations", route: "/reservations" },
            { name: "count-sessions", labelKey: "stocktake", route: "/stocktake" },
            { name: "transfer-orders", labelKey: "transfers", route: "/transfers" },
            { name: "return-orders", labelKey: "returns", route: "/returns" },
        ],
    },
    {
        labelKey: "operations",
        items: [
            { name: "work-orders", labelKey: "workOrders", route: "/work-orders" },
            { name: "purchase-orders", labelKey: "purchasing", route: "/purchasing" },
            { name: "sales-orders", labelKey: "sales", route: "/sales" },
            { name: "restock", labelKey: "restock", route: "/restock" },
        ],
    },
    {
        labelKey: "reports",
        items: [
            { name: "report-valuation", labelKey: "valuation", route: "/reports/valuation", capability: "manage_own_inventory" },
            { name: "report-cogs", labelKey: "cogs", route: "/reports/cogs", capability: "manage_own_inventory" },
        ],
    },
    {
        labelKey: SETTINGS_GROUP_KEY,
        items: [
            { name: "widget-generator", labelKey: "widgets", route: "/widget-generator", capability: "view_widget_generator" },
            { name: "widget-preview", labelKey: "widgetPreview", route: "/widget-preview", capability: "view_widget_preview" },
            { name: "notification-channels", labelKey: "notifications", route: "/settings/notifications" },
            { name: "product-import", labelKey: "import", route: "/settings/import" },
            { name: "data-export", labelKey: "dataExport", route: "/settings/export" },
            { name: "calculator-templates", labelKey: "trackingPresets", route: "/settings/calculators" },
            { name: "api-keys", labelKey: "apiKeys", route: "/settings/api-keys", capability: "manage_api_keys" },
            { name: "company-users", labelKey: "users", route: "/settings/users", capability: "manage_users" },
            { name: "qr-codes", labelKey: "qrCodes", route: "/qr-codes" },
        ],
    },
    {
        labelKey: "platform",
        items: [
            { name: "console", labelKey: "console", route: "/console", superuser: true },
        ],
    },
];

/**
 * Drops nav items whose required capability is not granted (or whose
 * `superuser` flag is unmet), then drops any group left empty. Mirrors the
 * resource gating in `App.tsx` so managers never see API Keys / Widget
 * Generator, and only platform superusers see the Console entry.
 */
function visibleNavGroups(capabilities: Capabilities, isSuperuser: boolean): NavGroup[] {
    return NAV_GROUPS
        .map((group) => ({
            ...group,
            items: group.items.filter(
                (item) =>
                    (!item.capability || capabilities[item.capability]) &&
                    (!item.superuser || isSuperuser),
            ),
        }))
        .filter((group) => group.items.length > 0);
}

// ---------- Breadcrumb helpers ----------
/**
 * Maps URL segments to namespace-qualified i18n keys (resolved with `t()` at
 * render time). Nav-related segments use the `nav` namespace; action segments
 * (create/edit) use `common`. Segments without a key fall back to a titleized
 * version of the raw segment.
 */
const BREADCRUMB_KEYS: Record<string, string> = {
    "": "nav:dashboard",
    locations: "nav:locations",
    suppliers: "nav:suppliers",
    customers: "nav:customers",
    products: "nav:catalog",
    "products-poly": "nav:products",
    stock: "nav:stock",
    movements: "nav:movements",
    reservations: "nav:reservations",
    stocktake: "nav:stocktake",
    "work-orders": "nav:workOrders",
    purchasing: "nav:purchasing",
    sales: "nav:sales",
    transfers: "nav:transfers",
    returns: "nav:returns",
    restock: "nav:restock",
    reports: "nav:reports",
    valuation: "nav:valuation",
    cogs: "nav:cogs",
    "qr-codes": "nav:qrCodes",
    settings: "nav:settings",
    "api-keys": "nav:apiKeys",
    notifications: "nav:notifications",
    import: "nav:import",
    export: "nav:dataExport",
    calculators: "nav:trackingPresets",
    "widget-generator": "nav:widgets",
    "widget-preview": "nav:widgetPreview",
    tenants: "nav:tenants",
    create: "common:create",
    edit: "common:edit",
};

/** Maps route segments to Refine resource names for fetching friendly labels */
const ROUTE_TO_RESOURCE: Record<string, { resource: string; nameField: string }> = {
    products: { resource: "product-models", nameField: "name" },
    "products-poly": { resource: "physical-products", nameField: "name" },
    locations: { resource: "locations", nameField: "name" },
    "work-orders": { resource: "work-orders", nameField: "name" },
    stock: { resource: "physical-products", nameField: "name" },
    movements: { resource: "movements", nameField: "reference" },
};

const IS_UUID = /^[0-9a-f-]{8,}$/i;

interface BreadcrumbSegment {
    /** Titleized fallback label, used when no i18n key matches or a fetch fails */
    label: string;
    /** Namespace-qualified i18n key (resolved with `t()`); absent for resource IDs */
    labelKey?: string;
    path: string;
    /** If set, this segment is a resource ID that needs fetching */
    resourceInfo?: { resource: string; id: string; nameField: string };
}

function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
    if (pathname === "/") return [{ label: "Dashboard", labelKey: "nav:dashboard", path: "/" }];
    const segments = pathname.replace(/^\//, "").split("/");
    const crumbs: BreadcrumbSegment[] = [];
    let accumulated = "";
    let lastRouteSegment = "";
    for (const seg of segments) {
        accumulated += `/${seg}`;
        if (IS_UUID.test(seg)) {
            const info = ROUTE_TO_RESOURCE[lastRouteSegment];
            crumbs.push({
                label: seg, // fallback if fetch fails
                path: accumulated,
                resourceInfo: info ? { resource: info.resource, id: seg, nameField: info.nameField } : undefined,
            });
        } else {
            lastRouteSegment = seg;
            const label = seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            crumbs.push({ label, labelKey: BREADCRUMB_KEYS[seg], path: accumulated });
        }
    }
    return crumbs;
}

/** Renders a single breadcrumb segment, fetching resource name if needed */
function BreadcrumbSegmentLabel({ crumb, isLast }: { crumb: BreadcrumbSegment; isLast: boolean }) {
    const { t } = useTranslation();
    const { data, isLoading } = useOne(
        crumb.resourceInfo
            ? {
                  resource: crumb.resourceInfo.resource,
                  id: crumb.resourceInfo.id,
                  queryOptions: { enabled: true },
              }
            : {
                  resource: "",
                  id: "",
                  queryOptions: { enabled: false },
              },
    );

    const label = crumb.resourceInfo
        ? isLoading
            ? null
            : (data?.data as Record<string, unknown>)?.[crumb.resourceInfo.nameField] as string ?? crumb.label
        : crumb.labelKey
            ? t(crumb.labelKey)
            : crumb.label;

    if (crumb.resourceInfo && isLoading) {
        return <span className="inline-block w-20 h-4 bg-zinc-700 rounded animate-pulse" />;
    }

    if (isLast) {
        return <span className="text-zinc-400">{label}</span>;
    }

    return (
        <Link to={crumb.path} className="hover:text-zinc-300 transition-colors">
            {label}
        </Link>
    );
}

/** Full breadcrumb bar with ChevronRight separators */
function BreadcrumbBar({ pathname }: { pathname: string }) {
    if (pathname === "/") return null;
    const crumbs = buildBreadcrumbs(pathname);
    return (
        <nav className="flex items-center gap-1.5 text-sm text-zinc-500" data-testid="breadcrumb-nav">
            {crumbs.map((crumb, i, arr) => (
                <span key={crumb.path} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="w-3 h-3 text-zinc-600" strokeWidth={2} />}
                    <BreadcrumbSegmentLabel crumb={crumb} isLast={i === arr.length - 1} />
                </span>
            ))}
        </nav>
    );
}

// ---------- Storage helpers ----------
const SIDEBAR_KEY = "sidebar_collapsed";
const SETTINGS_NAV_KEY = "nav_settings_expanded";

function getStoredCollapsed(): boolean {
    try {
        return localStorage.getItem(SIDEBAR_KEY) === "true";
    } catch {
        return false;
    }
}

function getStoredSettingsExpanded(): boolean {
    try {
        return localStorage.getItem(SETTINGS_NAV_KEY) === "true";
    } catch {
        return false;
    }
}

// ---------- Identity type ----------
interface UserIdentity {
    name: string;
    email: string;
    avatar: string;
    company?: { name: string };
}

// ---------- Responsive hook ----------
function useIsMobile(breakpoint = 1024): boolean {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
    );
    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        setIsMobile(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [breakpoint]);
    return isMobile;
}

// ---------- Language selector ----------
/** Toggles between English and Italian. Persists via LanguageDetector → localStorage. */
function LanguageSelector({ collapsed }: { collapsed: boolean }) {
    const { t, i18n } = useTranslation();
    const isItalian = (i18n.language ?? "en").startsWith("it");
    const currentLabel = isItalian ? t("common:italian") : t("common:english");

    const toggle = () => {
        i18n.changeLanguage(isItalian ? "en" : "it");
    };

    if (collapsed) {
        return (
            <button
                onClick={toggle}
                className="flex items-center justify-center w-full py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                title={`${t("common:language")}: ${currentLabel}`}
                aria-label={`${t("common:language")}: ${currentLabel}`}
                data-testid="language-selector-collapsed"
            >
                <Globe className="w-4 h-4" strokeWidth={2} />
            </button>
        );
    }

    return (
        <button
            onClick={toggle}
            className="flex items-center gap-3 w-full px-2 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
            title={t("common:language")}
            aria-label={`${t("common:language")}: ${currentLabel}`}
            data-testid="language-selector"
        >
            <Globe className="w-4 h-4 flex-shrink-0 text-zinc-500" strokeWidth={2} />
            <span className="flex-1 text-left whitespace-nowrap">{currentLabel}</span>
            <ChevronDown className="w-3 h-3 text-zinc-600 flex-shrink-0" strokeWidth={2} />
        </button>
    );
}

// ---------- Sidebar content ----------
interface SidebarContentProps {
    collapsed: boolean;
    identity: UserIdentity | undefined;
    navGroups: NavGroup[];
    isActive: (route: string) => boolean;
    selectedKey: string;
    onLogout: () => void;
    onToggleCollapsed: () => void;
    showCollapseToggle: boolean;
    onOpenCommandPalette: () => void;
    settingsExpanded: boolean;
    onToggleSettingsExpanded: () => void;
}

function SidebarContent({
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
                                        <Link
                                            key={item.name}
                                            to={item.route}
                                            title={collapsed ? itemLabel : undefined}
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
                                                <span className="whitespace-nowrap">{itemLabel}</span>
                                            )}
                                            {collapsed && active && (
                                                <div className="w-1 h-1 rounded-full bg-indigo-500" />
                                            )}
                                        </Link>
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

// ---------- Layout Component ----------
export const Layout = ({ children }: { children?: React.ReactNode }) => {
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
            setSettingsExpanded(true);
            try { localStorage.setItem(SETTINGS_NAV_KEY, "true"); } catch { /* noop */ }
        }
    }, [isSettingsRouteActive, settingsExpanded]);

    const sidebarProps = {
        identity: identity ?? undefined,
        navGroups,
        isActive,
        selectedKey,
        onLogout: () => logout(),
        onOpenCommandPalette: () => setCommandPaletteOpen(true),
        settingsExpanded,
        onToggleSettingsExpanded: toggleSettingsExpanded,
    };

    return (
        <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
            <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
            {/* ---- Desktop Sidebar (inline) ---- */}
            {!isMobile && (
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
                        onToggleCollapsed={toggleCollapsed}
                        showCollapseToggle
                    />
                </aside>
            )}

            {/* ---- Mobile Drawer Overlay ---- */}
            {isMobile && drawerOpen && (
                <div
                    className="fixed inset-0 z-40 backdrop-blur-sm bg-black/50"
                    onClick={() => setDrawerOpen(false)}
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
                            onToggleCollapsed={() => setDrawerOpen(false)}
                            showCollapseToggle={false}
                        />
                    </aside>
                </div>
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
                    <BreadcrumbBar pathname={location.pathname} />
                </div>
                {/* Content wrapper: responsive padding + conditional max-width */}
                <div className={`p-3 sm:p-4 md:p-6 ${location.pathname === "/" ? "w-full" : "max-w-7xl mx-auto"}`}>
                    <div className="overflow-x-auto">
                        {children || <Outlet />}
                    </div>
                </div>
            </main>
        </div>
    );
};
