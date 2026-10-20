import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import pkg from "./package.json" with { type: "json" };

// Każdy build ma własny identyfikator. Aplikacja porównuje go z /version.json i, gdy serwer
// ma nowszy, proponuje odświeżenie (PWA na Androidzie potrafi żyć w pamięci kilka dni).
const BUILD = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Warsaw" }).slice(0, 16);

const versionFile = (): Plugin => ({
  name: "pixgym-version",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: pkg.version, build: BUILD }) });
  },
});

// Dev: front na :5173, zapytania /api idą do API w Dockerze (:8000), więc ciasteczka
// działają jak w produkcji (jeden adres). Produkcja: `npm run build`, pliki serwuje API.
export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: JSON.stringify(BUILD) },
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
