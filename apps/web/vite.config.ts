import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev: front na :5173, zapytania /api idą do API w Dockerze (:8000), więc ciasteczka
// działają jak w produkcji (jeden adres). Produkcja: `npm run build`, pliki serwuje API.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
