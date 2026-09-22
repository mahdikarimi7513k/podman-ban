/**
 * Admin routes — content management + super-admin management.
 *
 * RBAC:
 *   - books / modules / questions / archive / stats  → requireAdmin
 *     (ADMIN + CONTENT_ADMIN)
 *   - config / users / institutions                  → requireSuperAdmin
 *     (ADMIN only)
 *
 * All mutations are CSRF-protected.
 *
 * Endpoints (mounted under /api/admin):
 *   GET    /books               list books + modules
 *   POST   /books               create book            (CSRF)
 *   PUT    /books/:id           update book            (CSRF)
 *   DELETE /books/:id           delete book            (CSRF)
 *
 *   POST   /modules              create module          (CSRF)
 *   PUT    /modules/:id          update module          (CSRF)
 *   DELETE /modules/:id          delete module          (CSRF)
 *
 *   GET    /questions            list (?moduleId=...)
 *   POST   /questions            create question        (CSRF)
 *   POST   /questions/bulk       bulk import            (CSRF)  ← before /:id
 *   GET    /questions/:id         single
 *   PUT    /questions/:id         update                (CSRF)
 *   DELETE /questions/:id         delete                (CSRF)
 *
 *   GET    /archive               list files
 *   POST   /archive               create file           (CSRF)
 *   PUT    /archive/:id           update file           (CSRF)
 *   DELETE /archive/:id           delete file           (CSRF)
 *
 *   GET    /config                remote config          (super)
 *   PUT    /config                update remote config   (super, CSRF)
 *
 *   GET    /stats                 dashboard counts
 *
 *   GET    /institutions          list                  (super)
 *   POST   /institutions          create                (super, CSRF)
 *   PUT    /institutions/:id      update                (super, CSRF)
 *   DELETE /institutions/:id      delete                (super, CSRF)
 *
 *   GET    /users                  list users           (super)
 *   POST   /users                  create STUDENT       (super, CSRF)
 *   PUT    /users/:id              update user           (super, CSRF)
 *   DELETE /users/:id              delete user           (super, CSRF)
 *
 *   GET    /external-api           key status            (super)
 *   POST   /external-api/key       issue new key         (super, CSRF)
 *   DELETE /external-api/key       revoke key            (super, CSRF)
 *
 *   GET    /notifications          list recent broadcasts
 *   POST   /notifications          send broadcast        (CSRF)
 *   DELETE /notifications/:id      delete broadcast      (CSRF)
 */

import { Router } from "express"
import { z } from "zod"
import { randomBytes } from "crypto"
import express from "express"
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "../lib/db.js"
import {
  answers,
  archiveFiles,
  books,
  chatMessages,
  examSessions,
  institutions,
  modules,
  notifications,
  questions,
  users,
} from "../lib/db/schema.js"
import {
  requireAdmin,
  requireSuperAdmin,
  requireCsrf,
  getSession,
  hashPassword,
  sha256,
} from "../lib/auth/index.js"
import {
  saveArchiveUpload,
  deleteArchiveUploads,
  isArchiveKind,
} from "../lib/archive-files.js"
import { getAppState, updateAppState } from "../lib/remote-config.js"
import {
  bookCreateSchema,
  bookUpdateSchema,
  moduleCreateSchema,
  moduleUpdateSchema,
  questionCreateSchema,
  questionUpdateSchema,
  archiveCreateSchema,
  archiveUpdateSchema,
  notificationCreateSchema,
  remoteConfigUpdateSchema,
  registerSchema,
  parseBody,
} from "../lib/validations.js"

export const adminRouter = Router()

/**
 * Delete everything under the given modules: answers, sessions, questions.
 * Explicit (not FK-reliant): examSessions.moduleId is ON DELETE RESTRICT,
 * so deleting a tried module would otherwise 500 — and deleting questions
 * first still leaves sessions pointing at the module. Student history of
 * the deleted modules goes with them (the UI confirm says so), including
 * the users.totalTests counter (incremented per finish), so report cards
 * read as if those exams never happened.
 */
