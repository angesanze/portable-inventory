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
    Layers,
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
    Palette,
    type LucideIcon,
} from "lucide-react";
import type { Capabilities } from "../../hooks/useCapabilities";
import { type NavGroup, SETTINGS_GROUP_KEY } from "./types";

// ---------- Icon registry ----------
export const iconMap: Record<string, LucideIcon> = {
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
    appearance: Palette,
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
// Ordered by a gradual ramp of need/complexity so a new user is guided naturally:
// glance → set things up → run the warehouse → buy/sell → analyse → integrate →
// configure → (developer/superadmin) manage the platform. Every item is
// preserved; only grouping/order changed.
export const NAV_GROUPS: NavGroup[] = [
    {
        labelKey: "overview",
        items: [{ name: "dashboard", labelKey: "dashboard", route: "/" }],
    },
    {
        // First things you configure: what you track and where.
        labelKey: "setup",
        items: [
            { name: "product-models", labelKey: "catalog", route: "/products" },
            { name: "calculator-templates", labelKey: "trackingPresets", route: "/settings/calculators" },
            { name: "locations", labelKey: "locations", route: "/locations" },
            { name: "suppliers", labelKey: "suppliers", route: "/suppliers" },
            { name: "customers", labelKey: "customers", route: "/customers" },
        ],
    },
    {
        // Day-to-day stock handling.
        labelKey: "inventory",
        items: [
            { name: "physical-products", labelKey: "stock", route: "/stock" },
            { name: "movements", labelKey: "movements", route: "/movements" },
            { name: "restock", labelKey: "restock", route: "/restock" },
            { name: "count-sessions", labelKey: "stocktake", route: "/stocktake" },
            { name: "reservations", labelKey: "reservations", route: "/reservations" },
        ],
    },
    {
        // Goods flowing in and out.
        labelKey: "commerce",
        items: [
            { name: "purchase-orders", labelKey: "purchasing", route: "/purchasing" },
            { name: "sales-orders", labelKey: "sales", route: "/sales" },
            { name: "transfer-orders", labelKey: "transfers", route: "/transfers" },
            { name: "return-orders", labelKey: "returns", route: "/returns" },
            { name: "work-orders", labelKey: "workOrders", route: "/work-orders" },
        ],
    },
    {
        labelKey: "reports",
        collapsedByDefault: true,
        items: [
            { name: "report-valuation", labelKey: "valuation", route: "/reports/valuation", capability: "manage_own_inventory" },
            { name: "report-cogs", labelKey: "cogs", route: "/reports/cogs", capability: "manage_own_inventory" },
        ],
    },
    {
        // Connect the outside world: embeddable widgets, QR, bulk data.
        labelKey: "integrations",
        collapsedByDefault: true,
        items: [
            { name: "widget-generator", labelKey: "widgets", route: "/widget-generator", capability: "view_widget_generator" },
            { name: "widget-preview", labelKey: "widgetPreview", route: "/widget-preview", capability: "view_widget_preview" },
            { name: "qr-codes", labelKey: "qrCodes", route: "/qr-codes" },
            { name: "product-import", labelKey: "import", route: "/settings/import" },
            { name: "data-export", labelKey: "dataExport", route: "/settings/export" },
        ],
    },
    {
        // Account administration.
        labelKey: SETTINGS_GROUP_KEY,
        collapsedByDefault: true,
        items: [
            { name: "api-keys", labelKey: "apiKeys", route: "/settings/api-keys", capability: "manage_api_keys" },
            { name: "notification-channels", labelKey: "notifications", route: "/settings/notifications" },
            { name: "appearance", labelKey: "appearance", route: "/settings/appearance" },
            { name: "company-users", labelKey: "users", route: "/settings/users", capability: "manage_users" },
        ],
    },
    {
        // Developer: manage owned tenants.
        labelKey: "workspace",
        items: [
            { name: "tenants", labelKey: "tenants", route: "/tenants", capability: "manage_tenants" },
        ],
    },
    {
        // Superadmin: platform-wide console.
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
export function visibleNavGroups(capabilities: Capabilities, isSuperuser: boolean): NavGroup[] {
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
