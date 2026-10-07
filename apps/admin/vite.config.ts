import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Platform-owner admin console. Runs on 5175 (staff 5173, booking 5174) and
// proxies /api to the API, which serves the owner-only /platform/* routes.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5175,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