async function deleteModuleContents(moduleIds: string[]): Promise<void> {
  if (moduleIds.length === 0) return

  const finishedByUser = await db
    .select({ userId: examSessions.userId, n: count() })
    .from(examSessions)
    .where(
      and(
        inArray(examSessions.moduleId, moduleIds),
        eq(examSessions.status, "FINISHED"),
      ),
    )
    .groupBy(examSessions.userId)
    .all()

  const sessIds = await db
    .select({ id: examSessions.id })
    .from(examSessions)
    .where(inArray(examSessions.moduleId, moduleIds))
    .all()

  if (sessIds.length > 0) {
    const ids = sessIds.map((s) => s.id)
    await db.delete(answers).where(inArray(answers.sessionId, ids)).run()
    await db.delete(examSessions).where(inArray(examSessions.id, ids)).run()
  }

  await db.delete(questions).where(inArray(questions.moduleId, moduleIds)).run()

  for (const f of finishedByUser) {
    await db
      .update(users)
      .set({ totalTests: sql`max(0, ${users.totalTests} - ${f.n})` })
      .where(eq(users.id, f.userId))
      .run()
  }
}

// =====================================================================
// Books
// =====================================================================

adminRouter.get("/books", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  const bookRows = await db.query.books.findMany({
    orderBy: [asc(books.order), asc(books.title)],
    with: {
      modules: {
        orderBy: asc(modules.order),
        columns: { id: true, title: true, description: true, order: true },
      },
    },
  })
  const counts =
    bookRows.length > 0
      ? await db
          .select({ moduleId: questions.moduleId, n: count() })
          .from(questions)
          .groupBy(questions.moduleId)
          .all()
      : []
  const countByModule = new Map(counts.map((c) => [c.moduleId, c.n]))
  res.json({
    books: bookRows.map((b) => ({
      ...b,
      modules: b.modules.map((m) => ({
        ...m,
        questionCount: countByModule.get(m.id) ?? 0,
      })),
    })),
  })
})

adminRouter.post("/books", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const data = parseBody(bookCreateSchema, req.body, res)
  if (!data) return
  const { title, field, order } = data
  const book = await db.insert(books).values({ title, field, order }).returning().get()
  res.status(201).json({ book })
})

adminRouter.put("/books/:id", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const data = parseBody(bookUpdateSchema, req.body, res)
  if (!data) return
  const exists = await db.select({ id: books.id }).from(books).where(eq(books.id, id)).get()
  if (!exists) {
    res.status(404).json({ error: "کتاب یافت نشد" })
    return
  }
  const book = await db.update(books).set(data).where(eq(books.id, id)).returning().get()
  res.json({ book })
})

adminRouter.delete("/books/:id", async (req, res) => {
  const user = await requireAdmin(req, res)

  if (!user) return

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const { id } = req.params

  const bookMods = await db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.bookId, id))
    .all()

  if (bookMods.length > 0) {
    await deleteModuleContents(bookMods.map((m) => m.id))
    await db.delete(modules).where(eq(modules.bookId, id)).run()
  }

  const deleted = await db.delete(books).where(eq(books.id, id)).returning({ id: books.id }).get()

  if (!deleted) {
    res.status(404).json({ error: "کتاب یافت نشد" })

    return
  }

  res.json({ ok: true })
})

// =====================================================================
// Modules
// =====================================================================

adminRouter.post("/modules", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const data = parseBody(moduleCreateSchema, req.body, res)
  if (!data) return
  const { bookId, title, description, order } = data
  const book = await db.select({ id: books.id }).from(books).where(eq(books.id, bookId)).get()
  if (!book) {
    res.status(404).json({ error: "کتاب یافت نشد" })
    return
  }
  const mod = await db
    .insert(modules)
    .values({ bookId, title, description, order })
    .returning()
    .get()
  res.status(201).json({ module: mod })
})

adminRouter.put("/modules/:id", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const data = parseBody(moduleUpdateSchema, req.body, res)
  if (!data) return
  const exists = await db.select({ id: modules.id }).from(modules).where(eq(modules.id, id)).get()
  if (!exists) {
    res.status(404).json({ error: "پودمان یافت نشد" })
    return
  }
  const mod = await db.update(modules).set(data).where(eq(modules.id, id)).returning().get()
  res.json({ module: mod })
})

adminRouter.delete("/modules/:id", async (req, res) => {
  const user = await requireAdmin(req, res)

  if (!user) return

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const { id } = req.params
  const exists = await db.select({ id: modules.id }).from(modules).where(eq(modules.id, id)).get()

  if (!exists) {
    res.status(404).json({ error: "پودمان یافت نشد" })

    return
  }

  await deleteModuleContents([id])
  await db.delete(modules).where(eq(modules.id, id)).run()
  res.json({ ok: true })
})

// =====================================================================
// Questions (with bulk import)
// =====================================================================

const bulkQuestionSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctOption: z.number().int().min(0).max(5),
  explanation: z.string().trim().max(1000).optional(),
})

const bulkImportSchema = z.object({
  moduleId: z.string().min(1),
  questions: z.array(bulkQuestionSchema).min(1).max(100),
})

// GET list (?moduleId=...)
adminRouter.get("/questions", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  const moduleId = req.query.moduleId as string | undefined
  if (!moduleId) {
    res.status(403).json({ error: "moduleId لازم است" })
    return
  }
  const qRows = await db
    .select({
      id: questions.id,
      text: questions.text,
      imageBase64: questions.imageBase64,
      options: questions.options,
      correctOption: questions.correctOption,
      explanation: questions.explanation,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .where(eq(questions.moduleId, moduleId))
    .orderBy(asc(questions.createdAt))
    .all()
  res.json({
    questions: qRows.map((q) => ({
      ...q,
      options: JSON.parse(q.options),
      hasImage: !!q.imageBase64,
    })),
  })
})

// POST single
adminRouter.post("/questions", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const data = parseBody(questionCreateSchema, req.body, res)
  if (!data) return
  const { moduleId, text, imageBase64, options, correctOption, explanation } =
    data
  const mod = await db.select({ id: modules.id }).from(modules).where(eq(modules.id, moduleId)).get()
  if (!mod) {
    res.status(404).json({ error: "پودمان یافت نشد" })
    return
  }
  if (correctOption >= options.length) {
    res.status(403).json({ error: "گزینه‌ی صحیح خارج از بازه است" })
    return
  }
  const q = await db
    .insert(questions)
    .values({
      moduleId,
      text,
      imageBase64: imageBase64 ?? null,
      options: JSON.stringify(options),
      correctOption,
      explanation,
    })
    .returning()
    .get()
  res.status(201).json({ question: q })
})

// POST bulk — MUST be defined before /:id so "bulk" isn't captured as :id
adminRouter.post("/questions/bulk", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const data = parseBody(bulkImportSchema, req.body, res)
  if (!data) return
  const { moduleId, questions: incoming } = data

  const mod = await db.select({ id: modules.id }).from(modules).where(eq(modules.id, moduleId)).get()
  if (!mod) {
    res.status(404).json({ error: "پودمان یافت نشد" })
    return
  }

  // validate correctOption within bounds for each question
  for (const q of incoming) {
    if (q.correctOption >= q.options.length) {
      res.status(422).json({
        error: `گزینه‌ی صحیح برای سوال «${q.text.slice(0, 30)}…» خارج از بازه است`,
      })
      return
    }
  }

  const created = await db
    .insert(questions)
    .values(
      incoming.map((q) => ({
        moduleId,
        text: q.text,
        options: JSON.stringify(q.options),
        correctOption: q.correctOption,
        explanation: q.explanation || null,
      })),
    )
    .run()

  res.status(201).json({ count: created.changes })
})

// GET single
adminRouter.get("/questions/:id", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  const { id } = req.params
  const q = await db
    .select({
      id: questions.id,
      moduleId: questions.moduleId,
      text: questions.text,
      imageBase64: questions.imageBase64,
      options: questions.options,
      correctOption: questions.correctOption,
      explanation: questions.explanation,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .where(eq(questions.id, id))
    .get()
  if (!q) {
    res.status(404).json({ error: "یافت نشد" })
    return
  }
  res.json({ question: { ...q, options: JSON.parse(q.options) } })
})

// PUT update
adminRouter.put("/questions/:id", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const data = parseBody(questionUpdateSchema, req.body, res)
  if (!data) return
  const exists = await db.select({ id: questions.id }).from(questions).where(eq(questions.id, id)).get()
  if (!exists) {
    res.status(404).json({ error: "یافت نشد" })
    return
  }
  // Drizzle binds undefined as NULL (unlike Prisma, which skips it), so only
  // include keys the caller actually sent.
  const updateData: Partial<typeof questions.$inferInsert> = {}
  if (data.text !== undefined) updateData.text = data.text
  if (data.imageBase64 !== undefined) updateData.imageBase64 = data.imageBase64 ?? null
  if (data.options !== undefined) updateData.options = JSON.stringify(data.options)
  if (data.correctOption !== undefined) updateData.correctOption = data.correctOption
  if (data.explanation !== undefined) updateData.explanation = data.explanation
  const q = await db.update(questions).set(updateData).where(eq(questions.id, id)).returning().get()
  res.json({ question: q })
})

