import { describe, it, expect } from "vitest"
import { groupSessionsByBook } from "./report-view"

/**
 * Seam: report sessions grouped under their book (stable first-seen order).
 */
function row(id: string, book: string, score: number) {
  return {
    id,
    moduleId: "m-" + id,
    scorePercent: score,
    correctCount: 1,
    wrongCount: 0,
    skippedCount: 0,
    totalQuestions: 1,
    negativeMarking: false,
    finishedAt: "2026-01-01T00:00:00.000Z",
    moduleTitle: "پودمان " + id,
    bookTitle: book,
  }
}

describe("groupSessionsByBook", () => {
  it("returns empty for no sessions", () => {
    expect(groupSessionsByBook([])).toEqual([])
  })

  it("groups sessions under each book in first-seen order", () => {
    const groups = groupSessionsByBook([
      row("s1", "شبکه", 80),
      row("s2", "حسابداری", 60),
      row("s3", "شبکه", 90),
    ])

    expect(groups.map((g) => g.book)).toEqual(["شبکه", "حسابداری"])
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(["s1", "s3"])
    expect(groups[1]?.rows.map((r) => r.id)).toEqual(["s2"])
  })
})
