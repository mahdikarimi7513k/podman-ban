/**
 * Regression locks for POST /api/auth/refresh rate limiting.
 *
 * The refresh endpoint used to have no throttle at all: every guess cost
 * one JWT verify + one indexed DB lookup, so it doubled as an oracle for
 * stolen/forged refresh tokens. It now mirrors the login hardening
 * (per-IP bucket + socket-IP floor) at 60/5min + 300/5min — a real client
 * (1 refresh per 15min access lifetime + 1 retry per 401) never trips it.
 */
import { describe, expect, it } from "vitest"
import { http } from "./helpers.js"
import { REFRESH_TTL_SEC } from "../src/lib/auth/jwt.js"

// Unique spoofed source for this file (TRUST_PROXY=true): the per-IP bucket
// is keyed off it, so hammering here can never throttle other files.
const HAMMER_XFF = "10.200.0.9"

const OTHER_XFF = "10.200.0.10"

function refreshWithGarbage(xff: string) {
  return http.post("/api/auth/refresh").set("X-Forwarded-For", xff).set("Cookie", "pb_refresh=garbage").send()
}

describe("refresh rate limit", () => {
  it("answers 401 (not 429) while under quota", async () => {
    const res = await refreshWithGarbage(HAMMER_XFF)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe("نشست نامعتبر است — دوباره وارد شوید")
  })

  it("trips to 429 with retryAfterSec after 60 tries from one IP", async () => {
    let last = 0

    for (let i = 0; i < 61; i++) {
      const res = await refreshWithGarbage(HAMMER_XFF)

      last = res.status

      if (i < 60) {
        expect(res.status).toBe(401)
      }
    }

    expect(last).toBe(429)

    const probe = await refreshWithGarbage(HAMMER_XFF)

    expect(probe.status).toBe(429)
    expect(Number.isInteger(probe.body.retryAfterSec)).toBe(true)
    expect(probe.body.error).toBe("تلاش‌های بیش از حد")
  })

  it("a different source IP still has its own quota", async () => {
    const res = await refreshWithGarbage(OTHER_XFF)

    expect(res.status).toBe(401)
  })
})

describe("refresh lifetime", () => {
  it("defaults to 30 days so intermittent users stay logged in", () => {
    // Regression pin: a 7-day window logged weekly users out "out of
    // nowhere". Rotation still extends this for active users; override
    // per deployment with JWT_REFRESH_TTL_SEC (seconds).
    expect(REFRESH_TTL_SEC).toBe(30 * 24 * 3600)
  })
})