// DELETE
adminRouter.delete("/questions/:id", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const deleted = await db.delete(questions).where(eq(questions.id, id)).returning({ id: questions.id }).get()
  if (!deleted) {
    res.status(404).json({ error: "سوال یافت نشد" })
    return
  }
  res.json({ ok: true })
})

// =====================================================================
// Archive
// =====================================================================

adminRouter.get("/archive", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  const files = await db.query.archiveFiles.findMany({
    orderBy: [desc(archiveFiles.year), desc(archiveFiles.month)],
    with: { institution: { columns: { id: true, name: true } } },
  })
  res.json({ files })
})

adminRouter.post("/archive", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const data = parseBody(archiveCreateSchema, req.body, res)
  if (!data) return
  // A record needs at least one deliverable (link or a file uploaded after).
  if (!data.fileUrl && !req.body?.uploadQuestion) {
    res.status(422).json({ error: "لینک دانلود بدهید یا در حالت آپلود، فایل سوالات را انتخاب کنید" })
    return
  }
  const file = await db.insert(archiveFiles).values(data).returning().get()
  res.status(201).json({ file })
})

// Raw-bytes upload for one artifact of an existing archive record.
// The client sends the file as the request body (application/octet-stream) and
// the original name in x-file-name — no multipart parsing needed.
// Limit note: the native app ships base64 (+33%), so the wire cap must clear
// 25MB*4/3 ≈ 33.3MB or real 19–25MB files 413. The true 25MB cap is enforced
// after decode in archive-files (MAX_ARCHIVE_FILE_BYTES).
adminRouter.post(
  "/archive/:id/file/:kind",
  express.raw({ type: "*/*", limit: "35mb" }),
  async (req, res) => {
    const user = await requireAdmin(req, res)
    if (!user) return
    if (!(await requireCsrf(user, req))) {
      res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
      return
    }
    const { id } = req.params
    const kind = String(req.params.kind)
    if (!isArchiveKind(kind)) {
      res.status(400).json({ error: "نوع فایل نامعتبر است" })
      return
    }
    const exists = await db.select({ id: archiveFiles.id }).from(archiveFiles).where(eq(archiveFiles.id, id)).get()
    if (!exists) {
      res.status(404).json({ error: "فایل آرشیو یافت نشد" })
      return
    }
    try {
      let originalName = Array.isArray(req.headers["x-file-name"])
        ? req.headers["x-file-name"][0]
        : req.headers["x-file-name"]
      try {
        if (originalName) originalName = decodeURIComponent(originalName)
      } catch {
        /* keep raw value */
      }
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "")
      // Bridge-safe uploads from the native app arrive base64-encoded
      // (see apiUpload) — the native bridge cannot transport ArrayBuffer
      // bodies losslessly. Web keeps sending raw bytes; both meet below.
      const transfer = req.headers["x-transfer-encoding"]
      const transferName = (Array.isArray(transfer) ? transfer[0] : transfer ?? "").toLowerCase()
      const bytes = transferName === "base64" ? Buffer.from(raw.toString("utf8"), "base64") : raw
      const name = saveArchiveUpload(
        id,
        kind,
        bytes,
        originalName,
        req.headers["content-type"],
      )
      const updated = await db
        .update(archiveFiles)
        .set(kind === "question" ? { questionPath: name } : { answerPath: name })
        .where(eq(archiveFiles.id, id))
        .returning()
        .get()
      res.json({ file: updated })
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : "ذخیره‌ی فایل ناموفق بود",
      })
    }
  },
)

adminRouter.put("/archive/:id", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const data = parseBody(archiveUpdateSchema, req.body, res)
  if (!data) return
  const exists = await db.select({ id: archiveFiles.id }).from(archiveFiles).where(eq(archiveFiles.id, id)).get()
  if (!exists) {
    res.status(404).json({ error: "یافت نشد" })
    return
  }
  const file = await db.update(archiveFiles).set(data).where(eq(archiveFiles.id, id)).returning().get()
  res.json({ file })
})

adminRouter.delete("/archive/:id", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const existing = await db.select().from(archiveFiles).where(eq(archiveFiles.id, id)).get()
  if (!existing) {
    res.status(404).json({ error: "فایل یافت نشد" })
    return
  }
  await db.delete(archiveFiles).where(eq(archiveFiles.id, id)).run()
  deleteArchiveUploads(existing)
  res.json({ ok: true })
})

