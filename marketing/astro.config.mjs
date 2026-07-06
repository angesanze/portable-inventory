// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Static marketing site for varasto.rocks. Output → dist/, served by the "www"
// Firebase Hosting target (see firebase.json). The app itself lives on the
// separate "app" target (app.varasto.rocks).
export default defineConfig({
  site: "https://varasto.rocks",
  vite: {
    plugins: [tailwindcss()],
  },
});
