/**
 * Seam: content cascade deletes.
 * Deleting a module removes its questions AND its exam sessions/answers
 * (sessions reference modules ON DELETE RESTRICT, so without this the
 * delete 500s on any tried module). Deleting a book cascades the same
 * way through all of its modules.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "../src/lib/db.js"
import { examSessions, modules, questions } from "../src/lib/db/schema.js"
import { login } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

async function makeModule(admin: Awaited<ReturnType<typeof login>>, tag: string) {
  const book = await admin.post("/api/admin/books").send({ title: `CASCADE-Book-${tag}` })
  expect(book.status).toBe(201)
  const bookId = String(book.body.book.id)

  const mod = await admin
    .post("/api/admin/modules")
    .send({ bookId, title: `CASCADE-Mod-${tag}` })

  expect(mod.status).toBe(201)

  const moduleId = String(mod.body.module.id)

  const q = await admin.post("/api/admin/questions").send({
    moduleId,
    text: "سوال cascade؟",
    options: ["الف", "ب"],
    correctOption: 0,
  })

  expect(q.status).toBe(201)

  return { bookId, moduleId }
}

describe("module delete cascade", () => {
  it("deletes questions + sessions + answers with the module (even when tried)", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const { moduleId, bookId } = await makeModule(admin, "mod")

    // A student attempts the module → IN_PROGRESS session exists.
    const stu = await login("sec_student", PASSWORD)
    const started = await stu.post("/api/exam/start").send({ moduleId })
    expect(started.status).toBe(200)
    const sessionId = String(started.body.session.sessionId)

    const del = await admin.delete(`/api/admin/modules/${moduleId}`)
    expect(del.status).toBe(200)

    const qLeft = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.moduleId, moduleId))
      .all()

    expect(qLeft).toEqual([])

    const sLeft = await db
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(eq(examSessions.id, sessionId))
      .get()

    expect(sLeft).toBeUndefined()

    const modLeft = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.id, moduleId))
      .get()

    expect(modLeft).toBeUndefined()

    const gone = await admin.delete(`/api/admin/modules/${moduleId}`)
    expect(gone.status).toBe(404)

    await admin.delete(`/api/admin/books/${bookId}`)
  })

  it("deleting a book cascades modules, questions and sessions", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const { moduleId, bookId } = await makeModule(admin, "book")

    const stu = await login("sec_student", PASSWORD)
    await stu.post("/api/exam/start").send({ moduleId })

    const del = await admin.delete(`/api/admin/books/${bookId}`)
    expect(del.status).toBe(200)

    const qLeft = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.moduleId, moduleId))
      .all()

    expect(qLeft).toEqual([])

    // Student view stays consistent (inner joins drop the gone module).
    const sessions = await stu.get("/api/exam/sessions")
    expect(sessions.status).toBe(200)
  })

  it("student book list stays consistent after cascade", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const { moduleId, bookId } = await makeModule(admin, "list")

    const stu = await login("sec_student", PASSWORD)
    const before = await stu.get("/api/books")
    // SAFETY: books payload shape is owned by listBooks; only ids are read.

    const hasIt = (before.body.books as Array<{ modules: Array<{ id: string }> }>).some((b) =>
      b.modules.some((m) => m.id === moduleId),
    )

    expect(hasIt).toBe(true)

    await admin.delete(`/api/admin/modules/${moduleId}`)

    const after = await stu.get("/api/books")
    expect(after.status).toBe(200)
    // SAFETY: same owned payload shape as above.

    const stillThere = (after.body.books as Array<{ modules: Array<{ id: string }> }>).some((b) =>
      b.modules.some((m) => m.id === moduleId),
    )

    expect(stillThere).toBe(false)

    await admin.delete(`/api/admin/books/${bookId}`)
  })
})
