/**
 * Simple in-memory sliding-window rate limiter.
 * Good enough for a single-instance deployment (sandbox).
 * Keyed by identifier (ip or phone).
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

// Expired buckets are dead weight; sweep them so key churn (per-IP keys)
// cannot grow the map without bound.
let sinceSweep = 0
function maybeSweep(): void {
  sinceSweep++
  if (sinceSweep < 500) return
  sinceSweep = 0
  const now = Date.now()
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

export function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): RateLimitResult {
  maybeSweep()
  const now = Date.now()
  const entry = buckets.get(key)
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowSec * 1000
    buckets.set(key, { count: 1, resetAt })
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 }
  }
  if (entry.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    }
  }
  entry.count += 1
  return { ok: true, remaining: limit - entry.count, retryAfterSec: 0 }
}

/** Client IP for audit fields — honors TRUST_PROXY the same way as getIp(). */
export function clientIp(req: { ip?: string; socket?: { remoteAddress?: string }; headers: Record<string, unknown> }): string {
  if (process.env.TRUST_PROXY === "true") {
    const xff = req.headers["x-forwarded-for"]
    const first = Array.isArray(xff) ? xff[0] : xff
    if (typeof first === "string" && first) return first.split(",")[0].trim()
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown"
}
