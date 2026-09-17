/**
 * Seam: study-field changes apply immediately + auth cookies are http-safe.
 *
 * 1. An admin flips a student's field; the student's EXISTING session must
 *    serve the new field's books on the very next request (the JWT caches the
 *    old field — the DB is authoritative).
 * 2. Login Set-Cookie must NOT carry the Secure flag on plain http (browsers
 *    drop Secure cookies there: login looks fine, every later call 401s).
 *    COOKIE_SECURE=true opts back into Secure for HTTPS production.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { http, login, ensureUser } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

describe("study-field change takes effect without re-login", () => {
  it("serves the new field's books on the existing session", async () => {
    await ensureUser("fieldflip", "STUDENT", "FANI_HERFEI")
    const stu = await login("fieldflip", PASSWORD)
    const admin = await login("sec_admin", PASSWORD)

    const before = await stu.get("/api/books")
    expect(before.status).toBe(200)
    const titlesBefore = (before.body.books as { title: string }[]).map((b) => b.title)
    expect(titlesBefore).toContain("SEC-Fani-Book")

    const me = await stu.get("/api/auth/me")
    const id = me.body.user.id as string
    const flip = await admin.put(`/api/admin/users/${id}`).send({ field: "KARDANESH" })
    expect(flip.status).toBe(200)
    expect(flip.body.user.field).toBe("KARDANESH")

    try {
      const after = await stu.get("/api/books")
      expect(after.status).toBe(200)
      const titlesAfter = (after.body.books as { title: string }[]).map((b) => b.title)
      expect(titlesAfter).not.toContain("SEC-Fani-Book")
      expect(titlesAfter).toContain("SEC-Shared-Book")
    } finally {
      await admin.put(`/api/admin/users/${id}`).send({ field: "FANI_HERFEI" })
    }
  })
})

describe("auth cookie Secure flag", () => {
  it("omits Secure on http dev so the browser keeps the session", async () => {
    delete process.env.COOKIE_SECURE
    const res = await http
      .post("/api/auth/login")
      .set("X-Forwarded-For", "10.20.30.40")
      .send({ username: "sec_student", password: PASSWORD })
    expect(res.status).toBe(200)
    const setCookie = res.headers["set-cookie"] as unknown as string[]
    expect(setCookie.join(";")).not.toMatch(/;\s*Secure/i)
  })

  it("restores Secure when COOKIE_SECURE=true (https production)", async () => {
    process.env.COOKIE_SECURE = "true"
    try {
      const res = await http
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.20.30.41")
        .send({ username: "sec_student", password: PASSWORD })
      expect(res.status).toBe(200)
      const setCookie = res.headers["set-cookie"] as unknown as string[]
      expect(setCookie.join(";")).toMatch(/;\s*Secure/i)
    } finally {
      delete process.env.COOKIE_SECURE
    }
  })
})
