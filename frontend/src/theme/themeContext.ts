import { createContext } from "react";
import type { Palette } from "./palettes";

export interface ThemeContextValue {
    /** Currently selected palette id. */
    paletteId: string;
    /** The resolved active palette. */
    palette: Palette;
    /** All available presets, in display order. */
    palettes: Palette[];
    /** Select a palette: applies its CSS vars and persists the choice. */
    setPalette: (id: string) => void;
}

/**
 * Palette context. Kept in its own module so {@link ThemeProvider} can be the
 * file's only export (Fast Refresh) while the hooks live in `useTheme`.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null);