// =====================================================================
// Remote config (super-admin only)
// =====================================================================

adminRouter.get("/config", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  const state = await getAppState()
  res.json({ state })
})

adminRouter.put("/config", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const data = parseBody(remoteConfigUpdateSchema, req.body, res)
  if (!data) return
  const state = await updateAppState(data)
  res.json({ state })
})

// =====================================================================
// Stats
// =====================================================================

adminRouter.get("/stats", async (req, res) => {
  const user = await requireAdmin(req, res)
  if (!user) return
  const usersCount = db.select({ n: count() }).from(users).get()?.n ?? 0
  const studentsCount = db.select({ n: count() }).from(users).where(eq(users.role, "STUDENT")).get()?.n ?? 0
  const booksCount = db.select({ n: count() }).from(books).get()?.n ?? 0
  const modulesCount = db.select({ n: count() }).from(modules).get()?.n ?? 0
  const questionsCount = db.select({ n: count() }).from(questions).get()?.n ?? 0
  const sessionsCount = db
    .select({ n: count() })
    .from(examSessions)
    .where(eq(examSessions.status, "FINISHED"))
    .get()?.n ?? 0
  const archiveCount = db.select({ n: count() }).from(archiveFiles).get()?.n ?? 0
  const unreadChats = db
    .select({ n: count() })
    .from(chatMessages)
    .where(and(eq(chatMessages.sender, "STUDENT"), isNull(chatMessages.readAt)))
    .get()?.n ?? 0
  res.json({
    stats: {
      usersCount,
      studentsCount,
      booksCount,
      modulesCount,
      questionsCount,
      sessionsCount,
      archiveCount,
      unreadChats,
    },
  })
})

// =====================================================================
// Institutions (super-admin only)
// =====================================================================

const institutionCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  order: z.number().int().default(0),
})
const institutionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  order: z.number().int().optional(),
})

adminRouter.get("/institutions", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  const institutionRows = await db.query.institutions.findMany({
    orderBy: asc(institutions.order),
    with: { files: { columns: { id: true } } },
  })
  res.json({
    institutions: institutionRows.map((i) => ({
      id: i.id,
      name: i.name,
      order: i.order,
      fileCount: i.files.length,
    })),
  })
})

adminRouter.post("/institutions", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const data = parseBody(institutionCreateSchema, req.body, res)
  if (!data) return
  const institution = await db.insert(institutions).values(data).returning().get()
  res.status(201).json({ institution })
})

adminRouter.put("/institutions/:id", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const data = parseBody(institutionUpdateSchema, req.body, res)
  if (!data) return
  const exists = await db.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, id)).get()
  if (!exists) {
    res.status(404).json({ error: "یافت نشد" })
    return
  }
  const institution = await db.update(institutions).set(data).where(eq(institutions.id, id)).returning().get()
  res.json({ institution })
})

adminRouter.delete("/institutions/:id", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const deleted = await db.delete(institutions).where(eq(institutions.id, id)).returning({ id: institutions.id }).get()
  if (!deleted) {
    res.status(404).json({ error: "یافت نشد" })
    return
  }
  res.json({ ok: true })
})

// =====================================================================
// Users (super-admin only)
// =====================================================================

const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  field: z.enum(["FANI_HERFEI", "KARDANESH"]).optional(),
  role: z.enum(["STUDENT", "ADMIN", "CONTENT_ADMIN"]).optional(),
})

adminRouter.get("/users", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  const userRows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      field: users.field,
      role: users.role,
      totalTests: users.totalTests,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .all()
  res.json({ users: userRows })
})

// POST /users — admin creates a STUDENT directly (works even when public
// sign-up is closed). The given username/password log in immediately.
adminRouter.post("/users", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const data = parseBody(registerSchema, req.body, res)
  if (!data) return

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, data.username)).get()
  if (existing) {
    res.status(409).json({ error: "این نام کاربری قبلاً ثبت شده است" })
    return
  }

  const emailTaken = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).get()

  if (emailTaken) {
    res.status(409).json({ error: "این ایمیل قبلاً ثبت شده است" })

    return
  }

  const passwordHash = await hashPassword(data.password)
  const created = await db
    .insert(users)
    .values({
      name: data.name,
      username: data.username,
      passwordHash,
      email: data.email,
      field: data.field,
      role: "STUDENT",
    })
    .returning({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      field: users.field,
      role: users.role,
      totalTests: users.totalTests,
      createdAt: users.createdAt,
    })
    .get()
  res.status(201).json({ user: created })
})

