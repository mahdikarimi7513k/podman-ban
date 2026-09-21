/**
 * External machine-to-machine API (API-key auth, no cookies/sessions).
 *
 *   POST /external/verify
 *   Body: { "username", "password", "field"? } — checks credentials.
 *   When "field" is sent it must match the account's real study field,
 *   otherwise 401 { ok: false, code: "FIELD_MISMATCH" }.
 *
 *   POST /external/register
 *   Body: { "name", "username", "password", "field" } — ALL required.
 *   Creates a STUDENT exactly like public sign-up, but ALWAYS allowed:
 *   it bypasses the admin's registration gate (same as admin-created users).
 *
 * Success → 200 { ok: true, user: { id, username, name, field, role } }
 *           (register answers 201)
 * Failure → 4xx { ok: false, error, code }
 *
 * Security notes:
 *  - The key itself is never stored; only its sha256 is kept in RemoteConfig.
 *    Comparison is timing-safe. The key is shown once at issuance.
 *  - No cookies are issued or read here — a stolen browser session cannot
 *    call this, and calling this never creates a session.
 *  - Own rate-limit namespaces so external traffic never eats login quota
 *    and cannot be used as a faster oracle than the public endpoints.
 *  - Error messages are generic (no username enumeration beyond the
 *    register 409, which matches the public /auth/register behaviour).
 */

import { Router, type Request, type Response } from "express"
import { timingSafeEqual } from "crypto"
import {
  rateLimit,
  clientIp,
  socketIp,
  verifyPassword,
  hashPassword,
  sha256,
} from "../lib/auth/index.js"
import { eq } from "drizzle-orm"
import { db } from "../lib/db.js"
import { remoteConfig, users } from "../lib/db/schema.js"
import { DUMMY_HASH } from "./auth.routes.js"
import { externalVerifySchema, registerSchema } from "../lib/validations.js"

export const externalRouter = Router()

function keysEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "utf8")
  const b = Buffer.from(bHex, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** API-key gate shared by both external endpoints. False = responded. */
async function checkApiKey(req: Request, res: Response): Promise<boolean> {
  const headerKey = req.headers["x-api-key"]
  const authHeader = req.headers["authorization"]
  const provided =
    (Array.isArray(headerKey) ? headerKey[0] : headerKey)?.trim() ||
    (typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : Array.isArray(authHeader)
        ? authHeader[0]?.slice(7).trim()
        : "") ||
    ""

  const row = await db
    .select({ externalApiKeyHash: remoteConfig.externalApiKeyHash })
    .from(remoteConfig)
    .where(eq(remoteConfig.id, "singleton"))
    .get()
  if (!row?.externalApiKeyHash) {
    res.status(503).json({
      ok: false,
      error: "سرویس خارجی غیرفعال است",
      code: "EXTERNAL_DISABLED",
    })
    return false
  }
  if (!provided || !keysEqual(sha256(provided), row.externalApiKeyHash)) {
    res.status(401).json({
      ok: false,
      error: "کلید API نامعتبر است",
      code: "INVALID_API_KEY",
    })
    return false
  }
  return true
}

externalRouter.post("/external/verify", async (req, res) => {
  if (!(await checkApiKey(req, res))) return

  // --- body validation (same rules as login; username is normalized) ---
  const parsed = externalVerifySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است",
      code: "INVALID_INPUT",
    })
    return
  }

  // --- rate limit (own namespace so external traffic never eats login quota) ---
  // Socket-IP siblings mirror the login hardening (XFF rotation resistance).
  const ip = clientIp(req)
  const sip = socketIp(req)
  const rlIp = rateLimit(`ext-verify-ip:${ip}`, 30, 300)
  const rlUser = rateLimit(`ext-verify-u:${ip}:${parsed.data.username}`, 8, 300)
  const rlUserSock = rateLimit(`ext-verify-u-sock:${sip}:${parsed.data.username}`, 8, 300)
  const rlSock = rateLimit(`ext-verify-ip-sock:${sip}`, 300, 300)

  if (!rlIp.ok || !rlUser.ok || !rlUserSock.ok || !rlSock.ok) {
    res.status(429).json({
      ok: false,
      error: "تلاش‌های بیش از حد",
      code: "RATE_LIMITED",
      retryAfterSec: Math.max(
        rlIp.retryAfterSec,
        rlUser.retryAfterSec,
        rlUserSock.retryAfterSec,
        rlSock.retryAfterSec,
      ),
    })

    return
  }

  const { username, password, field } = parsed.data
  const user = await db.select().from(users).where(eq(users.username, username)).get()
  // Same anti-oracle shape as /auth/login: missing users still cost one
  // bcrypt round. (DUMMY_HASH is the precomputed cost-12 hash there.)
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !ok) {
    res.status(401).json({
      ok: false,
      error: "نام کاربری یا رمز عبور نادرست است",
      code: "INVALID_CREDENTIALS",
    })
    return
  }

  // Optional caller-supplied field must match the account's real field.
  if (field && user.field !== field) {
    res.status(401).json({
      ok: false,
      error: "رشته تحصیلی با این حساب کاربری مطابقت ندارد",
      code: "FIELD_MISMATCH",
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        field: user.field,
        role: user.role,
      },
    })
    return
  }

  res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      field: user.field,
      role: user.role,
    },
  })
})

externalRouter.post("/external/register", async (req, res) => {
  if (!(await checkApiKey(req, res))) return

  // Same rules as public sign-up; username is normalized by the schema.
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است",
      code: "INVALID_INPUT",
    })
    return
  }

  // Own namespace (mirrors the public /auth/register quota).
  const ip = clientIp(req)
  const rl = rateLimit(`ext-register:${ip}`, 10, 300)
  const rlSock = rateLimit(`ext-register-sock:${socketIp(req)}`, 10, 300)

  if (!rl.ok || !rlSock.ok) {
    res.status(429).json({
      ok: false,
      error: "تلاش‌های بیش از حد",
      code: "RATE_LIMITED",
      retryAfterSec: Math.max(rl.retryAfterSec, rlSock.retryAfterSec),
    })

    return
  }

  const { name, username, password, field } = parsed.data
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
  if (existing) {
    res.status(409).json({
      ok: false,
      error: "این نام کاربری قبلاً ثبت شده است",
      code: "USERNAME_TAKEN",
    })
    return
  }

  // ponytail: same row shape as public sign-up — no separate "external user"
  // concept; the account logs in everywhere like any other STUDENT.
  const created = await db
    .insert(users)
    .values({ name, username, passwordHash: await hashPassword(password), field, role: "STUDENT" })
    .returning({ id: users.id, username: users.username, name: users.name, field: users.field, role: users.role })
    .get()
  res.status(201).json({ ok: true, user: created })
})
