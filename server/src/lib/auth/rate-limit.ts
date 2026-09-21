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

/** Test hook: drop all buckets so test files start with fresh budgets. */
export function clearRateLimitBuckets(): void {
  buckets.clear()
  sinceSweep = 0
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

/**
 * Client IP for audit fields and rate-limit keys.
 *
 * Never take the leftmost X-Forwarded-For entry: behind an appending proxy
 * (Apache/cPanel — unlike Caddy, the header may already carry brackets from
 * earlier hops) anyone can prepend arbitrary addresses and poison per-IP
 * buckets (login brute-force shield). So take the rightmost entry — the
 * address the closest proxy hop appended — which matches what Express'
 * own req.ip resolves to under `trust proxy`. The manual parse below keeps
 * that rule for non-Express callers (tests drive plain header objects).
 */
export function clientIp(req: {
  ip?: string
  socket?: { remoteAddress?: string }
  headers: Record<string, string | string[] | undefined>
}): string {
  if (process.env.TRUST_PROXY === "true") {
    const xff = req.headers["x-forwarded-for"]

    if (Array.isArray(xff)) {
      const last = xff.length > 0 ? xff[xff.length - 1].split(",").pop()?.trim() : undefined

      if (last) return last
    } else if (xff) {
      const last = xff.split(",").pop()?.trim()

      if (last) return last
    }
  }
  // Same value Express' own req.ip resolves to under `trust proxy` (the
  // rightmost untrusted chain entry) — kept as fallback for direct callers.

  return req.ip ?? req.socket?.remoteAddress ?? "unknown"
}

/**
 * Direct socket peer — never derived from headers, so it cannot be spoofed.
 * Rate-limit keys always pair an XFF-derived bucket with a socket-IP bucket:
 * behind a correct proxy both identify the client; if the port is ever
 * exposed directly, the attacker becomes their own fixed socket peer and
 * rotating X-Forwarded-For buys them nothing.
 */
export function socketIp(req: {
  socket?: { remoteAddress?: string }
}): string {
  return req.socket?.remoteAddress ?? "unknown"
}
