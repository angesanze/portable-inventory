import { useState, useEffect } from "react";

// ---------- Responsive hook ----------
export function useIsMobile(breakpoint = 1024): boolean {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
    );
    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        // Re-sync from matchMedia (the source of truth) on mount / breakpoint
        // change so SSR-seeded or stale state matches the actual viewport.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMobile(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [breakpoint]);
    return isMobile;
}
