import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The API has no CORS configured and serves its routes at the root
// (/auth, /reservations, ...). In dev we proxy everything under /api to it,
// stripping the prefix, so the browser only ever talks to the Vite origin.
// In production, set VITE_API_URL to the API's base URL instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
