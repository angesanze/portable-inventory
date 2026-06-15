import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import { axiosInstance, ACTING_TENANT_STORAGE_KEY } from "../../../providers/axios-client";
import { ActingTenantProvider, useActingTenant } from "../../../context/ActingTenantProvider";
import { buildResources } from "../../../resources";
import { DEFAULT_CAPABILITIES } from "../../../hooks/useCapabilities";

/**
 * Consolidated DUAL-TIER-07 acceptance test:
 *  (1) selecting a tenant attaches `X-Acting-Company` to subsequent requests,
 *  (2) clearing it removes the header,
 *  (3) the `tenants` resource is hidden for managers, visible for developers.
 *
 * Items 1 & 2 are driven through the public context API
 * (`setActingTenant`/`clearActingTenant`) rather than poking `localStorage`
 * directly, so the provider ↔ interceptor contract is exercised end-to-end.
 */
describe("DUAL-TIER-07 acting-tenant header + resource visibility", () => {
    let mock: MockAdapter;

    beforeEach(() => {
        localStorage.clear();
        mock = new MockAdapter(axiosInstance);
        mock.onAny("/api/v1/products/").reply(200, { results: [] });
    });

    afterEach(() => {
        mock.restore();
        localStorage.clear();
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ActingTenantProvider>{children}</ActingTenantProvider>
    );

    function lastRequestHeader() {
        const all = [...mock.history.get, ...mock.history.post];
        return all[all.length - 1]?.headers?.["X-Acting-Company"];
    }

    it("(1) selecting a tenant sets X-Acting-Company on subsequent requests", async () => {
        const { result } = renderHook(() => useActingTenant(), { wrapper });

        act(() => result.current.setActingTenant("tenant-99"));

        await axiosInstance.get("/api/v1/products/");
        expect(lastRequestHeader()).toBe("tenant-99");
    });

    it("(2) clearing the tenant removes the header from subsequent requests", async () => {
        const { result } = renderHook(() => useActingTenant(), { wrapper });

        act(() => result.current.setActingTenant("tenant-99"));
        await axiosInstance.get("/api/v1/products/");
        expect(lastRequestHeader()).toBe("tenant-99");

        act(() => result.current.clearActingTenant());
        await axiosInstance.get("/api/v1/products/");
        expect(lastRequestHeader()).toBeUndefined();
        expect(localStorage.getItem(ACTING_TENANT_STORAGE_KEY)).toBeNull();
    });

    it("(3) tenants resource is hidden for managers", () => {
        // Manager == fail-closed defaults (manage_tenants: false).
        const resources = buildResources(DEFAULT_CAPABILITIES);
        expect(resources.some((r) => r.name === "tenants")).toBe(false);
    });

    it("(3) tenants resource is visible for developers", () => {
        const resources = buildResources({
            ...DEFAULT_CAPABILITIES,
            manage_tenants: true,
        });
        const tenants = resources.find((r) => r.name === "tenants");
        expect(tenants).toBeTruthy();
        expect(tenants?.list).toBe("/tenants");
        expect(tenants?.create).toBe("/tenants/create");
    });
});
