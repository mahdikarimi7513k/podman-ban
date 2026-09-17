/**
 * Auth + session + public-config routes.
 *
 * Endpoints:
 *   POST /register           — sign up + issue session     (rate-limited)
 *   POST /login              — sign in + issue session      (rate-limited)
 *   POST /logout             — revoke refresh + clear cookies (CSRF)
 *   POST /refresh            — rotate refresh token (no CSRF — rotation IS the auth)
 *   GET  /me                 — current user (no auto-refresh)
 *   GET  /csrf                — echo csrf token for the session
 *   GET  /config              — PUBLIC app state (lock/banner/timer)
 */

import { Router } from "express"
import {
  getSession,
  requireCsrf,
  issueSession,
  rotateRefreshToken,
  logout,
  hashPassword,
  verifyPassword,
  issueCsrfToken,
  rateLimit,
  clientIp,
} from "../lib/auth/index.js"
import { eq } from "drizzle-orm"
import { db } from "../lib/db.js"
import { users } from "../lib/db/schema.js"
import { registerSchema, loginSchema, parseBody } from "../lib/validations.js"
import { getAppState } from "../lib/remote-config.js"

export const authRouter = Router()

/** Standard zod parse → 422 on failure. Returns the parsed data or null. */
// ---- POST /register --------------------------------------------------

authRouter.post("/auth/register", async (req, res) => {
  const ip = clientIp(req)
  const rl = rateLimit(`register:${ip}`, 10, 300)
  if (!rl.ok) {
    res.status(429).json({ error: "تلاش‌های بیش از حد", retryAfter: rl.retryAfterSec })
    return
  }

  const data = parseBody(registerSchema, req.body, res)
  if (!data) return

  // Admin-controlled sign-up gate (server-side; the client hiding the tab
  // is cosmetic). Admin-created users bypass this via /api/admin/users.
  const appState = await getAppState()
  if (!appState.registrationOpen) {
    res.status(403).json({
      error: "ثبت‌نام فعلاً توسط مدیر بسته شده است",
      code: "REGISTRATION_CLOSED",
    })
    return
  }

  const { name, username, password, field } = data

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
  if (existing) {
    res.status(409).json({ error: "این نام کاربری قبلاً ثبت شده است" })
    return
  }

  const passwordHash = await hashPassword(password)
  const user = await db
    .insert(users)
    .values({ name, username, passwordHash, field, role: "STUDENT" })
    .returning()
    .get()

  await issueSession(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      field: user.field,
    },
    req,
    res,
  )

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      field: user.field,
      role: user.role,
    },
  })
})

// Precomputed cost-12 bcrypt hash of a random password that matches no
// account. Compared when the username doesn't exist so both failure modes
// cost one full bcrypt round — otherwise response time alone reveals whether
// a username is registered (timing oracle → username enumeration).
// Exported for the external verify route, which needs the same guarantee.
export const DUMMY_HASH = "$2b$12$bICd1dH9gm9g2f404qXxEeA8Ttha/6IG4yRgDwXKJgjbylyvwD2ia"

// ---- POST /login -----------------------------------------------------

authRouter.post("/auth/login", async (req, res) => {
  const ip = clientIp(req)

  // Parse first (cheap zod, no DB) so the per-account+IP bucket can key on it.
  const parsedBody = parseBody(loginSchema, req.body, res)
  if (!parsedBody) return

  // Two-tier limit:
  //  - per (username, IP): 8/5min — brute force from one source
  //  - per IP overall:     30/5min — floods, while a school NAT still breathes
  const rlIp = rateLimit(`login-ip:${ip}`, 30, 300)
  const rlUser = rateLimit(`login-u:${ip}:${parsedBody.username}`, 8, 300)
  if (!rlIp.ok || !rlUser.ok) {
    res.status(429).json({
      error: "تلاش‌های بیش از حد",
      retryAfterSec: Math.max(rlIp.retryAfterSec, rlUser.retryAfterSec),
    })
    return
  }

  const { username, password } = parsedBody
  const user = await db.select().from(users).where(eq(users.username, username)).get()
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !ok) {
    res.status(401).json({ error: "نام کاربری یا رمز عبور نادرست است" })
    return
  }

  await issueSession(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      field: user.field,
    },
    req,
    res,
  )

  res.json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      field: user.field,
      role: user.role,
      totalTests: user.totalTests,
    },
  })
})

// ---- POST /logout ----------------------------------------------------

authRouter.post("/auth/logout", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  if (!(await requireCsrf(user, req))) {
    res.status(403).json({ error: "توکن امنیتی نامعتبر است" })
    return
  }
  await logout(req, res)
  res.json({ ok: true })
})

// ---- POST /refresh ---------------------------------------------------

authRouter.post("/auth/refresh", async (req, res) => {
  const user = await rotateRefreshToken(req, res)
  if (!user) {
    res.status(401).json({ error: "نشست نامعتبر است — دوباره وارد شوید" })
    return
  }
  res.json({
    user: { id: user.id, name: user.name, role: user.role, field: user.field },
  })
})

// ---- GET /me ---------------------------------------------------------

authRouter.get("/auth/me", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const dbUser = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      field: users.field,
      role: users.role,
      totalTests: users.totalTests,
      prefs: users.prefs,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .get()
  if (!dbUser) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  res.json({
    user: dbUser,
    csrf: issueCsrfToken(user.id),
  })
})

// ---- GET /csrf -------------------------------------------------------

authRouter.get("/csrf", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  res.json({ csrf: issueCsrfToken(user.id) })
})

// ---- GET /config (PUBLIC) -------------------------------------------

authRouter.get("/config", async (_req, res) => {
  const state = await getAppState()
  res.json({ state })
})
