/**
 * Idempotent fixtures for HTTP-seam security tests.
 * Creates users, a field book + a SHARED book, one module each, questions.
 */
import { eq } from "drizzle-orm"
import { db } from "../src/lib/db.js"
import { books, modules, questions, users } from "../src/lib/db/schema.js"
import bcrypt from "bcryptjs"

export const PASSWORD = "Test-Pass-123"

let seeded: Promise<void> | null = null

export function ensureFixtures(): Promise<void> {
  if (!seeded) seeded = doSeed()
  return seeded
}

async function doSeed(): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 4)
  const mk = async (username: string, role: "STUDENT" | "ADMIN" | "CONTENT_ADMIN", field: "FANI_HERFEI" | "KARDANESH") => {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
    if (existing) {
      await db.update(users).set({ passwordHash: hash, role, field }).where(eq(users.id, existing.id)).run()
      return
    }
    await db.insert(users).values({ username, name: username, passwordHash: hash, field, role }).run()
  }

  await Promise.all([
    mk("sec_admin", "ADMIN", "FANI_HERFEI"),
    mk("sec_student", "STUDENT", "FANI_HERFEI"),
    mk("sec_kardanesh", "STUDENT", "KARDANESH"),
    mk("sec_content", "CONTENT_ADMIN", "FANI_HERFEI"),
  ])

  const existing = await db.select({ id: books.id }).from(books).where(eq(books.title, "SEC-Fani-Book")).get()
  if (!existing) {
    const faniBook = await db
      .insert(books)
      .values({ title: "SEC-Fani-Book", field: "FANI_HERFEI", order: 0 })
      .returning({ id: books.id })
      .get()
    const sharedBook = await db
      .insert(books)
      .values({ title: "SEC-Shared-Book", field: null, order: 1 })
      .returning({ id: books.id })
      .get()
    if (!faniBook || !sharedBook) throw new Error("fixture books failed")
    const m1 = await db
      .insert(modules)
      .values({ bookId: faniBook.id, title: "SEC-Module-1", order: 0 })
      .returning({ id: modules.id })
      .get()
    await db.insert(modules).values({ bookId: sharedBook.id, title: "SEC-Shared-Module", order: 0 }).run()
    if (!m1) throw new Error("fixture module failed")
    for (let i = 0; i < 3; i++) {
      await db
        .insert(questions)
        .values({ moduleId: m1.id, text: `Q${i}`, options: JSON.stringify(["الف", "ب", "ج", "د"]), correctOption: 0 })
        .run()
    }
  }
}
