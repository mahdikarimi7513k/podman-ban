/**
 * Seam: admin-created users, the registration gate, and the external
 * credential-verify API (POST /api/external/verify with X-API-Key).
 */
import { describe, it, expect, beforeAll } from "vitest"
import { http, login } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

const uniq = (p: string) => `${p}${Date.now() % 1000000}`

let emailCounter = 0

/** Unique deliverable address per created user (same style as uniq). */
const uniqEmail = (): string => {
  emailCounter += 1

  return `t${Date.now() % 1000000}-${emailCounter}@mail.com`
}

describe("registration gate", () => {
  it("blocks public sign-up when closed, allows admin-created users", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const u = uniq("gateuser")

    await admin.put("/api/admin/config").send({ registrationOpen: false })
    try {
      const blocked = await http
        .post("/api/auth/register")
        .send({ name: "گیت", username: u, password: "Gate-Pass-123", email: uniqEmail(), field: "FANI_HERFEI" })
      expect(blocked.status).toBe(403)
      expect(blocked.body.code).toBe("REGISTRATION_CLOSED")

      // Admin creation bypasses the gate…
      const created = await admin
        .post("/api/admin/users")
        .send({ name: "گیت", username: u, password: "Gate-Pass-123", email: uniqEmail(), field: "FANI_HERFEI" })
      expect(created.status).toBe(201)

      // …and those credentials log in normally.
      const s = await login(u, "Gate-Pass-123")
      const me = await s.get("/api/auth/me")
      expect(me.status).toBe(200)
    } finally {
      await admin.put("/api/admin/config").send({ registrationOpen: true })
    }

    // Gate open again → public sign-up works.
    const open = await http
      .post("/api/auth/register")
      .send({ name: "باز", username: uniq("openuser"), password: "Open-Pass-123", email: uniqEmail(), field: "KARDANESH" })
    expect(open.status).toBe(201)
  })
})

describe("registration closed message", () => {
  it("persists the admin's custom message and exposes it publicly", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const put = await admin
      .put("/api/admin/config")
      .send({ registrationMessage: "ثبت‌نام از اول مهر" })
    expect(put.status).toBe(200)

    const pub = await http.get("/api/config")
    expect(pub.body.state.registrationMessage).toBe("ثبت‌نام از اول مهر")

    // Student must not be able to set it.
    const stu = await login("sec_student", PASSWORD)
    const forbidden = await stu.get("/api/admin/config")
    expect([401, 403]).toContain(forbidden.status)

    await admin.put("/api/admin/config").send({ registrationMessage: "" })
  })
})

describe("admin user creation", () => {
  it("creates STUDENTs, rejects duplicates, blocks non-admins", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const u = uniq("mkuser")

    const res = await admin
      .post("/api/admin/users")
      .send({ name: "ساخته‌شده", username: u, password: "Mk-Pass-123", email: uniqEmail(), field: "FANI_HERFEI" })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe("STUDENT")
    expect(res.body.user).not.toHaveProperty("passwordHash")

    const dup = await admin
      .post("/api/admin/users")
      .send({ name: "تکراری", username: u, password: "Mk-Pass-123", email: uniqEmail(), field: "FANI_HERFEI" })
    expect(dup.status).toBe(409)

    const stu = await login("sec_student", PASSWORD)
    const forbidden = await stu
      .post("/api/admin/users")
      .send({ name: "x", username: uniq("nope"), password: "Nope-Pass-123", field: "FANI_HERFEI" })
    expect([401, 403]).toContain(forbidden.status)
  })
})

