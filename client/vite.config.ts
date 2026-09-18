import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

// Document CSP for the SPA shell (also sent as a response header by the
// server — the meta tag is what protects the Capacitor APK, whose files
// never see server headers). connect-src gains the APK's API origin at
// build time; a bare 'self' would silently break API/socket calls in the app.
function spaCsp(): string {
  const apiBase = process.env.VITE_API_BASE?.replace(/\/$/, "")
  let apiOrigin = ""
  if (apiBase) {
    try {
      apiOrigin = new URL(apiBase).origin
    } catch {
      apiOrigin = ""
    }
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    // style attributes set at runtime by React/Tailwind need unsafe-inline.
    "style-src 'self' 'unsafe-inline'",
    // question images are base64 data URLs.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${apiOrigin && apiOrigin !== "null" ? ` ${apiOrigin}` : ""}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ")
}

// Injects the CSP <meta> as the first child of <head> — build only. The dev
// server injects its own inline preamble, which a document CSP would block.
function injectSpaCsp(): Plugin {
  return {
    name: "inject-spa-csp",
    apply: "build",
    transformIndexHtml(html: string): string {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${spaCsp()}" />`
      return html.includes("<head>")
        ? html.replace("<head>", `<head>\n    ${tag}`)
        : html
    },
  }
}

export default defineConfig({
  plugins: [react(), injectSpaCsp()],
  build: {
    sourcemap: false,
    minify: "esbuild",
    chunkSizeWarningLimit: 600,
  },
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
