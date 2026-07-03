// ---------- Color palette presets ----------
//
// A palette is a FULL theme: a neutral scale (backgrounds, surfaces, text,
// borders) AND an accent scale (buttons, links, active state, underlines,
// focus rings). `tailwind.config.js` redefines every `zinc-*` utility as
// `rgb(var(--neutral-<shade>) / <alpha>)` and every `indigo-*` utility as
// `rgb(var(--accent-<shade>) / <alpha>)`, so swapping ~22 CSS variables at
// runtime re-themes the whole app — background included — with no per-component
// edits. Semantic status colors (green/amber/red) stay fixed: they encode
// meaning, not brand.

export type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

export const SHADES: Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export type Ramp = Record<Shade, string>;

export interface Palette {
    /** Stable id, persisted in localStorage and used as the i18n name key. */
    id: string;
    /** Neutral scale (bg / surface / text / border) as "r g b" channel strings. */
    neutral: Ramp;
    /** Accent scale (primary brand color) as "r g b" channel strings. */
    accent: Ramp;
    /** Secondary accent hex (charts, preview) — a distinct companion color. */
    secondary: string;
    /** Five distinct hexes shown as the preview chip in Settings → Appearance. */
    swatches: string[];
}

export const DEFAULT_PALETTE_ID = "indigo";

// ---------- Color math ----------

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
}

function ch(rgb: Rgb): string {
    return rgb.map((n) => Math.round(Math.max(0, Math.min(255, n)))).join(" ");
}

/** Linear blend from `a` toward `b` by amount `t` (0..1). */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/**
 * Build an 11-stop accent ramp from a single anchor hex placed at 500, mixing
 * toward white for the light stops and black for the dark stops. The mix
 * amounts approximate Tailwind's shade distribution.
 */
function accentRamp(hex: string): Ramp {
    const c = hexToRgb(hex);
    return {
        50: ch(mix(c, WHITE, 0.9)),
        100: ch(mix(c, WHITE, 0.8)),
        200: ch(mix(c, WHITE, 0.62)),
        300: ch(mix(c, WHITE, 0.42)),
        400: ch(mix(c, WHITE, 0.2)),
        500: ch(c),
        600: ch(mix(c, BLACK, 0.16)),
        700: ch(mix(c, BLACK, 0.32)),
        800: ch(mix(c, BLACK, 0.48)),
        900: ch(mix(c, BLACK, 0.62)),
        950: ch(mix(c, BLACK, 0.78)),
    };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// Lightness + saturation curve for tinted (non-default) neutral scales.
// Re-hueing zinc keeps its near-black darks, where any tint is invisible — so
// instead this is a LIFTED, saturated dark scale: canvas (950) → panels/cards
// (900) → inputs (800) read as distinct, visibly colored tones, while the light
// stops stay bright for high-contrast text.
const NEUTRAL_L: Record<Shade, number> = {
    950: 0.09, 900: 0.15, 800: 0.2, 700: 0.27, 600: 0.37,
    500: 0.49, 400: 0.63, 300: 0.73, 200: 0.83, 100: 0.9, 50: 0.96,
};
const NEUTRAL_S: Record<Shade, number> = {
    950: 0.15, 900: 0.16, 800: 0.15, 700: 0.13, 600: 0.11,
    500: 0.1, 400: 0.08, 300: 0.06, 200: 0.05, 100: 0.04, 50: 0.03,
};

/**
 * Build a tinted dark neutral ramp at `hue` (0..360), scaling the built-in
 * saturation curve by `satScale`. Canvas / panel / surface stops carry visible
 * color while text contrast stays close to the default zinc theme.
 */
function tintedNeutral(hue: number, satScale = 1): Ramp {
    const out = {} as Ramp;
    for (const shade of SHADES) {
        out[shade] = ch(hslToRgb(hue, NEUTRAL_S[shade] * satScale, NEUTRAL_L[shade]));
    }
    return out;
}

// Exact Tailwind ramps used verbatim by the default palette so the current look
// is pixel-identical to before theming existed.
const ZINC: Ramp = {
    50: "250 250 250", 100: "244 244 245", 200: "228 228 231", 300: "212 212 216",
    400: "161 161 170", 500: "113 113 122", 600: "82 82 91", 700: "63 63 70",
    800: "39 39 42", 900: "24 24 27", 950: "9 9 11",
};
const INDIGO: Ramp = {
    50: "238 242 255", 100: "224 231 255", 200: "199 210 254", 300: "165 180 252",
    400: "129 140 248", 500: "99 102 241", 600: "79 70 229", 700: "67 56 202",
    800: "55 48 163", 900: "49 46 129", 950: "30 27 75",
};

/** Assemble a palette's preview chip: accent, secondary + three neutral tones. */
function swatchesFor(neutral: Ramp, accent: Ramp, secondary: string): string[] {
    return [
        channelsToHex(accent[500]),
        secondary,
        channelsToHex(neutral[200]),
        channelsToHex(neutral[500]),
        channelsToHex(neutral[800]),
    ];
}

function palette(
    id: string,
    neutral: Ramp,
    accent: Ramp,
    secondary: string,
): Palette {
    return { id, neutral, accent, secondary, swatches: swatchesFor(neutral, accent, secondary) };
}

// Each non-default palette pairs a warm/cool neutral tint (hue, low saturation)
// with a vibrant accent + secondary. The neutral tint re-hues zinc's proven
// lightness ramp, so surfaces/text keep the default theme's contrast.
export const PALETTES: Palette[] = [
    // Default — the current zinc + indigo look, verbatim (no tint).
    palette("indigo", ZINC, INDIGO, "#818cf8"),
    // The user-provided reference palette: warm taupe neutrals, coral accent
    // (#e76f51), teal secondary (#9bc8ca).
    palette("clay", tintedNeutral(28), accentRamp("#e76f51"), "#9bc8ca"),
    palette("amber", tintedNeutral(38), accentRamp("#d97706"), "#f59e0b"),
    palette("lime", tintedNeutral(75, 0.85), accentRamp("#65a30d"), "#a3e635"),
    palette("emerald", tintedNeutral(155, 0.9), accentRamp("#10b981"), "#34d399"),
    palette("teal", tintedNeutral(175, 0.9), accentRamp("#0d9488"), "#2dd4bf"),
    palette("ocean", tintedNeutral(205, 0.95), accentRamp("#0ea5e9"), "#38bdf8"),
    palette("sapphire", tintedNeutral(222, 0.9), accentRamp("#3b82f6"), "#60a5fa"),
    palette("violet", tintedNeutral(265), accentRamp("#8b5cf6"), "#a78bfa"),
    palette("fuchsia", tintedNeutral(305, 0.95), accentRamp("#c026d3"), "#e879f9"),
    palette("rose", tintedNeutral(350), accentRamp("#f43f5e"), "#fb7185"),
    palette("crimson", tintedNeutral(356), accentRamp("#dc2626"), "#f87171"),
];

/** Resolve a palette by id, falling back to the default when unknown. */
export function getPalette(id: string | null | undefined): Palette {
    return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Convert a "r g b" channel string into a `#rrggbb` hex (for swatches / charts). */
export function channelsToHex(channels: string): string {
    const parts = channels.trim().split(/\s+/).map((n) => Number(n));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "#000000";
    return (
        "#" +
        parts.map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")
    );
}
