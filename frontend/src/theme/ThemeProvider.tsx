import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PALETTES, getPalette } from "./palettes";
import { PALETTE_STORAGE_KEY, applyPaletteVars, getStoredPaletteId } from "./applyPalette";
import { ThemeContext, type ThemeContextValue } from "./themeContext";

/**
 * App-wide color-palette state. Mirrors the language/sidebar persistence pattern
 * (localStorage, no server sync). The initial CSS vars are also applied pre-paint
 * in `main.tsx` to avoid a flash; this provider keeps React state in sync and
 * re-applies whenever the choice changes. Hooks live in `./useTheme`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
    const [paletteId, setPaletteId] = useState(getStoredPaletteId);

    // Re-apply the accent vars on mount and whenever the palette changes. The
    // mount pass also covers environments where `main.tsx` didn't pre-apply
    // (e.g. tests rendering the provider directly).
    useEffect(() => {
        applyPaletteVars(paletteId);
    }, [paletteId]);

    const setPalette = useCallback((id: string) => {
        setPaletteId(id);
        try {
            localStorage.setItem(PALETTE_STORAGE_KEY, id);
        } catch {
            /* noop — persistence is best-effort */
        }
    }, []);

    const value: ThemeContextValue = {
        paletteId,
        palette: getPalette(paletteId),
        palettes: PALETTES,
        setPalette,
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
