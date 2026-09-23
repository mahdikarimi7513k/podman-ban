/**
 * Seam: exam pause/resume.
 *
 * Exit freezes the wall clock (pausedAt stamps the moment); resume shifts
 * startedAt forward by the away time, so re-entry continues with the exact
 * frozen remainder instead of bleeding it. Answers stay valid because the
 * server deadline derives from startedAt.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { http, login } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

async function makeSession(
  admin: Awaited<ReturnType<typeof login>>,
  tag: string,
): Promise<{ moduleId: string; questionId: string }> {
  const book = await admin.post("/api/admin/books").send({ title: `PAUSE-Book-${tag}` })
  expect(book.status).toBe(201)

  const bookId = String(book.body.book.id)
  const mod = await admin.post("/api/admin/modules").send({ bookId, title: `PAUSE-Mod-${tag}` })
  expect(mod.status).toBe(201)

  const moduleId = String(mod.body.module.id)

  const q = await admin.post("/api/admin/questions").send({
    moduleId,
    text: "سوال توقف؟",
    options: ["الف", "ب"],
    correctOption: 0,
  })

  expect(q.status).toBe(201)

  return { moduleId, questionId: String(q.body.question.id) }
}

async function startFor(
  stu: Awaited<ReturnType<typeof login>>,
  moduleId: string,
): Promise<string> {
  const started = await stu.post("/api/exam/start").send({ moduleId, durationMin: 20 })

  expect(started.status).toBe(200)

  return String(started.body.session.sessionId)
}

describe("exam pause/resume", () => {
  it("freezes the remainder on pause and restores it on resume", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const stu = await login("sec_student", PASSWORD)
    const { moduleId, questionId } = await makeSession(admin, "freeze")
    const sessionId = await startFor(stu, moduleId)

    const loaded = await stu.get(`/api/exam/${sessionId}`)
    expect(loaded.status).toBe(200)
    expect(loaded.body.session.pausedAt).toBeNull()

    const before = Number(loaded.body.session.remainingSec)
    expect(before).toBeGreaterThan(1150)
    expect(before).toBeLessThanOrEqual(1200)

    const paused = await stu.post(`/api/exam/${sessionId}/pause`).send({})
    expect(paused.status).toBe(200)
    expect(paused.body.remainingSec).toBeGreaterThan(1150)

    const parked = await stu.get(`/api/exam/${sessionId}`)
    expect(parked.body.session.pausedAt).not.toBeNull()
    expect(parked.body.session.remainingSec).toBe(paused.body.remainingSec)

    const resumed = await stu.post(`/api/exam/${sessionId}/resume`).send({})
    expect(resumed.status).toBe(200)
    expect(resumed.body.session.pausedAt).toBeNull()
    expect(new Date(resumed.body.session.startedAt).getTime()).toBeGreaterThan(
      new Date(loaded.body.session.startedAt).getTime(),
    )
    // The frozen remainder survives the round trip (seconds of drift max).
    expect(Math.abs(Number(resumed.body.session.remainingSec) - Number(paused.body.remainingSec))).toBeLessThanOrEqual(5)

    // The shifted deadline keeps answers valid after resume.
    const answered = await stu.post(`/api/exam/${sessionId}/answer`).send({
      questionId,
      selectedOption: 0,
    })

    expect(answered.status).toBe(200)
    expect(answered.body.ok).toBe(true)
  })

  it("pause is idempotent, resume requires a paused session", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const stu = await login("sec_student", PASSWORD)
    const { moduleId } = await makeSession(admin, "idem")
    const sessionId = await startFor(stu, moduleId)

    const cold = await stu.post(`/api/exam/${sessionId}/resume`).send({})
    expect(cold.status).toBe(422)

    const first = await stu.post(`/api/exam/${sessionId}/pause`).send({})
    expect(first.status).toBe(200)

    const second = await stu.post(`/api/exam/${sessionId}/pause`).send({})
    expect(second.status).toBe(200)
    expect(second.body.pausedAt).toBe(first.body.pausedAt)
  })

  it("rejects strangers, guests, and finished sessions", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const stu = await login("sec_student", PASSWORD)
    const kar = await login("sec_kardanesh", PASSWORD)
    const { moduleId } = await makeSession(admin, "guards")
    const sessionId = await startFor(stu, moduleId)

    const stranger = await kar.post(`/api/exam/${sessionId}/pause`).send({})
    expect(stranger.status).toBe(404)

    const guest = await http.post(`/api/exam/${sessionId}/pause`).send({})
    expect(guest.status).toBe(401)

    const finished = await stu.post(`/api/exam/${sessionId}/finish`).send({})
    expect(finished.status).toBe(200)

    const late = await stu.post(`/api/exam/${sessionId}/pause`).send({})
    expect(late.status).toBe(403)
  })
})
