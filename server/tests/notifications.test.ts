/**
 * Seam: admin broadcast notifications.
 *   POST /api/admin/notifications  — send (ADMIN + CONTENT_ADMIN, CSRF)
 *   GET  /api/admin/notifications  — list recent
 *   DELETE /api/admin/notifications/:id — delete
 *   GET  /api/notifications/latest — PUBLIC latest broadcast (or null)
 */
import { describe, it, expect, beforeAll } from "vitest"
import { http, login } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

describe("broadcast notifications", () => {
  it("admin sends → public latest exposes it → delete clears it", async () => {
    const admin = await login("sec_admin", PASSWORD)

    const created = await admin
      .post("/api/admin/notifications")
      .send({ title: "اعلامیه آزمون", body: "آزمون فردا ساعت ۹ برگزار می‌شود" })

    expect(created.status).toBe(201)
    expect(created.body.notification.title).toBe("اعلامیه آزمون")

    const id = String(created.body.notification.id)

    // Public, no auth — same class as the banner in /config.
    const pub = await http.get("/api/notifications/latest")

    expect(pub.status).toBe(200)
    expect(pub.body.notification?.id).toBe(id)

    const me = await admin.get("/api/auth/me")

    expect(pub.body.notification?.createdBy).toBe(me.body.user.id)

    const list = await admin.get("/api/admin/notifications")
    expect(list.status).toBe(200)
    expect(list.body.notifications.some((n: { id: string }) => n.id === id)).toBe(true)

    const del = await admin.delete(`/api/admin/notifications/${id}`)
    expect(del.status).toBe(200)

    const gone = await http.get("/api/notifications/latest")
    expect(gone.body.notification).toBeNull()
  })

  it("rejects empty title/body with 422", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const bad = await admin.post("/api/admin/notifications").send({ title: "  ", body: "" })
    expect(bad.status).toBe(422)
  })

  it("student cannot send or list; strangers get 401", async () => {
    const stu = await login("sec_student", PASSWORD)

    const forbidden = await stu
      .post("/api/admin/notifications")
      .send({ title: "x", body: "y" })

    expect(forbidden.status).toBe(403)

    const listDenied = await stu.get("/api/admin/notifications")
    expect(listDenied.status).toBe(403)

    const anon = await http.post("/api/admin/notifications").send({ title: "x", body: "y" })
    expect(anon.status).toBe(401)
  })

  it("content admin can send (same trust level as banner content)", async () => {
    const content = await login("sec_content", PASSWORD)

    const created = await content
      .post("/api/admin/notifications")
      .send({ title: "اطلاعیه", body: "متن اطلاعیه" })

    expect(created.status).toBe(201)

    await content.delete(`/api/admin/notifications/${String(created.body.notification.id)}`)
  })

  it("delete of unknown id is 404", async () => {
    const admin = await login("sec_admin", PASSWORD)

    const res = await admin.delete("/api/admin/notifications/does-not-exist")

    expect(res.status).toBe(404)
  })
})
