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
                    primary: "rgb(24 24 27)", // zinc-900
                    secondary: "rgb(39 39 42 / 0.8)", // zinc-800/80
                    tertiary: "rgb(39 39 42)", // zinc-800
                },
                border: {
                    subtle: "rgb(255 255 255 / 0.06)",
                    DEFAULT: "rgb(255 255 255 / 0.1)",
                },
                text: {
                    primary: "rgb(250 250 250)", // zinc-50
                    secondary: "rgb(161 161 170)", // zinc-400
                    tertiary: "rgb(113 113 122)", // zinc-500
                },
                accent: {
                    primary: "rgb(99 102 241)", // indigo-500
                    hover: "rgb(129 140 248)", // indigo-400
                    subtle: "rgb(99 102 241 / 0.1)", // indigo-500/10
                },
            },
            borderRadius: {
                "radius-sm": "6px",
                "radius-md": "8px",
                "radius-lg": "12px",
                "radius-xl": "16px",
            },
            boxShadow: {
                "glow-sm": "0 0 12px -3px rgb(99 102 241 / 0.2)",
                "glow-md": "0 0 20px -5px rgb(99 102 241 / 0.3)",
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
