import type { BreadcrumbSegment } from "./types";

// ---------- Breadcrumb helpers ----------
/**
 * Maps URL segments to namespace-qualified i18n keys (resolved with `t()` at
 * render time). Nav-related segments use the `nav` namespace; action segments
 * (create/edit) use `common`. Segments without a key fall back to a titleized
 * version of the raw segment.
 */
export const BREADCRUMB_KEYS: Record<string, string> = {
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
export const ROUTE_TO_RESOURCE: Record<string, { resource: string; nameField: string }> = {
    products: { resource: "product-models", nameField: "name" },
    "products-poly": { resource: "physical-products", nameField: "name" },
    locations: { resource: "locations", nameField: "name" },
    "work-orders": { resource: "work-orders", nameField: "name" },
    stock: { resource: "physical-products", nameField: "name" },
    movements: { resource: "movements", nameField: "reference" },
};

export const IS_UUID = /^[0-9a-f-]{8,}$/i;

export function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
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
