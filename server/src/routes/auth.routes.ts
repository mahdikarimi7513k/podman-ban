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
 *   GET  /notifications/latest — PUBLIC latest admin broadcast (or null)
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
  socketIp,
} from "../lib/auth/index.js"
import { desc, eq } from "drizzle-orm"
import { db } from "../lib/db.js"
import { notifications, users } from "../lib/db/schema.js"
import { registerSchema, loginSchema, parseBody } from "../lib/validations.js"
import { getAppState } from "../lib/remote-config.js"

export const authRouter = Router()

/** Standard zod parse → 422 on failure. Returns the parsed data or null. */
// ---- POST /register --------------------------------------------------

authRouter.post("/auth/register", async (req, res) => {
  const ip = clientIp(req)
  // Socket-IP floor: rotating X-Forwarded-For from one socket still shares
  // this bucket (direct-port exposure can't mint fresh quota per request).
  const rl = rateLimit(`register:${ip}`, 10, 300)
  const rlSock = rateLimit(`register-sock:${socketIp(req)}`, 10, 300)

  if (!rl.ok || !rlSock.ok) {
    res.status(429).json({ error: "تلاش‌های بیش از حد", retryAfter: Math.max(rl.retryAfterSec, rlSock.retryAfterSec) })

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
  const sip = socketIp(req)

  // Parse first (cheap zod, no DB) so the per-account+IP bucket can key on it.
  const parsedBody = parseBody(loginSchema, req.body, res)
  if (!parsedBody) return

  // Three-tier limit (per-XFF buckets plus socket-IP floors):
  //  - per (username, IP): 8/5min — brute force from one source
  //  - per (username, socket): 8/5min — same, surviving XFF rotation on a
  //    directly exposed port (the attacker is their own fixed socket peer)
  //  - per IP overall: 30/5min — floods, while a school NAT still breathes
  //  - per socket overall: 300/5min — flood floor no legitimate proxy
  //    population trips, but a direct-connection flood does
  const rlIp = rateLimit(`login-ip:${ip}`, 30, 300)
  const rlUser = rateLimit(`login-u:${ip}:${parsedBody.username}`, 8, 300)
  const rlUserSock = rateLimit(`login-u-sock:${sip}:${parsedBody.username}`, 8, 300)
  const rlSock = rateLimit(`login-ip-sock:${sip}`, 300, 300)

  if (!rlIp.ok || !rlUser.ok || !rlUserSock.ok || !rlSock.ok) {
    res.status(429).json({
      error: "تلاش‌های بیش از حد",
      retryAfterSec: Math.max(
        rlIp.retryAfterSec,
        rlUser.retryAfterSec,
        rlUserSock.retryAfterSec,
        rlSock.retryAfterSec,
      ),
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
  const ip = clientIp(req)
  const sip = socketIp(req)

  // Token endpoint without a limit is a JWT-guessing oracle: each try costs
  // one verify + one indexed lookup. 60/5min per IP never trips a real
  // client (1 refresh per 15min access lifetime + 1 retry per 401) but
  // stops bulk guessing; the socket floor survives XFF rotation.
  const rlIp = rateLimit(`refresh-ip:${ip}`, 60, 300)
  const rlSock = rateLimit(`refresh-ip-sock:${sip}`, 300, 300)

  if (!rlIp.ok || !rlSock.ok) {
    res.status(429).json({
      error: "تلاش‌های بیش از حد",
      retryAfterSec: Math.max(rlIp.retryAfterSec, rlSock.retryAfterSec),
    })

    return
  }

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

// ---- GET /notifications/latest (PUBLIC) -------------------------------
// Latest active admin broadcast. Unauthenticated by design (same as the
// banner in /config): the client shows it once per id, tracked locally.
authRouter.get("/notifications/latest", async (_req, res) => {
  const row = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      createdBy: notifications.createdBy,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.active, true))
    .orderBy(desc(notifications.createdAt))
    .limit(1)
    .get()

  res.json({ notification: row ?? null })
})
