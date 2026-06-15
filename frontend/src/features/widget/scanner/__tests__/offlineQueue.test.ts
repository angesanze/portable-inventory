import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    enqueueOperation,
    getOperations,
    getPendingCount,
    updateOperationStatus,
    removeOperation,
    clearSyncedOperations,
    clearAllOperations,
    replayQueue,
} from "../offlineQueue";

beforeEach(async () => {
    await clearAllOperations();
});

const makeOp = (overrides: Record<string, unknown> = {}) => ({
    operation: "add",
    productId: "prod-1",
    locationId: "loc-1",
    quantity: 10,
    metadata: { reason: "Test" },
    ...overrides,
});

describe("offlineQueue", () => {
    describe("enqueueOperation", () => {
        it("stores operation with generated id, timestamp, and pending status", async () => {
            const entry = await enqueueOperation(makeOp());

            expect(entry.id).toBeTruthy();
            expect(entry.timestamp).toBeGreaterThan(0);
            expect(entry.status).toBe("pending");
            expect(entry.productId).toBe("prod-1");
            expect(entry.quantity).toBe(10);
        });

        it("stores multiple operations", async () => {
            await enqueueOperation(makeOp({ productId: "prod-1" }));
            await enqueueOperation(makeOp({ productId: "prod-2" }));
            await enqueueOperation(makeOp({ productId: "prod-3" }));

            const all = await getOperations();
            expect(all).toHaveLength(3);
        });
    });

    describe("getOperations", () => {
        it("returns all operations when no filter", async () => {
            await enqueueOperation(makeOp());
            const e2 = await enqueueOperation(makeOp({ productId: "prod-2" }));
            await updateOperationStatus(e2.id, "synced");

            const all = await getOperations();
            expect(all).toHaveLength(2);
        });

        it("filters by status", async () => {
            await enqueueOperation(makeOp());
            const e2 = await enqueueOperation(makeOp({ productId: "prod-2" }));
            await updateOperationStatus(e2.id, "synced");

            const pending = await getOperations("pending");
            expect(pending).toHaveLength(1);
            expect(pending[0].productId).toBe("prod-1");
        });

        it("returns operations sorted by timestamp", async () => {
            await enqueueOperation(makeOp({ productId: "first" }));
            await enqueueOperation(makeOp({ productId: "second" }));

            const all = await getOperations();
            // Both enqueued in order — verify timestamps are non-decreasing
            expect(all).toHaveLength(2);
            expect(all[0].timestamp).toBeLessThanOrEqual(all[1].timestamp);
        });
    });

    describe("getPendingCount", () => {
        it("returns 0 when queue empty", async () => {
            expect(await getPendingCount()).toBe(0);
        });

        it("counts only pending operations", async () => {
            await enqueueOperation(makeOp());
            await enqueueOperation(makeOp());
            const e3 = await enqueueOperation(makeOp());
            await updateOperationStatus(e3.id, "synced");

            expect(await getPendingCount()).toBe(2);
        });
    });

    describe("updateOperationStatus", () => {
        it("updates status of existing operation", async () => {
            const entry = await enqueueOperation(makeOp());
            await updateOperationStatus(entry.id, "failed", "Server error");

            const all = await getOperations("failed");
            expect(all).toHaveLength(1);
            expect(all[0].error).toBe("Server error");
        });

        it("rejects for non-existent id", async () => {
            await expect(
                updateOperationStatus("nonexistent", "synced")
            ).rejects.toThrow("not found");
        });
    });

    describe("removeOperation", () => {
        it("removes single operation by id", async () => {
            const e1 = await enqueueOperation(makeOp());
            await enqueueOperation(makeOp({ productId: "keep" }));

            await removeOperation(e1.id);

            const all = await getOperations();
            expect(all).toHaveLength(1);
            expect(all[0].productId).toBe("keep");
        });
    });

    describe("clearSyncedOperations", () => {
        it("removes only synced operations", async () => {
            await enqueueOperation(makeOp({ productId: "pending-one" }));
            const e2 = await enqueueOperation(makeOp({ productId: "synced-one" }));
            await updateOperationStatus(e2.id, "synced");

            await clearSyncedOperations();

            const all = await getOperations();
            expect(all).toHaveLength(1);
            expect(all[0].productId).toBe("pending-one");
        });
    });

    describe("clearAllOperations", () => {
        it("removes everything", async () => {
            await enqueueOperation(makeOp());
            await enqueueOperation(makeOp());
            await clearAllOperations();

            expect(await getOperations()).toHaveLength(0);
        });
    });

    describe("replayQueue", () => {
        const apiUrl = "https://api.test";
        const apiKey = "test-key";

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("replays pending operations and marks as synced", async () => {
            await enqueueOperation(makeOp());
            await enqueueOperation(makeOp({ productId: "prod-2" }));

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await replayQueue(apiUrl, apiKey);

            expect(result.synced).toHaveLength(2);
            expect(result.failed).toHaveLength(0);
            expect(result.conflicts).toHaveLength(0);

            // Synced ops get cleaned up
            expect(await getPendingCount()).toBe(0);
        });

        it("marks failed operations with error", async () => {
            await enqueueOperation(makeOp());

            const fetchMock = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ detail: "Invalid product" }),
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await replayQueue(apiUrl, apiKey);

            expect(result.failed).toHaveLength(1);
            const failed = await getOperations("failed");
            expect(failed[0].error).toBe("Invalid product");
        });

        it("flags 409 rejections as conflicts for review", async () => {
            await enqueueOperation(makeOp());

            // No pre-flight stock-snapshot check anymore: the only request
            // is the POST to /widget/move/, and a 409 marks the op "conflict".
            const fetchMock = vi.fn().mockResolvedValue({
                ok: false,
                status: 409,
                json: () => Promise.resolve({ detail: "Stock changed" }),
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await replayQueue(apiUrl, apiKey);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock.mock.calls[0][0]).toBe(`${apiUrl}/widget/move/`);
            expect(result.conflicts).toHaveLength(1);
            expect(result.synced).toHaveLength(0);
            expect(result.failed).toHaveLength(0);

            const conflicts = await getOperations("conflict");
            expect(conflicts).toHaveLength(1);
        });

        it("flags insufficient-stock error messages as conflicts", async () => {
            await enqueueOperation(makeOp());

            const fetchMock = vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                json: () =>
                    Promise.resolve({ detail: "Insufficient stock for product" }),
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await replayQueue(apiUrl, apiKey);
            expect(result.conflicts).toHaveLength(1);
            expect(result.failed).toHaveLength(0);
        });

        it("syncs with a single POST per operation (no pre-flight stock check)", async () => {
            await enqueueOperation(makeOp());

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await replayQueue(apiUrl, apiKey);
            expect(result.synced).toHaveLength(1);
            expect(result.conflicts).toHaveLength(0);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it("handles network errors during replay", async () => {
            await enqueueOperation(makeOp());

            const fetchMock = vi.fn().mockRejectedValue(new Error("Network down"));
            vi.stubGlobal("fetch", fetchMock);

            const result = await replayQueue(apiUrl, apiKey);

            expect(result.failed).toHaveLength(1);
            const failed = await getOperations("failed");
            expect(failed[0].error).toBe("Network down");
        });

        it("returns empty results when no pending operations", async () => {
            vi.stubGlobal("fetch", vi.fn());
            const result = await replayQueue(apiUrl, apiKey);

            expect(result.synced).toHaveLength(0);
            expect(result.failed).toHaveLength(0);
            expect(result.conflicts).toHaveLength(0);
        });

        it("sends correct payload to widget/move endpoint", async () => {
            const entry = await enqueueOperation(
                makeOp({
                    quantity: 5,
                    metadata: {
                        reason: "Restock",
                        physical_identifier: "SN-001",
                        calculator_payload: { operation: "add", quantity: 5 },
                    },
                })
            );

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });
            vi.stubGlobal("fetch", fetchMock);

            await replayQueue(apiUrl, apiKey);

            expect(fetchMock).toHaveBeenCalledWith(
                `${apiUrl}/widget/move/`,
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                })
            );

            const body = JSON.parse(fetchMock.mock.calls[0][1].body);
            expect(body.api_key).toBe(apiKey);
            expect(body.product_id).toBe("prod-1");
            expect(body.location_id).toBe("loc-1");
            expect(body.quantity).toBe(5);
            expect(body.reason).toBe("Restock");
            expect(body.physical_identifier).toBe("SN-001");
            expect(body.calculator_payload).toEqual({ operation: "add", quantity: 5 });
            // Idempotency key generated at enqueue time travels with the POST.
            expect(entry.idempotencyKey).toBeTruthy();
            expect(body.idempotency_key).toBe(entry.idempotencyKey);
        });
    });
});
