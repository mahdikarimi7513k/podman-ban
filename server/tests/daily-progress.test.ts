/**
 * Seam: daily-progress isolation.
 *
 * Regression: a user with no exam sessions got the whole site's daily
 * answer count (drizzle's and() drops undefined conditions, so the
 * user-scoping term vanished) — everyone else's activity completed
 * their daily goal. Zero sessions must mean zero answers, always.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { login, ensureUser } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

async function makeModule(admin: Awaited<ReturnType<typeof login>>): Promise<string> {
  const book = await admin.post("/api/admin/books").send({ title: "PROG-Book" })
  expect(book.status).toBe(201)

  const bookId = String(book.body.book.id)
  const mod = await admin.post("/api/admin/modules").send({ bookId, title: "PROG-Mod" })
  expect(mod.status).toBe(201)

  const moduleId = String(mod.body.module.id)

  const q = await admin.post("/api/admin/questions").send({
    moduleId,
    text: "سوال پیشرفت؟",
    options: ["الف", "ب"],
    correctOption: 0,
  })

  expect(q.status).toBe(201)

  return moduleId
}

describe("daily progress isolation", () => {
  it("a sessionless user sees 0 even while others answer today", async () => {
    const admin = await login("sec_admin", PASSWORD)
    await ensureUser("prog_idle", "STUDENT", "FANI_HERFEI")
    await ensureUser("prog_busy", "STUDENT", "FANI_HERFEI")
    const moduleId = await makeModule(admin)

    const busy = await login("prog_busy", PASSWORD)
    const started = await busy.post("/api/exam/start").send({ moduleId, durationMin: 20 })
    expect(started.status).toBe(200)

    const sessionId = String(started.body.session.sessionId)
    const loaded = await busy.get(`/api/exam/${sessionId}`)
    expect(loaded.status).toBe(200)

    const qid = String(loaded.body.questions[0].id)

    const answered = await busy.post(`/api/exam/${sessionId}/answer`).send({
      questionId: qid,
      selectedOption: 0,
    })

    expect(answered.status).toBe(200)

    const idle = await login("prog_idle", PASSWORD)
    const idleRes = await idle.get("/api/user/daily-progress")
    expect(idleRes.status).toBe(200)
    expect(idleRes.body.todayAnswered).toBe(0)

    const busyRes = await busy.get("/api/user/daily-progress")
    expect(busyRes.status).toBe(200)
    expect(busyRes.body.todayAnswered).toBeGreaterThanOrEqual(1)
  })

  it("heatmap already isolates sessionless users (contrast lock)", async () => {
    const idle = await login("prog_idle", PASSWORD)
    const res = await idle.get("/api/user/heatmap?range=7")

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
  })
})
