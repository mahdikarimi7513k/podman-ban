import { existsSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
import express from "express"
import "./lib/load-env.js"
import { buildApp } from "./app.js"
import { attachChatSocket } from "./lib/chat-socket.js"

// cPanel/Passenger assigns PORT; local dev falls back to 3001.
const PORT = Number(process.env.PORT ?? 3001)
const BIND_HOST = process.env.BIND_HOST || undefined

const app = buildApp()

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ??
  "http://localhost:3000,http://127.0.0.1:3000,capacitor://localhost,http://localhost,https://localhost"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

// Document CSP for the SPA shell — same-origin variant. The server only
// serves same-origin web traffic (X-Frame/CORP guards already come from the
// app middleware); the Capacitor APK gets its wider connect-src from the
// <meta> tag baked at build time, since local files never see these headers.
const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ")

// The HTML shell is the biggest attack surface and must never be cached —
// hashed assets keep their long max-age instead (F7: stale shells broke
// deploys for up to a day).
function spaShellHeaders(res: express.Response): void {
  res.setHeader("Content-Security-Policy", SPA_CSP)
  res.setHeader("Cache-Control", "no-cache")
}

// Single-app deployment (cPanel): serve the built SPA from the same origin so
// cookies stay first-party. Enabled by CLIENT_DIST=1 or an existing dist dir.
const here =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
const clientDist = resolve(here, "..", "..", "client", "dist")
if (process.env.CLIENT_DIST === "1" || existsSync(clientDist)) {
  // dotfiles denied so .htaccess/.env can never leak via static; index:false
  // because the SPA fallback below serves index.html explicitly.
  app.use(
    express.static(clientDist, {
      index: false,
      dotfiles: "deny",
      maxAge: "1d",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) spaShellHeaders(res)
      },
    }),
  )
  // SPA fallback — plain middleware (Express 5 has no "*" route syntax)
  app.use((req, res, next) => {
    if (req.method !== "GET") return next()
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next()
    spaShellHeaders(res)
    res.sendFile(resolve(clientDist, "index.html"))
  })
}

const done = () => {
  console.log(`[podman-ban-api] listening on ${BIND_HOST ?? "0.0.0.0"}:${PORT}`)
}
const server = BIND_HOST ? app.listen(PORT, BIND_HOST, done) : app.listen(PORT, done)

attachChatSocket(server, ALLOWED_ORIGINS)
