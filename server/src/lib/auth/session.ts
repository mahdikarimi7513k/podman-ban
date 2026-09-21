import { createHash, randomUUID } from "crypto"
import type { Request, Response } from "express"
import { and, eq, gt, gte, isNull, lte } from "drizzle-orm"
import { db } from "../db.js"
import { refreshTokens, users } from "../db/schema.js"
import { clientIp } from "./rate-limit.js"
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
  type AccessPayload,
} from "./jwt"
import {
  setAuthCookies,
  setAccessCookie,
  clearAuthCookies,
  readCookie,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
} from "./cookies"
import { issueCsrfToken, verifyCsrf } from "./csrf"

/** sha256 hex (utf8) — refresh-token hashes and the external API key hash. */
export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

/** Normalize an Express header value (string | string[] | undefined) to a string. */
function headerString(
  v: string | string[] | undefined,
): string | undefined {
  if (v == null) return undefined
  return Array.isArray(v) ? v[0] : v
}

export interface SessionUser {
  id: string
  name: string
  role: "STUDENT" | "ADMIN" | "CONTENT_ADMIN"
  field: "FANI_HERFEI" | "KARDANESH"
}

/**
 * Read access cookie → verified user, or null.
 * Does NOT auto-refresh (call rotateRefreshToken for that).
 *
 * The JWT only proves identity; role/name/field are re-read from the DB on
 * every call so an admin change (e.g. a student's study field) applies on the
 * very next request instead of lingering in the token until re-login.
 *
 * Express: requires `cookie-parser` middleware so that `req.cookies.pb_access`
 * is populated.
 */
export async function getSession(req: Request): Promise<SessionUser | null> {
  const token = readCookie(req, ACCESS_COOKIE)
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null
  const fresh = await db
    .select({ id: users.id, name: users.name, role: users.role, field: users.field })
    .from(users)
    .where(eq(users.id, payload.sub))
    .get()
  if (!fresh) return null
  return {
    id: fresh.id,
    name: fresh.name,
    role: fresh.role,
    field: fresh.field,
  }
}

/**
 * Require an authenticated user.
 * On failure sends a 401 JSON response and returns null — the caller should
 * `if (!user) return;` to bail out of the handler.
 */
export async function requireUser(
  req: Request,
  res: Response,
): Promise<SessionUser | null> {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return null
  }
  return user
}

/**
 * Require an admin (ADMIN or CONTENT_ADMIN).
 * Sends 401 if unauthenticated, 403 if authenticated but not an admin.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
): Promise<SessionUser | null> {
  const user = await requireUser(req, res)
  if (!user) return null
  if (user.role !== "ADMIN" && user.role !== "CONTENT_ADMIN") {
    res.status(403).json({ error: "دسترسی غیرمجاز" })
    return null
  }
  return user
}

/**
 * Require a super admin only (ADMIN) — for user management, config, lock.
 * Sends 401 if unauthenticated, 403 if authenticated but not a super admin.
 */
export async function requireSuperAdmin(
  req: Request,
  res: Response,
): Promise<SessionUser | null> {
  const user = await requireUser(req, res)
  if (!user) return null
  if (user.role !== "ADMIN") {
    res
      .status(403)
      .json({ error: "این عملیات فقط برای مدیر اصلی مجاز است" })
    return null
  }
  return user
}

/**
 * Verify CSRF on a mutating request from the authenticated user.
 * Reads the token from the `x-csrf-token` header and the `pb_csrf` cookie,
 * then checks header === cookie === expected(userId).
 *
 * Caller is responsible for sending the 403 response when this returns false:
 *
 *   if (!await requireCsrf(user, req)) {
 *     res.status(403).json({ error: "توکن CSRF نامعتبر است" })
 *     return
 *   }
 */
export async function requireCsrf(
  user: SessionUser,
  req: Request,
): Promise<boolean> {
  const header = headerString(req.headers["x-csrf-token"])
  const cookie = readCookie(req, CSRF_COOKIE)
  return verifyCsrf({ header, cookie, userId: user.id })
}

/**
 * Issue a fresh session: access + refresh (new family) + csrf.
 * Persists the refresh token hash in the DB and sets the cookies on `res`.
 */
export async function issueSession(
  user: SessionUser,
  req: Request,
  res: Response,
): Promise<void> {
  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    name: user.name,
    field: user.field,
  })

  const family = randomUUID()
  const jti = randomUUID()
  const refreshToken = await signRefreshToken({ sub: user.id, jti, fam: family })

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    family,
    userAgent: headerString(req.headers["user-agent"]) ?? null,
    ip: clientIp(req),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
  })

  setAuthCookies(res, {
    accessToken,
    refreshToken,
    csrfToken: issueCsrfToken(user.id),
  })
}