describe("external verify API", () => {
  it("verifies credentials with a valid key, rejects bad key/creds", async () => {
    const admin = await login("sec_admin", PASSWORD)

    // Disabled by default → 503 (use a dummy key; absence of config matters).
    const off = await http
      .post("/api/external/verify")
      .set("x-api-key", "pbx_dummy")
      .send({ username: "sec_student", password: PASSWORD })
    expect([401, 503]).toContain(off.status)

    const issued = await admin.post("/api/admin/external-api/key")
    expect(issued.status).toBe(201)
    const key = issued.body.apiKey as string
    expect(key.startsWith("pbx_")).toBe(true)

    const ok = await http
      .post("/api/external/verify")
      .set("x-api-key", key)
      .send({ username: "sec_student", password: PASSWORD })
    expect(ok.status).toBe(200)
    expect(ok.body.ok).toBe(true)
    expect(ok.body.user.username).toBe("sec_student")
    expect(ok.body.user).not.toHaveProperty("passwordHash")

    const badPass = await http
      .post("/api/external/verify")
      .set("x-api-key", key)
      .send({ username: "sec_student", password: "wrong-pass-1" })
    expect(badPass.status).toBe(401)
    expect(badPass.body.ok).toBe(false)

    const badKey = await http
      .post("/api/external/verify")
      .set("x-api-key", "pbx_wrong")
      .send({ username: "sec_student", password: PASSWORD })
    expect(badKey.status).toBe(401)
    expect(badKey.body.code).toBe("INVALID_API_KEY")

    // Optional field: matching passes, mismatching fails loudly.
    const withField = await http
      .post("/api/external/verify")
      .set("x-api-key", key)
      .send({ username: "sec_student", password: PASSWORD, field: "FANI_HERFEI" })
    expect(withField.status).toBe(200)
    expect(withField.body.user.field).toBe("FANI_HERFEI")

    const wrongField = await http
      .post("/api/external/verify")
      .set("x-api-key", key)
      .send({ username: "sec_student", password: PASSWORD, field: "KARDANESH" })
    expect(wrongField.status).toBe(401)
    expect(wrongField.body.code).toBe("FIELD_MISMATCH")

    const badField = await http
      .post("/api/external/verify")
      .set("x-api-key", key)
      .send({ username: "sec_student", password: PASSWORD, field: "NOPE" })
    expect(badField.status).toBe(422)

    // Revoke → service off again.
    const revoked = await admin.delete("/api/admin/external-api/key")
    expect(revoked.status).toBe(200)
    const after = await http
      .post("/api/external/verify")
      .set("x-api-key", key)
      .send({ username: "sec_student", password: PASSWORD })
    expect(after.status).toBe(503)
  })
})

describe("external register API", () => {
  it("creates a STUDENT with all four fields, usable everywhere, even when the gate is closed", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const issued = await admin.post("/api/admin/external-api/key")
    const key = issued.body.apiKey as string
    const u = uniq("extreg")

    await admin.put("/api/admin/config").send({ registrationOpen: false })
    try {
      // Missing field → 422 (all of name/username/password/field required).
      const missing = await http
        .post("/api/external/register")
        .set("x-api-key", key)
        .send({ username: u, password: "Ext-Reg-123" })
      expect(missing.status).toBe(422)

      const created = await http
        .post("/api/external/register")
        .set("x-api-key", key)
        .send({ name: "ثبت خارجی", username: u, password: "Ext-Reg-123", email: uniqEmail(), field: "KARDANESH" })
      expect(created.status).toBe(201)
      expect(created.body.ok).toBe(true)
      expect(created.body.user.role).toBe("STUDENT")
      expect(created.body.user.field).toBe("KARDANESH")
      expect(created.body.user).not.toHaveProperty("passwordHash")

      // Duplicate → 409.
      const dup = await http
        .post("/api/external/register")
        .set("x-api-key", key)
        .send({ name: "تکراری", username: u, password: "Ext-Reg-123", email: uniqEmail(), field: "KARDANESH" })
      expect(dup.status).toBe(409)
      expect(dup.body.code).toBe("USERNAME_TAKEN")

      // The new credentials work for normal login AND external verify.
      await login(u, "Ext-Reg-123")
      const v = await http
        .post("/api/external/verify")
        .set("x-api-key", key)
        .send({ username: u, password: "Ext-Reg-123", field: "KARDANESH" })
      expect(v.status).toBe(200)
      expect(v.body.ok).toBe(true)

      // Bad key → 401 without touching the DB path.
      const badKey = await http
        .post("/api/external/register")
        .set("x-api-key", "pbx_wrong")
        .send({ name: "x", username: uniq("nope"), password: "Nope-Pass-123", field: "FANI_HERFEI" })
      expect(badKey.status).toBe(401)
    } finally {
      await admin.put("/api/admin/config").send({ registrationOpen: true })
      await admin.delete("/api/admin/external-api/key")
    }
  })
})
