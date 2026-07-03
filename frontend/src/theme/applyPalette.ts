import { DEFAULT_PALETTE_ID, PALETTES, SHADES, channelsToHex, getPalette } from "./palettes";

/** localStorage key holding the chosen palette id (mirrors `language` / `sidebar_collapsed`). */
export const PALETTE_STORAGE_KEY = "color_palette";

/**
 * Write a palette's ramps onto the `--neutral-*` and `--accent-*` CSS variables
 * (default target: `<html>`). Tailwind's `zinc-*` and `indigo-*` utilities read
 * these vars, so this single call re-themes the whole app — background,
 * surfaces, text, borders and accents. Also syncs the mobile browser chrome
 * color (`<meta name="theme-color">`) to the background.
 */
export function applyPaletteVars(id: string, root: HTMLElement = document.documentElement): void {
    const palette = getPalette(id);
    for (const shade of SHADES) {
        root.style.setProperty(`--neutral-${shade}`, palette.neutral[shade]);
        root.style.setProperty(`--accent-${shade}`, palette.accent[shade]);
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = channelsToHex(palette.neutral[950]);
}

/** Read the persisted palette id, falling back to the default when absent/unknown. */
export function getStoredPaletteId(): string {
    try {
        const id = localStorage.getItem(PALETTE_STORAGE_KEY);
        return id && PALETTES.some((p) => p.id === id) ? id : DEFAULT_PALETTE_ID;
    } catch {
        return DEFAULT_PALETTE_ID;
    }
}
