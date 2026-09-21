/**
 * Express app factory — separated from index.ts so tests can drive the real
 * middleware stack (headers, CORS, routes) without binding a port.
 */
import "./lib/load-env.js"
import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"
import { authRouter } from "./routes/auth.routes.js"
import { examRouter } from "./routes/exam.routes.js"
import { userRouter } from "./routes/user.routes.js"
import { supportRouter } from "./routes/support.routes.js"
import { archiveRouter } from "./routes/archive.routes.js"
import { adminRouter } from "./routes/admin.routes.js"
import { externalRouter } from "./routes/external.routes.js"
import { getSession } from "./lib/auth/index.js"
import { getAppState } from "./lib/remote-config.js"

/**
 * Origins allowed to call the API with credentials (comma-separated env).
 * capacitor://localhost (iOS) and http://localhost (Android) are the
 * Capacitor WebView origins — capacitor://localhost (iOS), http://localhost
 * (Android with androidScheme http) and https://localhost (Android default
 * since Capacitor 3, androidScheme is https unless overridden). A real website
 * cannot spoof its Origin header, so listing these app-only schemes keeps the
 * browser allowlist tight while the APK works without extra server config.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000,capacitor://localhost,http://localhost,https://localhost")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

// Proxy contract (single trusted hop):
//  - Exactly ONE proxy (Caddy / Passenger / Apache) sits in front and sets
//    X-Forwarded-For; `trust proxy = 1` and the rightmost-entry rule in
//    clientIp() both assume this. More hops need a larger trust count.
//  - With TRUST_PROXY=true the server binds loopback by default (index.ts),
//    so the socket peer IS that proxy. Direct connections must never be
//    able to spoof their IP via headers — and as a second floor, every
//    brute-forceable route also keys a socket-IP bucket (socketIp) that
//    survives X-Forwarded-For rotation.
const TRUST_PROXY = process.env.TRUST_PROXY === "true"

export function buildApp(): express.Express {
  const app = express()

  // claude-red fast-check: hide framework fingerprint (info disclosure).
  app.disable("x-powered-by")

  app.set("trust proxy", TRUST_PROXY ? 1 : false)

  // --- middleware ---
  app.use(cookieParser())

  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser tools send no Origin — allow. Anything not allowlisted gets
        // no ACAO header at all, so credentialed cross-site calls fail in browsers.
        if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true)
        else cb(null, false)
      },
      credentials: true,
    }),
  )
  app.use(express.json({ limit: "3mb" }))

  // --- security headers ---
  app.use((req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
    // Dynamic JSON API must never be cached (auth tokens, PII, exam answers).
    if (req.path.startsWith("/api") || req.path === "/health") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
      res.setHeader("Pragma", "no-cache")
    }
    // The strict document-lock CSP applies to API responses only. When the same
    // app serves the SPA (CLIENT_DIST), HTML needs scripts/styles inline.
    if (req.path.startsWith("/api") || req.path === "/health") {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      )
    }
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()")
    res.setHeader("X-DNS-Prefetch-Control", "off")
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
    // API/JSON answers "cross-origin": Chromium enforces CORP even on CORS
    // fetches, so "same-origin" here would make the Capacitor APK's reads fail
    // while adding nothing over the CORS allowlist + auth cookies for a
    // credentialed JSON API. Documents/pages keep the strict value.
    res.setHeader(
      "Cross-Origin-Resource-Policy",
      req.path.startsWith("/api") || req.path === "/health" ? "cross-origin" : "same-origin",
    )
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none")
    next()
  })

  // --- health check ---
  app.get("/health", (_req, res) => res.json({ ok: true, service: "podman-ban-api" }))

  // --- maintenance lock (SERVER-side; the client gate is cosmetic) ---
  // While siteLocked: students/others get 503 everywhere except auth flows,
  // health and the admin API. Staff pass through.
  app.use(async (req, res, next) => {
    if (req.method === "OPTIONS") return next()
    const p = req.path
    const exempt =
      p === "/health" ||
      // Public, read-only, and required by the client to render the lock screen
      (p === "/api/config" && req.method === "GET") ||
      // Public, read-only admin broadcast shown on boot (same class as /config)
      (p === "/api/notifications/latest" && req.method === "GET") ||
      p.startsWith("/api/auth") ||
      p.startsWith("/api/admin") ||
      // Stateless credential check (API-key auth) — an auth flow like login.
      p.startsWith("/api/external")
    if (exempt) return next()
    try {
      const state = await getAppState()
      if (!state.siteLocked) return next()
      const user = await getSession(req)
      if (user && (user.role === "ADMIN" || user.role === "CONTENT_ADMIN")) return next()
      res.status(503).json({
        error: state.lockMessage || "سایت موقتاً در دست تعمیر است",
        code: "SITE_LOCKED",
      })
    } catch {
      next() // config read failure must not take the whole API down
    }
  })

  // --- routes ---
  app.use("/api", authRouter)        // /api/auth/*, /api/csrf, /api/config
  app.use("/api", examRouter)        // /api/books, /api/exam/*
  app.use("/api/user", userRouter)   // /api/user/*
  app.use("/api/support", supportRouter) // /api/support/*
  app.use("/api/archive", archiveRouter) // /api/archive
  app.use("/api/admin", adminRouter) // /api/admin/*
  app.use("/api", externalRouter) // /api/external/verify (API-key auth)

  // Unknown /api/* must not leak the Express HTML error page (framework
  // fingerprint + wrong content-type) — JSON 404 instead. Placed after every
  // /api router; CORS preflights never reach here (the cors middleware
  // answers OPTIONS itself).
  app.use("/api", (_req: express.Request, res: express.Response) => {
    res.status(404).json({ error: "یافت نشد" })
  })

  // --- generic error handler (no stack leak to clients) ---
  // Express default sends HTML + stack in dev; production must get JSON only.
  // ponytail: one handler, no per-route try/catch sprawl.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("[api-error]", err instanceof Error ? err.message : err)
      if (res.headersSent) return
      res.status(500).json({ error: "خطای داخلی سرور" })
    },
  )

  return app
}