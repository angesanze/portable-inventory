import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { renderWithI18n } from "../../test-utils/i18n-wrapper";
import { ThemeProvider } from "../ThemeProvider";
import { AppearanceSettings } from "../../features/settings/appearance";
import { applyPaletteVars, getStoredPaletteId, PALETTE_STORAGE_KEY } from "../applyPalette";
import { getPalette } from "../palettes";

const root = () => document.documentElement;
const accent500 = (id: string) => getPalette(id).accent[500];
const neutral950 = (id: string) => getPalette(id).neutral[950];

function renderAppearance() {
    return renderWithI18n(
        <ThemeProvider>
            <AppearanceSettings />
        </ThemeProvider>,
    );
}

describe("theme / palettes", () => {
    beforeEach(() => {
        localStorage.clear();
        root().removeAttribute("style");
    });

    it("writes both the neutral and accent ramps to CSS variables", () => {
        applyPaletteVars("clay");
        expect(root().style.getPropertyValue("--accent-500").trim()).toBe(accent500("clay"));
        expect(root().style.getPropertyValue("--accent-50").trim()).toBe(getPalette("clay").accent[50]);
        // The neutral scale themes the background/surfaces — the key fix.
        expect(root().style.getPropertyValue("--neutral-950").trim()).toBe(neutral950("clay"));
        expect(root().style.getPropertyValue("--neutral-800").trim()).toBe(getPalette("clay").neutral[800]);
    });

    it("keeps the default (indigo) palette on the exact zinc + indigo ramps", () => {
        expect(accent500("indigo")).toBe("99 102 241"); // indigo-500
        expect(neutral950("indigo")).toBe("9 9 11"); // zinc-950 (unchanged background)
        expect(getPalette("indigo").neutral[800]).toBe("39 39 42"); // zinc-800
    });

    it("tints neutrals while preserving zinc's dark-theme contrast", () => {
        const chan = (s: string) => s.split(" ").map(Number);
        const clay = getPalette("clay");
        // Vibrant colors come straight from the reference palette.
        expect(clay.accent[500]).toBe("231 111 81"); // #e76f51 coral
        expect(clay.secondary).toBe("#9bc8ca"); // teal
        // Neutrals are tinted (differ from zinc) ...
        expect(clay.neutral[800]).not.toBe(getPalette("indigo").neutral[800]);
        // ... but keep a strong dark→light span so surfaces/text stay readable.
        expect(Math.max(...chan(clay.neutral[950]))).toBeLessThan(60);
        expect(Math.min(...chan(clay.neutral[50]))).toBeGreaterThan(200);
    });

    it("falls back to the default id for empty or unknown values", () => {
        expect(getStoredPaletteId()).toBe("indigo");
        localStorage.setItem(PALETTE_STORAGE_KEY, "not-a-palette");
        expect(getStoredPaletteId()).toBe("indigo");
        localStorage.setItem(PALETTE_STORAGE_KEY, "rose");
        expect(getStoredPaletteId()).toBe("rose");
    });
});

describe("AppearanceSettings", () => {
    beforeEach(() => {
        localStorage.clear();
        root().removeAttribute("style");
    });

    it("renders a selectable card for each palette", () => {
        renderAppearance();
        expect(screen.getByTestId("palette-indigo")).toBeTruthy();
        expect(screen.getByTestId("palette-clay")).toBeTruthy();
        expect(screen.getByTestId("palette-emerald")).toBeTruthy();
    });

    it("marks the active palette (default indigo) as checked", () => {
        renderAppearance();
        expect(screen.getByTestId("palette-indigo").getAttribute("aria-checked")).toBe("true");
        expect(screen.getByTestId("palette-clay").getAttribute("aria-checked")).toBe("false");
    });

    it("selecting a palette persists it and applies the neutral + accent vars", () => {
        renderAppearance();
        fireEvent.click(screen.getByTestId("palette-clay"));
        expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe("clay");
        expect(screen.getByTestId("palette-clay").getAttribute("aria-checked")).toBe("true");
        expect(root().style.getPropertyValue("--accent-500").trim()).toBe(accent500("clay"));
        expect(root().style.getPropertyValue("--neutral-950").trim()).toBe(neutral950("clay"));
    });

    it("hydrates the initial selection from localStorage", () => {
        localStorage.setItem(PALETTE_STORAGE_KEY, "ocean");
        renderAppearance();
        expect(screen.getByTestId("palette-ocean").getAttribute("aria-checked")).toBe("true");
        expect(root().style.getPropertyValue("--neutral-950").trim()).toBe(neutral950("ocean"));
    });
});