/**
 * Rotate the refresh token.
 *
 * Reuse detection: if the presented refresh token is a valid JWT but NOT found
 * in the DB (while its family still has live tokens), the family is considered
 * compromised — every token in it is revoked and the caller is forced to
 * re-login (returns null without setting new cookies).
 *
 * Grace window (120s): a token superseded MOMENTS ago that is presented again
 * is far more likely a race than theft — parallel refreshes, or a mobile
 * client killed before persisting the rotated cookies (then the ONLY
 * credential it still holds is the old one). When the family provably
 * rotated past it (a live successor created at/after its revocation) we
 * re-issue ACCESS ONLY (15 min, no new refresh) and leave the family alone.
 * Logout-revoked tokens have no successor, so logout still kills instantly;
 * anything older, expired, or successor-less keeps the strict family-nuke.
 *
 * On success, sets fresh access/refresh/csrf cookies on `res` and returns the
 * session user.
 */
export async function rotateRefreshToken(
  req: Request,
  res: Response,
): Promise<SessionUser | null> {
  const token = readCookie(req, REFRESH_COOKIE)
  if (!token) return null
  const payload = await verifyRefreshToken(token)
  if (!payload) return null

  const hash = sha256(token)
  const record = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hash))
    .get()

  // Reuse: a valid JWT but no matching DB row → family is compromised.
  if (!record) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.family, payload.fam), isNull(refreshTokens.revokedAt)))
      .run()
    return null
  }

  // Expired/revoked already → presenting it is STILL reuse: an attacker holding
  // a rotated-out token likely holds the current one too. Kill the whole family.
  if (record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
    const graced = await tryGraceReuse(res, payload.sub, payload.fam, record.revokedAt)
    if (graced) return graced

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.family, payload.fam), isNull(refreshTokens.revokedAt)))
      .run()
    return null
  }

  const user = await db.select().from(users).where(eq(users.id, payload.sub)).get()
  if (!user) return null

    // Revoke the presented token — conditionally, so two parallel rotations with
  // the same cookie cannot both win (TOCTOU): the loser is treated as reuse.
  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, record.id), isNull(refreshTokens.revokedAt)))
    .run()
    if (revoked.changes === 0) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.family, payload.fam), isNull(refreshTokens.revokedAt)))
      .run()
    return null
  }

  const newJti = randomUUID()
  const newRefresh = await signRefreshToken({
    sub: user.id,
    jti: newJti,
    fam: payload.fam,
  })
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: sha256(newRefresh),
    family: payload.fam,
    userAgent: headerString(req.headers["user-agent"]) ?? null,
    ip: clientIp(req),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
  })

  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    role: user.role,
    field: user.field,
  }
  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    name: user.name,
    field: user.field,
  })

  setAuthCookies(res, {
    accessToken,
    refreshToken: newRefresh,
    csrfToken: issueCsrfToken(user.id),
  })

  return sessionUser
}

/** Grace window for recently-superseded refresh tokens (see rotateRefreshToken). */
const GRACE_MS = 120_000

async function tryGraceReuse(
  res: Response,
  userId: string,
  family: string,
  revokedAt: Date | null,
): Promise<SessionUser | null> {
  // Only rotation-superseded tokens qualify: logout (and natural expiry)
  // creates no successor, so those stay on the strict path.
  if (!revokedAt || Date.now() - revokedAt.getTime() > GRACE_MS) return null

  const successor = await db
    .select({ userId: refreshTokens.userId })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.family, family),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
        gte(refreshTokens.createdAt, revokedAt),
      ),
    )
    .limit(1)
    .get()
  if (!successor) return null

  const user = await db.select().from(users).where(eq(users.id, successor.userId)).get()
  if (!user || user.id !== userId) return null

  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    role: user.role,
    field: user.field,
  }
  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    name: user.name,
    field: user.field,
  })
  setAccessCookie(res, accessToken)

  return sessionUser
}

/** Revoke the presented refresh token (if any) and clear all auth cookies. */
export async function logout(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, REFRESH_COOKIE)
  if (token) {
    const hash = sha256(token)
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
      .run()
  }
  clearAuthCookies(res)
}

export { ACCESS_TTL_SEC }
export type { AccessPayload }
