import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import MockAdapter from "axios-mock-adapter";

/**
 * DUAL-TIER-07 task 4 — verify the developer's dashboard works in BOTH modes
 * and that QR generation + the widget-generator preview respect the acting
 * tenant.
 *
 * The dual-tier scope is enforced server-side off the `X-Acting-Company`
 * header (see backend `core/scope.py`). On the frontend every Refine data call
 * (lists, creates, updates, deletes — including QR generation via `useCreate`
 * and the api-keys list that feeds the Widget Generator) goes through the same
 * `axiosInstance`, so the only thing this layer must guarantee is that the
 * header rides along when a tenant is selected and is absent otherwise.
 *
 * The widget *preview* itself is a raw `fetch(.../widget/?api_key=<key>)` call:
 * it is scoped by the api_key, and the developer can only ever select a key
 * returned by the (header-scoped) api-keys list — so entering a tenant swaps
 * the available keys and the preview follows automatically.
 */

const API_BASE = "/api/v1";

let axiosInstance: typeof import("../../../providers/axios-client").axiosInstance;
let ACTING_TENANT_STORAGE_KEY: string;
let mock: MockAdapter;

beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem("access_token", "tok");

    const mod = await import("../../../providers/axios-client");
    axiosInstance = mod.axiosInstance;
    ACTING_TENANT_STORAGE_KEY = mod.ACTING_TENANT_STORAGE_KEY;
    mock = new MockAdapter(axiosInstance);
});

afterEach(() => {
    mock.restore();
    localStorage.clear();
});

describe("DUAL-TIER-07 — QR + widget data calls respect the acting tenant", () => {
    it("scopes QR generation to the acting tenant (header on POST generate_batch)", async () => {
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "child-1");

        mock.onPost(`${API_BASE}/qr-codes/generate_batch/`).reply(201, {});

        await axiosInstance.post(`${API_BASE}/qr-codes/generate_batch/`, {
            count: 3,
            api_key: "k",
        });

        expect(mock.history.post[0].headers?.["X-Acting-Company"]).toBe("child-1");
    });

    it("scopes the Widget Generator key source to the acting tenant (header on api-keys list)", async () => {
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "child-1");

        mock.onGet(`${API_BASE}/api-keys/`).reply(200, { results: [] });

        await axiosInstance.get(`${API_BASE}/api-keys/`);

        // The preview uses one of these keys; scoping the list scopes the preview.
        expect(mock.history.get[0].headers?.["X-Acting-Company"]).toBe("child-1");
    });

    it("falls back to the developer's own data when no tenant is set", async () => {
        // No ACTING_TENANT_STORAGE_KEY -> own-context dashboard (developers also
        // hold manage_own_inventory), so the backend resolves to user.company.
        mock.onGet(`${API_BASE}/qr-codes/`).reply(200, { results: [] });
        mock.onGet(`${API_BASE}/api-keys/`).reply(200, { results: [] });

        await axiosInstance.get(`${API_BASE}/qr-codes/`);
        await axiosInstance.get(`${API_BASE}/api-keys/`);

        for (const req of mock.history.get) {
            expect(req.headers?.["X-Acting-Company"]).toBeUndefined();
        }
    });

    it("switches scope when the acting tenant changes between calls", async () => {
        mock.onGet(`${API_BASE}/qr-codes/`).reply(200, { results: [] });

        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "child-1");
        await axiosInstance.get(`${API_BASE}/qr-codes/`);

        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "child-2");
        await axiosInstance.get(`${API_BASE}/qr-codes/`);

        localStorage.removeItem(ACTING_TENANT_STORAGE_KEY);
        await axiosInstance.get(`${API_BASE}/qr-codes/`);

        expect(mock.history.get[0].headers?.["X-Acting-Company"]).toBe("child-1");
        expect(mock.history.get[1].headers?.["X-Acting-Company"]).toBe("child-2");
        expect(mock.history.get[2].headers?.["X-Acting-Company"]).toBeUndefined();
    });
});
