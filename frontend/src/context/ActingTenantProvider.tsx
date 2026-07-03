import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ACTING_TENANT_STORAGE_KEY } from "../providers/axios-client";

/**
 * The currently selected acting-tenant company id, or `null` when the
 * developer is operating in its own context. Persisted to `localStorage` under
 * `ACTING_TENANT_STORAGE_KEY` so it survives reloads and so the axios request
 * interceptor (which reads the same key) attaches `X-Acting-Company` on every
 * dashboard call without needing this React state.
 */
interface ActingTenantContextValue {
    /** Selected child-tenant company id, or `null` for the developer's own context. */
    actingTenantId: string | null;
    /** Enter a tenant: persist the id and attach it to subsequent requests. */
    setActingTenant: (id: string) => void;
    /** Exit back to the developer's own context: removes the id and the header. */
    clearActingTenant: () => void;
}

const ActingTenantContext = createContext<ActingTenantContextValue | null>(null);

/** Read the persisted acting-tenant id once on mount (SSR-safe-ish guard). */
function readPersistedTenant(): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(ACTING_TENANT_STORAGE_KEY) || null;
}

export const ActingTenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [actingTenantId, setActingTenantId] = useState<string | null>(readPersistedTenant);
    const queryClient = useQueryClient();

    const setActingTenant = useCallback((id: string) => {
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, id);
        setActingTenantId(id);
        // Every cached list/detail was fetched under the previous tenant scope.
        // Invalidate so mounted screens refetch with the new X-Acting-Company
        // header instead of rendering the prior tenant's rows until a manual
        // navigation happens to refetch (FE-03).
        queryClient.invalidateQueries();
    }, [queryClient]);

    const clearActingTenant = useCallback(() => {
        localStorage.removeItem(ACTING_TENANT_STORAGE_KEY);
        setActingTenantId(null);
        queryClient.invalidateQueries();
    }, [queryClient]);

    const value = useMemo<ActingTenantContextValue>(
        () => ({ actingTenantId, setActingTenant, clearActingTenant }),
        [actingTenantId, setActingTenant, clearActingTenant],
    );

    return <ActingTenantContext.Provider value={value}>{children}</ActingTenantContext.Provider>;
};

/**
 * Access the acting-tenant context. Throws if used outside
 * `ActingTenantProvider` so misuse fails loudly rather than silently
 * dropping the `X-Acting-Company` header.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the hook is intentionally co-located with its ActingTenantProvider (canonical context+consumer pairing); splitting it to a sibling module would fan out its import sites for a dev-only HMR optimization.
export const useActingTenant = (): ActingTenantContextValue => {
    const ctx = useContext(ActingTenantContext);
    if (!ctx) {
        throw new Error("useActingTenant must be used within an ActingTenantProvider");
    }
    return ctx;
};
