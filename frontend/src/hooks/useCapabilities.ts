import { useGetIdentity } from "@refinedev/core";

/**
 * Capability flags mirrored from the backend ``company_capabilities`` map
 * (see ``backend/core/scope.py``). Each key gates a frontend surface; the
 * backend write/read gates from DUAL-TIER-04/05 are the real enforcement —
 * UI hiding here is convenience only.
 */
export interface Capabilities {
    manage_api_keys: boolean;
    view_widget_generator: boolean;
    view_widget_preview: boolean;
    create_users: boolean;
    manage_tenants: boolean;
    manage_own_inventory: boolean;
    // GOVERNANCE-11 / C2 — intra-company role-gated capabilities.
    delete_inventory: boolean;
    manage_thresholds: boolean;
    manage_settings: boolean;
    manage_users: boolean;
}

export type Role = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";

/** License envelope shipped on the identity payload (GOVERNANCE-11 / C1). */
export interface LicenseInfo {
    expires_at: string | null;
    expired: boolean;
    limits: {
        max_users: number | null;
        max_products: number | null;
        max_managed_companies: number | null;
    };
    usage: {
        users: number;
        products: number;
        managed_companies: number;
    };
}

/**
 * Shape of the identity payload returned by ``authProvider.getIdentity``,
 * which forwards the ``account_type``/``is_superuser``/``capabilities`` fields
 * shipped by the backend ``/users/me/`` endpoint (DUAL-TIER-05).
 */
export interface CapabilityIdentity {
    account_type?: string | null;
    is_superuser?: boolean;
    capabilities?: Partial<Capabilities>;
    role?: Role | null;
    license?: LicenseInfo | null;
}

/**
 * Safe defaults applied while identity is loading (or absent). The UI fails
 * closed: every developer-only capability is ``false`` so a manager never sees
 * a flash of developer controls before identity resolves. Only the baseline
 * warehouse capability is granted.
 */
export const DEFAULT_CAPABILITIES: Capabilities = {
    manage_api_keys: false,
    view_widget_generator: false,
    view_widget_preview: false,
    create_users: false,
    manage_tenants: false,
    manage_own_inventory: true,
    // Fail closed on the role-gated keys until identity resolves.
    delete_inventory: false,
    manage_thresholds: false,
    manage_settings: false,
    manage_users: false,
};

export interface UseCapabilitiesResult {
    capabilities: Capabilities;
    account_type: string | null;
    is_superuser: boolean;
    role: Role | null;
    license: LicenseInfo | null;
    isLoading: boolean;
}

/**
 * Typed wrapper around ``useGetIdentity`` exposing the capability map plus
 * ``account_type`` and ``is_superuser``. Returns fail-closed defaults until
 * identity resolves, so callers can gate resources/menus/routes without
 * guarding for the loading state themselves.
 */
export const useCapabilities = (): UseCapabilitiesResult => {
    const { data: identity, isLoading } = useGetIdentity<CapabilityIdentity>();

    const capabilities: Capabilities = {
        ...DEFAULT_CAPABILITIES,
        ...(identity?.capabilities ?? {}),
    };

    return {
        capabilities,
        account_type: identity?.account_type ?? null,
        is_superuser: identity?.is_superuser ?? false,
        role: identity?.role ?? null,
        license: identity?.license ?? null,
        isLoading,
    };
};
