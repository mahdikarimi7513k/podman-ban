/**
 * Seam: refresh-token grace window.
 * A token superseded moments ago (parallel refresh, or a mobile client
 * killed before persisting the rotated cookies) must not nuke the family:
 * presenting it once more re-issues ACCESS ONLY while a live successor
 * exists. Logout-revoked and stale tokens keep the strict family-nuke.
 */
import { describe, it, expect } from "vitest"
import { createHash } from "crypto"
import type { Response } from "supertest"
import { eq } from "drizzle-orm"
import { db } from "../src/lib/db.js"
import { refreshTokens } from "../src/lib/db/schema.js"
import { http, login, ensureUser } from "./helpers.js"
import { PASSWORD } from "./fixtures.js"

const XFF = "9.9.9.9"

function jarOf(res: Response): string {
  // SAFETY: supertest exposes set-cookie as string|string[]; only the
  // cookie pairs are read out.
  const raw = res.headers["set-cookie"] as string | string[]
  const list = Array.isArray(raw) ? raw : [raw]

  return list.map((c) => String(c).split(";")[0]).join("; ")
}

function cookieOf(jar: string, name: string): string {
  return jar
    .split("; ")
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1) ?? ""
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex")

async function loginJar(username: string, password: string): Promise<string> {
  const res = await http
    .post("/api/auth/login")
    .set("X-Forwarded-For", XFF)
    .send({ username, password })

  expect(res.status).toBe(200)

  return jarOf(res)
}

describe("refresh grace window", () => {
  it("replaying a just-rotated token re-issues access without killing the family", async () => {
    await ensureUser("grace_user", "STUDENT", "FANI_HERFEI")
    const jar1 = await loginJar("grace_user", PASSWORD)

    const rotated = await http.post("/api/auth/refresh").set("Cookie", jar1).send()
    expect(rotated.status).toBe(200)
    const jar2 = jarOf(rotated)
    expect(cookieOf(jar2, "pb_refresh")).not.toBe("")

    // Same old cookie again (flush-loss / parallel race) → grace, not nuke.
    const replay = await http.post("/api/auth/refresh").set("Cookie", jar1).send()
    expect(replay.status).toBe(200)
    // Access-only: no fresh refresh cookie is minted on the grace path.
    expect(cookieOf(jarOf(replay), "pb_refresh")).toBe("")

    // Family survived: the current refresh token still rotates normally.
    const again = await http.post("/api/auth/refresh").set("Cookie", jar2).send()
    expect(again.status).toBe(200)
    expect(cookieOf(jarOf(again), "pb_refresh")).not.toBe("")
  })

  it("replaying a logged-out token stays dead (no grace without a successor)", async () => {
    const authed = await login("grace_user", PASSWORD)
    const jar1 = authed.cookies

    await authed.post("/api/auth/logout", {})

    const replay = await http.post("/api/auth/refresh").set("Cookie", jar1).send()
    expect(replay.status).toBe(401)
  })

  it("replaying a long-superseded token nukes the family", async () => {
    await ensureUser("grace_user2", "STUDENT", "FANI_HERFEI")
    const jar1 = await loginJar("grace_user2", PASSWORD)

    const rotated = await http.post("/api/auth/refresh").set("Cookie", jar1).send()
    expect(rotated.status).toBe(200)
    const jar2 = jarOf(rotated)

    // Age the revocation past the grace window.
    const oldHash = sha256(cookieOf(jar1, "pb_refresh"))
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(refreshTokens.tokenHash, oldHash))
      .run()

    const replay = await http.post("/api/auth/refresh").set("Cookie", jar1).send()
    expect(replay.status).toBe(401)

    // Family is dead: even the current token no longer rotates.
    const dead = await http.post("/api/auth/refresh").set("Cookie", jar2).send()
    expect(dead.status).toBe(401)
  })
})