adminRouter.put("/users/:id", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params

  const data = parseBody(userUpdateSchema, req.body, res)
  if (!data) return

  const existing = await db.select().from(users).where(eq(users.id, id)).get()
  if (!existing) {
    res.status(404).json({ error: "کاربر یافت نشد" })
    return
  }

  // Don't allow demoting the last ADMIN to any lesser role (STUDENT or
  // CONTENT_ADMIN) — otherwise the system is left with no super-admin.
  if (existing.role === "ADMIN" && data.role !== undefined && data.role !== "ADMIN") {
    const adminCount = db.select({ n: count() }).from(users).where(eq(users.role, "ADMIN")).get()?.n ?? 0

    if (adminCount <= 1) {
      res.status(400).json({ error: "نمی‌توان تنها مدیر را تنزل داد" })

      return
    }
  }

  const updated = await db
    .update(users)
    .set(data)
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      username: users.username,
      name: users.name,
      field: users.field,
      role: users.role,
      totalTests: users.totalTests,
      createdAt: users.createdAt,
    })
    .get()
  res.json({ user: updated })
})

adminRouter.delete("/users/:id", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const { id } = req.params
  const me = await getSession(req)
  // prevent self-deletion
  if (me?.id === id) {
    res.status(403).json({ error: "نمی‌توانید حساب خودتان را حذف کنید" })
    return
  }

  const existing = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).get()
  if (!existing) {
    res.status(404).json({ error: "کاربر یافت نشد" })
    return
  }
  // prevent deleting the last admin
  if (existing.role === "ADMIN") {
    const adminCount = db.select({ n: count() }).from(users).where(eq(users.role, "ADMIN")).get()?.n ?? 0
    if (adminCount <= 1) {
      res.status(400).json({ error: "نمی‌توان تنها مدیر را حذف کرد" })
      return
    }
  }

  await db.delete(users).where(eq(users.id, id)).run()
  res.json({ ok: true })
})

// =====================================================================
// External verify API key (super-admin only)
// The plain key is shown ONCE at issuance; only its sha256 is stored.
// =====================================================================

// GET status — never exposes the key or its hash.
adminRouter.get("/external-api", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  const state = await getAppState()
  res.json({
    enabled: state.externalApiEnabled,
    prefix: state.externalApiKeyPrefix,
  })
})

// POST — issue a fresh key (rotates: the previous key stops working).
adminRouter.post("/external-api/key", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  const apiKey = `pbx_${randomBytes(32).toString("hex")}`
  const prefix = apiKey.slice(0, 12) + "…"
  await updateAppState({
    externalApiKeyHash: sha256(apiKey),
    externalApiKeyPrefix: prefix,
  })
  res.status(201).json({ apiKey, prefix })
})

// DELETE — revoke the key (external verification turns off).
adminRouter.delete("/external-api/key", async (req, res) => {
  const user = await requireSuperAdmin(req, res)
  if (!user) return
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  await updateAppState({ externalApiKeyHash: null, externalApiKeyPrefix: "" })
  res.json({ ok: true })
})

// =====================================================================
// Broadcast notifications — shown to every app user on next boot.
// requireAdmin (ADMIN + CONTENT_ADMIN): same trust level as the banner.
// =====================================================================

adminRouter.get("/notifications", async (req, res) => {
  const user = await requireAdmin(req, res)

  if (!user) return

  const rows = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      active: notifications.active,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(20)
    .all()

  res.json({ notifications: rows })
})

adminRouter.post("/notifications", async (req, res) => {
  const user = await requireAdmin(req, res)

  if (!user) return

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const data = parseBody(notificationCreateSchema, req.body, res)

  if (!data) return

  const row = await db
    .insert(notifications)
    .values({ title: data.title, body: data.body, createdBy: user.id })
    .returning({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      createdAt: notifications.createdAt,
    })
    .get()

  res.status(201).json({ notification: row })
})

adminRouter.delete("/notifications/:id", async (req, res) => {
  const user = await requireAdmin(req, res)

  if (!user) return

  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })

    return
  }

  const { id } = req.params

  const exists = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.id, id))
    .get()

  if (!exists) {
    res.status(404).json({ error: "اعلان یافت نشد" })

    return
  }

  await db.delete(notifications).where(eq(notifications.id, id)).run()

  res.json({ ok: true })
})
