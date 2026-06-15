import { useRef } from "react";

export interface UseFormDraftResult<T> {
    /** The draft restored from ``sessionStorage`` on mount, or ``null``. */
    restored: T | null;
    /** Persist a snapshot of the current form state under ``key``. */
    save: (state: T) => void;
    /** Remove the persisted draft (call on successful submit / cancel). */
    clear: () => void;
}

/**
 * Persist an in-progress form draft to ``sessionStorage`` so it survives a
 * remount caused by on-the-fly entity creation (CLEANUP-05). The caller seeds
 * its ``useState`` from ``restored`` and calls ``save`` right before navigating
 * to an inline-create route.
 *
 * Scoped to the tab/session (``sessionStorage``, not ``localStorage``) so drafts
 * never linger across logins. Dependency-free: ``sessionStorage`` + JSON only.
 *
 * @param key namespaced storage key, e.g. ``draft:movements:create``.
 * @param options.enabled when ``false`` the hook is inert: ``restored`` is
 *   ``null`` and ``save``/``clear`` are no-ops.
 */
export const useFormDraft = <T>(
    key: string,
    options?: { enabled?: boolean },
): UseFormDraftResult<T> => {
    const enabled = options?.enabled ?? true;

    // Read once on mount; sessionStorage is synchronous so a ref keeps the
    // restored value stable across renders without re-parsing.
    const restoredRef = useRef<T | null | undefined>(undefined);
    if (restoredRef.current === undefined) {
        restoredRef.current = enabled ? readDraft<T>(key) : null;
    }

    const save = (state: T) => {
        if (!enabled) {
            return;
        }
        try {
            sessionStorage.setItem(key, JSON.stringify(state));
        } catch {
            // Quota / serialization failure: drop the draft silently rather
            // than break the navigation the caller is about to perform.
        }
    };

    const clear = () => {
        try {
            sessionStorage.removeItem(key);
        } catch {
            // ignore
        }
    };

    return { restored: restoredRef.current, save, clear };
};

const readDraft = <T>(key: string): T | null => {
    try {
        const raw = sessionStorage.getItem(key);
        if (raw === null) {
            return null;
        }
        return JSON.parse(raw) as T;
    } catch {
        // Corrupt JSON or unavailable storage: fail to null, never throw.
        return null;
    }
};
