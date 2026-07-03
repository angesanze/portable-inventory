import { useContext } from "react";
import { DEFAULT_PALETTE_ID, channelsToHex, getPalette } from "./palettes";
import { ThemeContext, type ThemeContextValue } from "./themeContext";

/** Access the palette context; throws if used outside a `ThemeProvider`. */
export function useThemePalette(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useThemePalette must be used within a ThemeProvider");
    return ctx;
}

/**
 * Accent hexes derived from the active palette, for JS consumers that can't use
 * Tailwind classes (recharts series). Recomputes when the palette changes.
 * Provider-optional: outside a `ThemeProvider` it falls back to the default
 * palette, so charts still render (e.g. in isolation tests).
 */
export function useAccent(): {
    accent: string;
    accentSoft: string;
    accentStrong: string;
    secondary: string;
} {
    const ctx = useContext(ThemeContext);
    const palette = ctx?.palette ?? getPalette(DEFAULT_PALETTE_ID);
    return {
        accent: channelsToHex(palette.accent[500]),
        accentSoft: channelsToHex(palette.accent[400]),
        accentStrong: channelsToHex(palette.accent[600]),
        secondary: palette.secondary,
    };
}
