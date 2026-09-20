/**
 * Client-side mirror of the server's BookWithModules type
 * (server/src/lib/question-bank.ts — GET /api/books response shape).
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
    // Distinct answered questions (server counts FINISHED sessions).
    // Absent on stale cached payloads → treated as unanswered (visible).
    answeredCount?: number
  }[]
}
