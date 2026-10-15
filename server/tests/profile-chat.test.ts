/**
 * Profile self-service + support ordering E2E (HTTP seam).
 *
 * 1. PUT /api/user/profile edits name/avatar, validates, needs CSRF+auth.
 * 2. GET /api/support/conversations sorts by last activity (new message
 *    bumps to top), and GET /messages keeps the newest 200 chronologically.
 */
import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { login, ensureUser, app } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

describe("user profile", () => {
  it("updates name and avatar", async () => {
    await ensureUser("prof_student", "STUDENT", "FANI_HERFEI")
    const s = await login("prof_student", PASSWORD)
    const avatar = "data:image/png;base64,iVBORw0KGgo="
    const res = await s.put("/api/user/profile", { name: "سارا محمدی", avatarBase64: avatar })
    expect(res.status).toBe(200)
    expect(res.body.user.name).toBe("سارا محمدی")
    expect(res.body.user.avatarBase64).toBe(avatar)
    const me = await s.get("/api/auth/me")
    expect(me.body.user.name).toBe("سارا محمدی")
    expect(me.body.user.avatarBase64).toBe(avatar)
  })

  it("clears the avatar with null", async () => {
    await ensureUser("prof_clear", "STUDENT", "KARDANESH")
    const s = await login("prof_clear", PASSWORD)
    await s.put("/api/user/profile", { avatarBase64: "data:image/png;base64,iVBORw0KGgo=" })
    const res = await s.put("/api/user/profile", { avatarBase64: null })
    expect(res.status).toBe(200)
    expect(res.body.user.avatarBase64).toBeNull()
  })

  it("deletes its own account with password + DELETE confirm", async () => {
    await ensureUser("prof_bye", "STUDENT", "FANI_HERFEI")
    const s = await login("prof_bye", PASSWORD)

    expect((await s.delete("/api/user/account", { password: "wrong", confirm: "DELETE" })).status).toBe(422)
    expect((await s.delete("/api/user/account", { password: PASSWORD })).status).toBe(422)

    const res = await s.delete("/api/user/account", { password: PASSWORD, confirm: "DELETE" })

    expect(res.status).toBe(200)

    const me = await s.get("/api/auth/me")

    expect(me.status).toBe(401)
  })

  it("validates name and avatar", async () => {
    await ensureUser("prof_bad", "STUDENT", "FANI_HERFEI")
    const s = await login("prof_bad", PASSWORD)
    expect((await s.put("/api/user/profile", { name: "x" })).status).toBe(422)
    expect((await s.put("/api/user/profile", { avatarBase64: "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==" })).status).toBe(422)
    expect((await s.put("/api/user/profile", {})).status).toBe(422)
  })

  it("requires auth and CSRF", async () => {
    const { http } = await import("./helpers.js")
    expect((await http.put("/api/user/profile").send({ name: "x" })).status).toBe(401)
    await ensureUser("prof_csrf", "STUDENT", "FANI_HERFEI")
    const s = await login("prof_csrf", PASSWORD)
    const noCsrf = await request(app).put("/api/user/profile").set("Cookie", s.cookies).send({ name: "بدون توکن" })
    expect(noCsrf.status).toBe(403)
  })
})

describe("support ordering", () => {
  it("serves an admin's own thread without userId", async () => {
    await ensureUser("conv_adminself", "ADMIN", "FANI_HERFEI")
    const admin = await login("conv_adminself", PASSWORD)
    const sent = await admin.post("/api/support/messages", { text: "یادداشت مدیر" })

    expect(sent.status).toBe(201)

    const list = await admin.get("/api/support/messages")

    expect(list.status).toBe(200)

    // SAFETY: endpoint contract returns { messages: [...] }; a shape change
    // fails the assertion below instead of passing silently.
    expect((list.body.messages as Array<{ text: string }>).some((m) => m.text === "یادداشت مدیر")).toBe(true)
  })

  it("bumps the newest conversation to the top", async () => {
    await ensureUser("conv_admin", "ADMIN", "FANI_HERFEI")
    await ensureUser("conv_first", "STUDENT", "FANI_HERFEI")
    await ensureUser("conv_second", "STUDENT", "FANI_HERFEI")
    const admin = await login("conv_admin", PASSWORD)
    const first = await login("conv_first", PASSWORD)
    const second = await login("conv_second", PASSWORD)

    await first.post("/api/support/messages", { text: "سلام اول" })
    await new Promise((r) => setTimeout(r, 25))
    await second.post("/api/support/messages", { text: "سلام دوم" })

    const list = await admin.get("/api/support/conversations")

    expect(list.status).toBe(200)

    // SAFETY: endpoint contract returns { conversations: [...] }; a shape
    // change fails the assertions below instead of passing silently.
    const convs = list.body.conversations as Array<{ id: string; lastMessage: { text: string } | null }>
    const idxFirst = convs.findIndex((c) => c.lastMessage?.text === "سلام اول")
    const idxSecond = convs.findIndex((c) => c.lastMessage?.text === "سلام دوم")
    expect(idxSecond).toBeGreaterThanOrEqual(0)
    expect(idxFirst).toBeGreaterThanOrEqual(0)
    // Second messaged later → sorts before first.
    expect(idxSecond).toBeLessThan(idxFirst)

    // Admin replies to the older thread → it jumps back to the top.
    // Distinct timestamps: SQLite stores ms precision, so space the writes
    // to keep the ordering assertion deterministic.
    await new Promise((r) => setTimeout(r, 25))
    const firstConv = convs.find((c) => c.lastMessage?.text === "سلام اول")
    await admin.post("/api/support/messages", { text: "پاسخ مدیر", userId: firstConv?.id })
    const relist = await admin.get("/api/support/conversations")

    // SAFETY: same endpoint contract as above.
    const top = (relist.body.conversations as Array<{ lastMessage: { text: string } | null }>)[0]
    expect(top.lastMessage?.text).toBe("پاسخ مدیر")
  })
})
