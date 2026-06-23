/**
 * Offline operation queue backed by IndexedDB.
 *
 * Stores pending stock operations when the device is offline and replays
 * them in order when connectivity is restored.
 */

export type QueuedOperationStatus = "pending" | "synced" | "failed" | "conflict";

export interface QueuedOperation {
    id: string;
    timestamp: number;
    operation: string;
    productId: string;
    locationId: string;
    quantity: number;
    metadata: Record<string, unknown>;
    status: QueuedOperationStatus;
    /**
     * Server-side idempotency key, generated at enqueue time. Replaying the
     * same operation twice (timeout → retry) creates exactly one Movement.
     */
    idempotencyKey?: string;
    /** Snapshot of stock at queue time — informational only */
    stockAtQueue?: number;
    /** Error message when status is "failed" */
    error?: string;
}

const DB_NAME = "pi-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "operations";

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                store.createIndex("status", "status", { unique: false });
                store.createIndex("timestamp", "timestamp", { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Enqueue a new operation for offline sync. */
export async function enqueueOperation(
    op: Omit<QueuedOperation, "id" | "timestamp" | "status">
): Promise<QueuedOperation> {
    const entry: QueuedOperation = {
        ...op,
        id: generateId(),
        timestamp: Date.now(),
        status: "pending",
        idempotencyKey:
            typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : undefined,
    };

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).add(entry);
        tx.oncomplete = () => {
            db.close();
            resolve(entry);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/** Get all operations with a given status (default: all). */
export async function getOperations(
    status?: QueuedOperationStatus
): Promise<QueuedOperation[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);

        let request: IDBRequest;
        if (status) {
            request = store.index("status").getAll(status);
        } else {
            request = store.getAll();
        }

        request.onsuccess = () => {
            db.close();
            const results = (request.result as QueuedOperation[]).sort(
                (a, b) => a.timestamp - b.timestamp
            );
            resolve(results);
        };
        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

/** Count pending operations. */
export async function getPendingCount(): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).index("status").count("pending");
        request.onsuccess = () => {
            db.close();
            resolve(request.result);
        };
        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

/** Update an operation's status (and optionally error message). */
export async function updateOperationStatus(
    id: string,
    status: QueuedOperationStatus,
    error?: string
): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
            const entry = getReq.result as QueuedOperation | undefined;
            if (!entry) {
                db.close();
                reject(new Error(`Operation ${id} not found`));
                return;
            }
            entry.status = status;
            if (error !== undefined) entry.error = error;
            store.put(entry);
        };

        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/** Remove a single operation by id. */
export async function removeOperation(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/** Remove all synced operations (cleanup after successful sync). */
export async function clearSyncedOperations(): Promise<void> {
    const synced = await getOperations("synced");
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        for (const op of synced) {
            store.delete(op.id);
        }
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

/** Clear entire queue (for testing / manual reset). */
export async function clearAllOperations(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

export interface SyncResult {
    synced: string[];
    failed: string[];
    conflicts: string[];
}

/**
 * Replay all pending operations in order.
 *
 * Each operation carries an idempotency key, so retries after timeouts are
 * safe — the server creates at most one Movement per key. Operations the
 * server rejects for insufficient stock are flagged as "conflict" for user
 * review (the stock genuinely changed while offline); other rejections are
 * "failed". No optimistic stock-snapshot pre-check: with ordered replay and
 * idempotent submission it only produced false-positive conflicts.
 */
export async function replayQueue(
    apiUrl: string,
    apiKey: string
): Promise<SyncResult> {
    const pending = await getOperations("pending");
    const result: SyncResult = { synced: [], failed: [], conflicts: [] };

    for (const op of pending) {
        // Replay the operation via /widget/move/
        try {
            const res = await fetch(`${apiUrl}/widget/move/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    api_key: apiKey,
                    product_id: op.productId,
                    location_id: op.locationId,
                    quantity: op.quantity,
                    reason: (op.metadata.reason as string) || "Offline Sync",
                    physical_identifier: op.metadata.physical_identifier || undefined,
                    calculator_payload: op.metadata.calculator_payload || undefined,
                    idempotency_key: op.idempotencyKey || undefined,
                }),
            });

            if (res.ok) {
                await updateOperationStatus(op.id, "synced");
                result.synced.push(op.id);
            } else {
                const data = await res.json().catch(() => ({}));
                const errorMsg = data.detail || data[0] || "Sync failed";
                const insufficientStock =
                    res.status === 409 || /insufficient/i.test(String(errorMsg));
                if (insufficientStock) {
                    await updateOperationStatus(op.id, "conflict", errorMsg);
                    result.conflicts.push(op.id);
                } else {
                    await updateOperationStatus(op.id, "failed", errorMsg);
                    result.failed.push(op.id);
                }
            }
        } catch (err) {
            const message = (err instanceof Error ? err.message : undefined) || "Network error";
            await updateOperationStatus(op.id, "failed", message);
            result.failed.push(op.id);
        }
    }

    // Cleanup synced entries
    if (result.synced.length > 0) {
        await clearSyncedOperations();
    }

    return result;
}
