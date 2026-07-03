import defaultTheme from "tailwindcss/defaultTheme.js";

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter", ...defaultTheme.fontFamily.sans],
            },
            colors: {
                surface: {
                    primary: "rgb(var(--neutral-900) / <alpha-value>)",
                    secondary: "rgb(var(--neutral-800) / 0.8)",
                    tertiary: "rgb(var(--neutral-800) / <alpha-value>)",
                },
                border: {
                    subtle: "rgb(255 255 255 / 0.06)",
                    DEFAULT: "rgb(255 255 255 / 0.1)",
                },
                text: {
                    primary: "rgb(var(--neutral-50) / <alpha-value>)",
                    secondary: "rgb(var(--neutral-400) / <alpha-value>)",
                    tertiary: "rgb(var(--neutral-500) / <alpha-value>)",
                },
                accent: {
                    primary: "rgb(var(--accent-500) / <alpha-value>)",
                    hover: "rgb(var(--accent-400) / <alpha-value>)",
                    subtle: "rgb(var(--accent-500) / 0.1)",
                },
                // Whole-app theming: the `zinc` (neutral) and `indigo` (accent)
                // families are redefined to read the `--neutral-*` / `--accent-*`
                // CSS vars, so selecting a palette (see src/theme) re-themes
                // every background, surface, text and accent at runtime with no
                // per-component edits. Defaults live in src/index.css `:root`
                // (zinc + indigo) as a no-JS fallback.
                zinc: {
                    50: "rgb(var(--neutral-50) / <alpha-value>)",
                    100: "rgb(var(--neutral-100) / <alpha-value>)",
                    200: "rgb(var(--neutral-200) / <alpha-value>)",
                    300: "rgb(var(--neutral-300) / <alpha-value>)",
                    400: "rgb(var(--neutral-400) / <alpha-value>)",
                    500: "rgb(var(--neutral-500) / <alpha-value>)",
                    600: "rgb(var(--neutral-600) / <alpha-value>)",
                    700: "rgb(var(--neutral-700) / <alpha-value>)",
                    800: "rgb(var(--neutral-800) / <alpha-value>)",
                    900: "rgb(var(--neutral-900) / <alpha-value>)",
                    950: "rgb(var(--neutral-950) / <alpha-value>)",
                },
                indigo: {
                    50: "rgb(var(--accent-50) / <alpha-value>)",
                    100: "rgb(var(--accent-100) / <alpha-value>)",
                    200: "rgb(var(--accent-200) / <alpha-value>)",
                    300: "rgb(var(--accent-300) / <alpha-value>)",
                    400: "rgb(var(--accent-400) / <alpha-value>)",
                    500: "rgb(var(--accent-500) / <alpha-value>)",
                    600: "rgb(var(--accent-600) / <alpha-value>)",
                    700: "rgb(var(--accent-700) / <alpha-value>)",
                    800: "rgb(var(--accent-800) / <alpha-value>)",
                    900: "rgb(var(--accent-900) / <alpha-value>)",
                    950: "rgb(var(--accent-950) / <alpha-value>)",
                },
            },
            borderRadius: {
                "radius-sm": "6px",
                "radius-md": "8px",
                "radius-lg": "12px",
                "radius-xl": "16px",
            },
            boxShadow: {
                "glow-sm": "0 0 12px -3px rgb(var(--accent-500) / 0.2)",
                "glow-md": "0 0 20px -5px rgb(var(--accent-500) / 0.3)",
            },
            keyframes: {
                shake: {
                    "0%, 100%": { transform: "translateX(0)" },
                    "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
                    "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
                },
                slideDown: {
                    "0%": { opacity: "0", transform: "translateY(-8px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                shimmer: {
                    "0%": { backgroundPosition: "200% 50%" },
                    "100%": { backgroundPosition: "-200% 50%" },
                },
            },
            animation: {
                shake: "shake 0.5s ease-in-out",
                slideDown: "slideDown 0.3s ease-out",
                shimmer: "shimmer 3s ease-in-out infinite",
            },
        },
    },
    plugins: [],
}
