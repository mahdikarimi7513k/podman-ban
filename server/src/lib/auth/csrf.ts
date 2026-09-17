import { createHmac, timingSafeEqual } from "crypto"

function secret(): string {
  const s = process.env.CSRF_SECRET
  if (!s) throw new Error("CSRF_SECRET is not set")
  return s
}

/**
 * Deterministic CSRF token tied to the user id.
 *
 *  csrfToken = base64url( HMAC-SHA256(userId, CSRF_SECRET) )
 *
 * Defense-in-depth beyond SameSite=Strict:
 *  1. Server recomputes expected from the authenticated user id.
 *  2. Server compares header === cookie (double-submit — proves same-origin JS).
 *  3. Server compares cookie === expected (defeats cookie-tossing from a subdomain).
 */
export function issueCsrfToken(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("base64url")
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Verify a mutation request's CSRF token.
 * Returns true only when header === cookie === expected(userId).
 */
export function verifyCsrf(args: {
  header?: string | null
  cookie?: string
  userId: string
}): boolean {
  const { header, cookie, userId } = args
  if (!header || !cookie) return false
  const expected = issueCsrfToken(userId)
  return safeEqual(header, cookie) && safeEqual(cookie, expected)
}
