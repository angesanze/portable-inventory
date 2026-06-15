import type { Refine } from "@refinedev/core";

import type { Capabilities } from "./hooks/useCapabilities";

export type ResourceProps = NonNullable<React.ComponentProps<typeof Refine>["resources"]>;

/**
 * Build the Refine `resources` array, gating developer-only surfaces by
 * capability. Managers (and the fail-closed loading state) never get the
 * `api-keys` / `widget-generator` / `tenants` resources, so Refine's routing
 * helpers and `useMenu` consumers can't surface them. UI hiding is convenience
 * only — the backend gates from DUAL-TIER-04/05 are the real enforcement.
 *
 * `isSuperuser` is threaded separately from the capability map on purpose — it
 * is a platform-wide flag, not a per-company capability — and gates the
 * superadmin `console` resource (SUPERADMIN-06).
 */
export function buildResources(capabilities: Capabilities, isSuperuser = false): ResourceProps {
  return [
    // -- Dashboard --
    {
      name: "dashboard",
      list: "/",
      meta: { label: "Dashboard" },
    },
    // -- Products --
    {
      name: "product-models",
      list: "/products",
      create: "/products/create",
      edit: "/products/edit/:id",
      show: "/products/:id",
      meta: { label: "Catalog" },
    },
    {
      name: "products-poly",
      list: "/products-poly",
      create: "/products-poly/create",
      edit: "/products-poly/edit/:id",
      show: "/products-poly/:id",
      meta: { label: "Inventory / Items", hide: true },
    },
    // -- Inventory --
    {
      name: "locations",
      list: "/locations",
      create: "/locations/create",
      edit: "/locations/edit/:id",
      show: "/locations/:id",
      meta: { label: "Locations" },
    },
    {
      name: "physical-products",
      list: "/stock",
      create: "/stock/create",
      edit: "/stock/edit/:id",
      show: "/stock/:id",
      meta: { label: "Inventory" },
    },
    {
      name: "suppliers",
      list: "/suppliers",
      create: "/suppliers/create",
      edit: "/suppliers/edit/:id",
      meta: { label: "Suppliers" },
    },
    {
      name: "customers",
      list: "/customers",
      create: "/customers/create",
      edit: "/customers/edit/:id",
      meta: { label: "Customers" },
    },
    {
      name: "movements",
      list: "/movements",
      create: "/movements/create",
      meta: { label: "Movements" },
    },
    {
      name: "reservations",
      list: "/reservations",
      meta: { label: "Reservations" },
    },
    {
      name: "work-orders",
      list: "/work-orders",
      create: "/work-orders/create",
      edit: "/work-orders/edit/:id",
      show: "/work-orders/:id",
      meta: { label: "Work Orders" },
    },
    {
      name: "purchase-orders",
      list: "/purchasing",
      create: "/purchasing/create",
      edit: "/purchasing/edit/:id",
      meta: { label: "Purchasing" },
    },
    {
      name: "sales-orders",
      list: "/sales",
      create: "/sales/create",
      edit: "/sales/edit/:id",
      show: "/sales/:id",
      meta: { label: "Sales" },
    },
    {
      name: "transfer-orders",
      list: "/transfers",
      create: "/transfers/create",
      edit: "/transfers/edit/:id",
      meta: { label: "Transfers" },
    },
    {
      name: "return-orders",
      list: "/returns",
      create: "/returns/create",
      edit: "/returns/edit/:id",
      meta: { label: "Returns" },
    },
    {
      name: "count-sessions",
      list: "/stocktake",
      create: "/stocktake/create",
      show: "/stocktake/:id",
      meta: { label: "Physical Stocktake" },
    },
    {
      name: "restock",
      list: "/restock",
      meta: { label: "Restock Board", icon: "Kanban" },
    },
    // -- Reports (COSTING-06) --
    {
      name: "report-valuation",
      list: "/reports/valuation",
      meta: { label: "Valuation" },
    },
    {
      name: "report-cogs",
      list: "/reports/cogs",
      meta: { label: "Cost of Goods Sold" },
    },
    // -- Settings (developer-gated) --
    ...(capabilities.manage_api_keys
      ? [{
          name: "api-keys",
          list: "/settings/api-keys",
          meta: { label: "API Keys" },
        }]
      : []),
    // In-app company user management (GOVERNANCE-11) — OWNER only.
    ...(capabilities.manage_users
      ? [{
          name: "company-users",
          list: "/settings/users",
          meta: { label: "Users" },
        }]
      : []),
    {
      name: "qr-codes",
      list: "/qr-codes",
      meta: { label: "QR Codes" },
    },
    {
      name: "notification-channels",
      list: "/settings/notifications",
      meta: { label: "Notifications" },
    },
    {
      name: "product-import",
      list: "/settings/import",
      meta: { label: "Import Products" },
    },
    {
      name: "calculator-templates",
      list: "/settings/calculators",
      create: "/settings/calculators/create",
      edit: "/settings/calculators/edit/:id",
      meta: { label: "Tracking Presets" },
    },
    ...(capabilities.view_widget_generator
      ? [{
          name: "widget-generator",
          list: "/widget-generator",
          meta: { label: "Widgets" },
        }]
      : []),
    ...(capabilities.view_widget_preview
      ? [{
          name: "widget-preview",
          list: "/widget-preview",
          meta: { label: "Widget Preview" },
        }]
      : []),
    ...(capabilities.manage_tenants
      ? [{
          name: "tenants",
          list: "/tenants",
          create: "/tenants/create",
          meta: { label: "Tenants" },
        }]
      : []),
    // -- Platform console (superuser-only) --
    ...(isSuperuser
      ? [{
          name: "console",
          list: "/console",
          meta: { label: "Console" },
        }]
      : []),
    // -- Hidden (data-fetching only) --
    {
      name: "event-logs",
      list: "/event-logs",
      meta: { hide: true },
    },
    {
      name: "notification-deliveries",
      list: "/notification-deliveries",
      meta: { hide: true },
    },
  ];
}
