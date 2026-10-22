import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In sviluppo la UI (5173) inoltra /api al backend locale (8000).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
