import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
    // Pre-transform the entry chain AND every lazily-loaded view on startup,
    // so neither the first page hit nor the first «شروع آزمون» click pays the
    // on-demand transform cost after a dev-server restart.
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/index.css",
        "./src/components/views/**/*.tsx",
      ],
    },
    proxy: {
      // Literal IPs, not `localhost`: resolving localhost on Windows tries
      // ::1 first and stalls ~250ms on every fresh upstream connection.
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
