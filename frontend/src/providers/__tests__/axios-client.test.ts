import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MockAdapter from "axios-mock-adapter";

// Must import after mocks are set up
let axiosInstance: typeof import("../axios-client").axiosInstance;
let mock: MockAdapter;

describe("axios-client token refresh interceptor", () => {
    beforeEach(async () => {
        // Clear module cache so each test gets fresh interceptor state
        vi.resetModules();
        localStorage.clear();
        localStorage.setItem("access_token", "expired-token");
        localStorage.setItem("refresh_token", "valid-refresh");

        const mod = await import("../axios-client");
        axiosInstance = mod.axiosInstance;
        mock = new MockAdapter(axiosInstance);
    });

    afterEach(() => {
        mock.restore();
        localStorage.clear();
    });

    it("refreshes token on 401 and retries the original request", async () => {
        // First call returns 401, then after refresh succeeds, retry returns 200
        let callCount = 0;
        mock.onGet("/api/v1/products/").reply(() => {
            callCount++;
            if (callCount === 1) {
                return [401, { detail: "Token expired" }];
            }
            return [200, { results: [] }];
        });

        mock.onPost(/\/api\/token\/refresh\//).reply(200, {
            access: "new-access-token",
            refresh: "new-refresh-token",
        });

        const response = await axiosInstance.get("/api/v1/products/");

        expect(response.status).toBe(200);
        expect(localStorage.getItem("access_token")).toBe("new-access-token");
        expect(localStorage.getItem("refresh_token")).toBe("new-refresh-token");
    });

    it("logs out (clears tokens) when refresh fails", async () => {
        mock.onGet("/api/v1/products/").reply(401, { detail: "Token expired" });
        mock.onPost(/\/api\/token\/refresh\//).reply(401, { detail: "Refresh expired" });

        await expect(axiosInstance.get("/api/v1/products/")).rejects.toThrow();

        expect(localStorage.getItem("access_token")).toBeNull();
        expect(localStorage.getItem("refresh_token")).toBeNull();
    });

    it("does not attempt refresh when no refresh_token exists", async () => {
        localStorage.removeItem("refresh_token");

        mock.onGet("/api/v1/products/").reply(401, { detail: "Token expired" });

        await expect(axiosInstance.get("/api/v1/products/")).rejects.toThrow();

        // Verify no refresh call was made
        const refreshCalls = mock.history.post.filter((r) =>
            r.url?.includes("token/refresh"),
        );
        expect(refreshCalls).toHaveLength(0);
    });

    it("does not attempt refresh for token endpoint 401s", async () => {
        mock.onPost(/\/api\/token\//).reply(401, { detail: "Bad credentials" });

        await expect(
            axiosInstance.post("/api/token/", { username: "x", password: "y" }),
        ).rejects.toThrow();

        // No refresh attempt
        const refreshCalls = mock.history.post.filter((r) =>
            r.url?.includes("token/refresh"),
        );
        expect(refreshCalls).toHaveLength(0);
    });

    it("attaches X-Acting-Company on GET/POST/PATCH/DELETE when a tenant is set", async () => {
        const { ACTING_TENANT_STORAGE_KEY } = await import("../axios-client");
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "tenant-abc");

        mock.onGet("/api/v1/products/").reply(200, { results: [] });
        mock.onPost("/api/v1/products/").reply(201, {});
        mock.onPatch("/api/v1/products/1/").reply(200, {});
        mock.onDelete("/api/v1/products/1/").reply(204);

        await axiosInstance.get("/api/v1/products/");
        await axiosInstance.post("/api/v1/products/", { name: "x" });
        await axiosInstance.patch("/api/v1/products/1/", { name: "y" });
        await axiosInstance.delete("/api/v1/products/1/");

        for (const req of [
            ...mock.history.get,
            ...mock.history.post,
            ...mock.history.patch,
            ...mock.history.delete,
        ]) {
            expect(req.headers?.["X-Acting-Company"]).toBe("tenant-abc");
        }
    });

    it("does not attach X-Acting-Company when no tenant is set", async () => {
        const { ACTING_TENANT_STORAGE_KEY } = await import("../axios-client");
        localStorage.removeItem(ACTING_TENANT_STORAGE_KEY);

        mock.onGet("/api/v1/products/").reply(200, { results: [] });
        await axiosInstance.get("/api/v1/products/");

        expect(mock.history.get[0].headers?.["X-Acting-Company"]).toBeUndefined();
    });

    it("queues concurrent requests during refresh", async () => {
        let apiCallCount = 0;
        mock.onGet("/api/v1/products/").reply(() => {
            apiCallCount++;
            if (apiCallCount <= 2) {
                return [401, { detail: "Token expired" }];
            }
            return [200, { results: [] }];
        });

        mock.onGet("/api/v1/locations/").reply(() => {
            apiCallCount++;
            if (apiCallCount <= 2) {
                return [401, { detail: "Token expired" }];
            }
            return [200, { results: [] }];
        });

        // Delay refresh slightly to ensure both requests queue up
        mock.onPost(/\/api\/token\/refresh\//).reply(() => {
            return [200, { access: "new-token", refresh: "new-refresh" }];
        });

        const [res1, res2] = await Promise.all([
            axiosInstance.get("/api/v1/products/"),
            axiosInstance.get("/api/v1/locations/"),
        ]);

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);

        // Only one refresh call should have been made
        const refreshCalls = mock.history.post.filter((r) =>
            r.url?.includes("token/refresh"),
        );
        expect(refreshCalls).toHaveLength(1);
    });
});
