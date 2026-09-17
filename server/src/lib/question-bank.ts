import { and, asc, count, eq, inArray, isNull, or } from "drizzle-orm"
import { db } from "./db.js"
import { books, modules, questions } from "./db/schema.js"

/**
 * QuestionBank — deep module.
 * Owns: book/module listing with counts, question retrieval for exams and review.
 */

export interface BookWithModules {
  id: string
  title: string
  field: "FANI_HERFEI" | "KARDANESH" | null // null = shared with both fields
  order: number
  modules: {
    id: string
    title: string
    description: string | null
    order: number
    questionCount: number
  }[]
}

export async function listBooks(
  field?: "FANI_HERFEI" | "KARDANESH",
): Promise<BookWithModules[]> {
  const bookRows = await db
    .select()
    .from(books)
    // A user sees books of their own field PLUS shared books (field = null).
    .where(field ? or(eq(books.field, field), isNull(books.field)) : undefined)
    .orderBy(asc(books.order), asc(books.title))
    .all()
  const moduleRows = await db
    .select()
    .from(modules)
    .where(
      bookRows.length > 0
        ? inArray(
            modules.bookId,
            bookRows.map((b) => b.id),
          )
        : undefined,
    )
    .orderBy(asc(modules.order))
    .all()
  const counts = await db
    .select({ moduleId: questions.moduleId, n: count() })
    .from(questions)
    .where(
      moduleRows.length > 0
        ? inArray(
            questions.moduleId,
            moduleRows.map((m) => m.id),
          )
        : undefined,
    )
    .groupBy(questions.moduleId)
    .all()
  const countByModule = new Map(counts.map((c) => [c.moduleId, c.n]))
  const modulesByBook = new Map<string, typeof moduleRows>()
  for (const m of moduleRows) {
    const list = modulesByBook.get(m.bookId) ?? []
    list.push(m)
    modulesByBook.set(m.bookId, list)
  }
  return bookRows.map((b) => ({
    id: b.id,
    title: b.title,
    field: b.field,
    order: b.order,
    modules: (modulesByBook.get(b.id) ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      order: m.order,
      questionCount: countByModule.get(m.id) ?? 0,
    })),
  }))
}

export interface ExamQuestion {
  id: string
  text: string
  options: string[]
  imageBase64?: string | null
  // correctOption is NEVER sent to the client during an exam.
  order: number
}

export async function getQuestionsForExam(
  moduleId: string,
  questionIds?: string[],
): Promise<ExamQuestion[]> {
  const conds = [eq(questions.moduleId, moduleId)]
  if (questionIds) conds.push(inArray(questions.id, questionIds))
  const qRows = await db
    .select({
      id: questions.id,
      text: questions.text,
      options: questions.options,
      imageBase64: questions.imageBase64,
    })
    .from(questions)
    .where(and(...conds))
    .all()
  // preserve the shuffled order if ids were provided — O(n) via Map
  const byId = new Map(qRows.map((q) => [q.id, q]))
  const ordered = questionIds
    ? questionIds
        .map((id) => byId.get(id))
        .filter((q): q is NonNullable<typeof q> => Boolean(q))
    : qRows
  return ordered.map((q, i) => ({
    id: q.id,
    text: q.text,
    options: JSON.parse(q.options) as string[],
    imageBase64: q.imageBase64,
    order: i + 1,
  }))
}

/** For review after the exam — includes the correct answer + image. */
export async function getQuestionsForReview(
  moduleId: string,
  questionIds: string[],
): Promise<Array<ExamQuestion & { correctOption: number; explanation: string | null }>> {
  const rRows = await db
    .select({
      id: questions.id,
      text: questions.text,
      imageBase64: questions.imageBase64,
      options: questions.options,
      correctOption: questions.correctOption,
      explanation: questions.explanation,
    })
    .from(questions)
    .where(inArray(questions.id, questionIds))
    .all()
  const byId = new Map(rRows.map((q) => [q.id, q]))
  return questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q, i) => ({
      id: q.id,
      text: q.text,
      imageBase64: q.imageBase64,
      options: JSON.parse(q.options) as string[],
      correctOption: q.correctOption,
      explanation: q.explanation,
      order: i + 1,
    }))
}
