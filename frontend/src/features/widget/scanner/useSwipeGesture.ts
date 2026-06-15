import { useRef, useEffect, useCallback } from "react";

interface SwipeHandlers {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
}

interface SwipeOptions {
    /** Minimum horizontal distance (px) to trigger swipe. Default: 80 */
    threshold?: number;
    /** Maximum vertical distance (px) before gesture is cancelled. Default: 100 */
    maxVertical?: number;
    /** Whether swipe is enabled. Default: true */
    enabled?: boolean;
}

/**
 * Touch swipe gesture detection for mobile.
 * Attach the returned ref to the container element.
 */
export function useSwipeGesture<T extends HTMLElement>(
    handlers: SwipeHandlers,
    options: SwipeOptions = {}
) {
    const { threshold = 80, maxVertical = 100, enabled = true } = options;
    const ref = useRef<T>(null);
    const startX = useRef(0);
    const startY = useRef(0);

    const onTouchStart = useCallback((e: TouchEvent) => {
        const touch = e.touches[0];
        startX.current = touch.clientX;
        startY.current = touch.clientY;
    }, []);

    const onTouchEnd = useCallback(
        (e: TouchEvent) => {
            const touch = e.changedTouches[0];
            const dx = touch.clientX - startX.current;
            const dy = Math.abs(touch.clientY - startY.current);

            if (dy > maxVertical) return; // Too much vertical movement
            if (Math.abs(dx) < threshold) return; // Not enough horizontal distance

            if (dx < 0) {
                handlers.onSwipeLeft?.();
            } else {
                handlers.onSwipeRight?.();
            }
        },
        [handlers, threshold, maxVertical]
    );

    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return;

        el.addEventListener("touchstart", onTouchStart, { passive: true });
        el.addEventListener("touchend", onTouchEnd, { passive: true });

        return () => {
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchend", onTouchEnd);
        };
    }, [onTouchStart, onTouchEnd, enabled]);

    return ref;
}
