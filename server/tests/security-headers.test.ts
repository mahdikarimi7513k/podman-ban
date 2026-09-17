/**
 * Regression tests for the API security posture.
 *
 * Seams: these drive the real middleware stack through buildApp() (extracted
 * from index.ts precisely so these tests can exist). DB-touching flows
 * (login lockout keying, relay secret) have no clean seam here yet — they are
 * locked down by scripts/sec-loop against a running stack instead.
 */
import { describe, expect, it, afterEach } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { setAuthCookies } from "../src/lib/auth/cookies.js"

const app = buildApp()

afterEach(() => {
  delete process.env.COOKIE_SAMESITE
  delete process.env.COOKIE_SECURE
})

/** Capture res.cookie() calls without Express or a DB. */
function capturedCookies() {
  const out: Array<{ name: string; opts: Record<string, unknown> }> = []
  const res = {
    cookie: (name: string, _v: string, opts: Record<string, unknown>) => {
      out.push({ name, opts })
    },
  }
  setAuthCookies(res as never, { accessToken: "a", refreshToken: "r", csrfToken: "c" })
  return out
}

describe("security headers", () => {
  it("locks API documents down with CSP", async () => {
    const res = await request(app).get("/api/config")
    expect(res.status).toBe(200)
    const csp = res.headers["content-security-policy"]
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it("sets Cross-Origin-Embedder-Policy everywhere", async () => {
    const res = await request(app).get("/health")
    expect(res.headers["cross-origin-embedder-policy"]).toBe("require-corp")
  })
})

describe("cookie SameSite posture (Capacitor APK)", () => {
  it("defaults to SameSite=Strict", async () => {
    for (const c of capturedCookies()) {
      expect(c.opts.sameSite).toBe("strict")
    }
  })

  it("COOKIE_SAMESITE=none forces Secure on every cookie (browsers reject otherwise)", async () => {
    process.env.COOKIE_SAMESITE = "none"
    process.env.COOKIE_SECURE = "false" // must not win over the force-on
    const cookies = capturedCookies()
    expect(cookies).toHaveLength(3)
    for (const c of cookies) {
      expect(c.opts.sameSite).toBe("none")
      expect(c.opts.secure).toBe(true)
    }
  })
})

describe("CORP split (API readable cross-origin, pages locked)", () => {
  it("serves cross-origin CORP on /api and /health", async () => {
    for (const p of ["/api/config", "/health"]) {
      const res = await request(app).get(p)
      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin")
    }
  })

  it("keeps same-origin CORP off the API", async () => {
    const res = await request(app).get("/definitely-not-a-route")
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin")
  })
})

describe("CORS allowlist", () => {
  it("never reflects an unknown origin (no ACAO header)", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example")
    expect(res.status).toBe(200)
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("allows the Capacitor WebView origins by default", async () => {
    for (const origin of ["capacitor://localhost", "http://localhost", "https://localhost"]) {
      const res = await request(app).get("/health").set("Origin", origin)
      expect(res.headers["access-control-allow-origin"]).toBe(origin)
    }
  })

  it("allows an origin from the allowlist", async () => {
    process.env.ALLOWED_ORIGINS = "http://localhost:3000"
    try {
      // buildApp reads ALLOWED_ORIGINS at factory time
      const res = await request(buildApp())
        .get("/health")
        .set("Origin", "http://localhost:3000")
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000")
      expect(res.headers["access-control-allow-credentials"]).toBe("true")
    } finally {
      delete process.env.ALLOWED_ORIGINS
    }
  })
})
