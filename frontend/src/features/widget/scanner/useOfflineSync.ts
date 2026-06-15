import { useState, useEffect, useCallback, useRef } from "react";
import {
    enqueueOperation,
    getPendingCount,
    getOperations,
    replayQueue,
    clearAllOperations,
    type QueuedOperation,
    type SyncResult,
} from "./offlineQueue";

export interface UseOfflineSyncOptions {
    apiUrl: string;
    apiKey: string | null;
    /** Auto-sync when coming back online (default: true) */
    autoSync?: boolean;
}

export interface UseOfflineSyncReturn {
    isOnline: boolean;
    pendingCount: number;
    isSyncing: boolean;
    lastSyncResult: SyncResult | null;
    /** Queue an operation for later sync */
    queueOperation: (op: Omit<QueuedOperation, "id" | "timestamp" | "status">) => Promise<QueuedOperation>;
    /** Manually trigger sync */
    syncNow: () => Promise<SyncResult | null>;
    /** Get all pending operations */
    getPending: () => Promise<QueuedOperation[]>;
    /** Clear entire queue */
    clearQueue: () => Promise<void>;
    /** Refresh pending count from IndexedDB */
    refreshCount: () => Promise<void>;
}

export function useOfflineSync(options: UseOfflineSyncOptions): UseOfflineSyncReturn {
    const { apiUrl, apiKey, autoSync = true } = options;

    const [isOnline, setIsOnline] = useState(
        typeof navigator !== "undefined" ? navigator.onLine : true
    );
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
    const syncingRef = useRef(false);

    const refreshCount = useCallback(async () => {
        try {
            const count = await getPendingCount();
            setPendingCount(count);
        } catch {
            // IndexedDB not available — keep count at 0
        }
    }, []);

    const syncNow = useCallback(async (): Promise<SyncResult | null> => {
        if (!apiKey || syncingRef.current || !navigator.onLine) return null;

        syncingRef.current = true;
        setIsSyncing(true);

        try {
            const result = await replayQueue(apiUrl, apiKey);
            setLastSyncResult(result);
            await refreshCount();
            return result;
        } catch {
            return null;
        } finally {
            syncingRef.current = false;
            setIsSyncing(false);
        }
    }, [apiUrl, apiKey, refreshCount]);

    const queueOperation = useCallback(
        async (op: Omit<QueuedOperation, "id" | "timestamp" | "status">) => {
            const entry = await enqueueOperation(op);
            await refreshCount();
            return entry;
        },
        [refreshCount]
    );

    const getPending = useCallback(async () => {
        return getOperations("pending");
    }, []);

    const clearQueue = useCallback(async () => {
        await clearAllOperations();
        setPendingCount(0);
    }, []);

    // Online/offline event listeners
    useEffect(() => {
        const goOnline = () => {
            setIsOnline(true);
            if (autoSync) {
                syncNow();
            }
        };
        const goOffline = () => setIsOnline(false);

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, [autoSync, syncNow]);

    // Load pending count on mount
    useEffect(() => {
        refreshCount();
    }, [refreshCount]);

    return {
        isOnline,
        pendingCount,
        isSyncing,
        lastSyncResult,
        queueOperation,
        syncNow,
        getPending,
        clearQueue,
        refreshCount,
    };
}
