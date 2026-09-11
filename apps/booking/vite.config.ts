import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Guest-facing booking engine. It only ever calls the public API routes
// (/public/:hotelSlug/...). In dev we proxy everything under /api to the API,
// stripping the prefix, so the browser only talks to the Vite origin. In
// production, set VITE_API_URL to the API's base URL instead.
//
// Runs on 5174 so it can sit alongside the staff app (5173) and API (3001).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
