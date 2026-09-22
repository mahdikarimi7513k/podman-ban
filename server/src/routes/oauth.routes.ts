/**
 * OAuth2 social login (Google + GitHub).
 *
 * Endpoints (mounted under /api):
 *   GET  /auth/oauth/:provider?mode=web|native — start: web gets a 302 to
 *          the provider, native gets JSON { url } to open in the system
 *          browser (Google blocks embedded WebViews). Rate-limited.
 *   GET  /auth/oauth/:provider/callback        — provider returns here:
 *          verified profile → login (linking by verified email when the
 *          address matches an existing account), new address → pending
 *          (field pick). Web finishes with cookies, native with a
 *          single-use ticket redirect to the app scheme. Rate-limited.
 *   POST /auth/oauth/consume  { ticket }       — native app trades the
 *          ticket for a session (or a pending profile). The ticket IS the
 *          credential: single-use, 5min TTL. Rate-limited.
 *   GET  /auth/oauth/pending                   — pending profile for the
 *          field picker (reads the signed cookie). No auth yet.
 *   POST /auth/oauth/complete { field }        — creates the STUDENT from
 *          a pending profile. BYPASSES the public registration gate by
 *          design (verified provider email is the trust anchor), exactly
 *          like admin-created users. Rate-limited like sign-up.
 */

import { Router, type Response } from "express"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "../lib/db.js"
import { users } from "../lib/db/schema.js"
import {
  parseProvider,
  stateMode,
  oauthEnabled,
  oauthAppScheme,
  createOAuthStart,
  consumeOAuthState,
  fetchOAuthProfile,
  resolveOAuthAccount,
  deriveUsername,
  randomPassword,
  hashPassword,
  signPendingProfile,
  verifyPendingProfile,
  issueTicket,
  consumeTicket,
  issueSession,
  readCookie,
  OAuthError,
  rateLimit,
  clientIp,
  socketIp,
  cookieSecurity,
  type OAuthProfile,
} from "../lib/auth/index.js"
import { parseBody } from "../lib/validations.js"

export const oauthRouter = Router()

const PENDING_COOKIE = "pb_oauth_pending"

const PENDING_TTL_MS = 10 * 60_000

function setPendingCookie(res: Response, token: string): void {
  res.cookie(PENDING_COOKIE, token, {
    httpOnly: true,
    ...cookieSecurity(),
    path: "/",
    expires: new Date(Date.now() + PENDING_TTL_MS),
  })
}

function clearPendingCookie(res: Response): void {
  res.clearCookie(PENDING_COOKIE, {
    httpOnly: true,
    ...cookieSecurity(),
    path: "/",
    expires: new Date(0),
  })
}

function limitOr429(
  res: Response,
  namespace: string,
  ip: string,
  sip: string,
  perIp: number,
): boolean {
  const rlIp = rateLimit(`${namespace}:${ip}`, perIp, 300)
  const rlSock = rateLimit(`${namespace}-sock:${sip}`, 300, 300)

  if (!rlIp.ok || !rlSock.ok) {
    res.status(429).json({
      error: "تلاش‌های بیش از حد",
      retryAfterSec: Math.max(rlIp.retryAfterSec, rlSock.retryAfterSec),
    })

    return false
  }


  return true
}

// Provider query params are untrusted (arrays/objects are legal HTTP):
// single non-empty strings or nothing. String() keeps exotic shapes
// failing closed downstream instead of throwing.
function queryText(v: string | string[] | undefined): string {
  if (v === undefined) return ""

  if (Array.isArray(v)) return v.length > 0 ? String(v[0] ?? "") : ""


  return String(v)
}

// ---- GET /auth/oauth/:provider (start) ---------------------------------

oauthRouter.get("/auth/oauth/:provider", async (req, res) => {
  const provider = parseProvider(req.params.provider)

  if (!provider) {
    res.status(400).json({ error: "ارائه‌دهنده نامعتبر است" })

    return
  }

  if (!oauthEnabled(provider)) {
    res.status(503).json({ error: "ورود اجتماعی فعال نیست", code: "OAUTH_DISABLED" })

    return
  }

  const ip = clientIp(req)
  const sip = socketIp(req)

  if (!limitOr429(res, "oauth-start", ip, sip, 20)) return

  const mode = req.query.mode === "native" ? "native" : "web"
  const { url } = await createOAuthStart(provider, req, mode)

  if (mode === "native") {
    res.json({ url })

    return
  }


  res.redirect(url)
})

// ---- GET /auth/oauth/:provider/callback ---------------------------------

oauthRouter.get("/auth/oauth/:provider/callback", async (req, res) => {
  const provider = parseProvider(req.params.provider)

  if (!provider) {
    res.status(400).json({ error: "ارائه‌دهنده نامعتبر است" })

    return
  }

  const ip = clientIp(req)
  const sip = socketIp(req)

  if (!limitOr429(res, "oauth-cb", ip, sip, 30)) return

  // SAFETY: the provider redirect carries single scalar query params;
  // anything else degrades to "" and fails closed below.
  const code = queryText(req.query.code as string | string[] | undefined)

  // SAFETY: same single-scalar contract as `code` above.
  const rawState = queryText(req.query.state as string | string[] | undefined)

  // Native failures must stay machine-readable for the app: the system
  // browser cannot render our JSON usefully, so they go back over the
  // app scheme while web failures answer JSON directly (rare, debuggable).
  // The mode rides in the state suffix, so routing works even when the
  // state row is already gone.
  const fail = (status: number, error: string, codeErr?: string): void => {
    if (stateMode(rawState) === "native") {
      res.redirect(`${oauthAppScheme()}://oauth?error=${encodeURIComponent(codeErr ?? "failed")}`)

      return
    }

    res.status(status).json({ error })
  }

  if (!oauthEnabled(provider)) {
    fail(503, "ورود اجتماعی فعال نیست", "OAUTH_DISABLED")

    return
  }

  if (!code || !rawState) {
    fail(400, "پاسخ ارائه‌دهنده ناقص است", "INVALID")

    return
  }

  const stateRow = await consumeOAuthState(rawState)

  if (!stateRow) {
    fail(401, "نشست ورود منقضی شده — دوباره تلاش کنید", "EXPIRED")

    return
  }

  let profile: OAuthProfile

  try {
    profile = await fetchOAuthProfile(provider, req, code, stateRow.verifier)
  } catch (err) {
    if (err instanceof OAuthError) {
      fail(err.status, err.message)

      return
    }

    throw err
  }

  let account: Awaited<ReturnType<typeof resolveOAuthAccount>>

  try {
    account = await resolveOAuthAccount(profile)
  } catch (err) {
    if (err instanceof OAuthError) {
      fail(err.status, err.message)

      return
    }

    throw err
  }

  // Known account (fresh login or newly linked): web gets cookies, native
  // gets a ticket for the app to consume inside its own WebView.
  if (account) {
    if (stateRow.mode === "native") {
      const ticket = await issueTicket(account.id, null)

      res.redirect(`${oauthAppScheme()}://oauth?ticket=${encodeURIComponent(ticket)}`)

      return
    }

    await issueSession(
      { id: account.id, name: account.name, role: account.role, field: account.field },
      req,
      res,
    )
    res.redirect("/")

    return
  }

  // New address: park the verified profile until the field pick.
  if (stateRow.mode === "native") {
    const ticket = await issueTicket(null, profile)

    res.redirect(`${oauthAppScheme()}://oauth?ticket=${encodeURIComponent(ticket)}`)

    return
  }

  setPendingCookie(res, signPendingProfile(profile))

  res.redirect("/")
})

// ---- POST /auth/oauth/consume (native ticket → session/pending) ----------

const consumeSchema = z.object({
  ticket: z.string().min(1).max(256),
})

oauthRouter.post("/auth/oauth/consume", async (req, res) => {
  const ip = clientIp(req)
  const sip = socketIp(req)

  if (!limitOr429(res, "oauth-consume", ip, sip, 60)) return

  const data = parseBody(consumeSchema, req.body, res)

  if (!data) return

  const row = await consumeTicket(data.ticket)

  if (!row) {
    res.status(401).json({ error: "توکن ورود نامعتبر است — دوباره تلاش کنید" })

    return
  }

  if (row.pendingProfile) {
    setPendingCookie(res, signPendingProfile(row.pendingProfile))

    const p = row.pendingProfile

    res.json({ pending: { provider: p.provider, email: p.email, name: p.name } })

    return
  }

  const user = row.userId
    ? await db.select().from(users).where(eq(users.id, row.userId)).get()
    : undefined

  if (!user) {
    res.status(401).json({ error: "نشست نامعتبر است — دوباره وارد شوید" })

    return
  }

  await issueSession(
    { id: user.id, name: user.name, role: user.role, field: user.field },
    req,
    res,
  )

  res.json({
    user: { id: user.id, name: user.name, role: user.role, field: user.field },
  })
})

// ---- GET /auth/oauth/pending (field-picker bootstrap) ---------------------

oauthRouter.get("/auth/oauth/pending", async (req, res) => {
  const raw = readCookie(req, PENDING_COOKIE)
  const profile = raw ? verifyPendingProfile(raw) : null

  if (!profile) {
    res.status(404).json({ error: "یافت نشد" })

    return
  }

  res.json({
    profile: { provider: profile.provider, email: profile.email, name: profile.name },
  })
})

// ---- POST /auth/oauth/complete (create STUDENT from pending) ---------------

const completeSchema = z.object({
  field: z.enum(["FANI_HERFEI", "KARDANESH"]),
})

oauthRouter.post("/auth/oauth/complete", async (req, res) => {
  const ip = clientIp(req)
  const sip = socketIp(req)

  // Account creation quota, same shape as public sign-up.
  if (!limitOr429(res, "oauth-complete", ip, sip, 10)) return

  const data = parseBody(completeSchema, req.body, res)

  if (!data) return

  const raw = readCookie(req, PENDING_COOKIE)
  const profile = raw ? verifyPendingProfile(raw) : null

  if (!profile) {
    res.status(401).json({ error: "نشست ورود منقضی شده — دوباره تلاش کنید" })

    return
  }

  // The address may have been taken between the pick and this call
  // (manual signup in another tab): fall back to link-and-login instead
  // of dying on the UNIQUE constraint.
  const account = await resolveOAuthAccount(profile)

  if (account) {
    clearPendingCookie(res)

    await issueSession(
      { id: account.id, name: account.name, role: account.role, field: account.field },
      req,
      res,
    )

    res.status(200).json({
      user: { id: account.id, name: account.name, role: account.role, field: account.field },
    })

    return
  }

  const username = await deriveUsername(profile.email)
  const fallback = profile.email.split("@")[0] ?? "user"
  const name = profile.name.trim().slice(0, 40) || fallback
  const col = profile.provider === "google" ? "googleSub" : "githubId"

  try {
    const created = await db
      .insert(users)
      .values({
        name,
        username,
        passwordHash: await hashPassword(randomPassword()),
        email: profile.email,
        [col]: profile.sub,
        field: data.field,
        role: "STUDENT",
      })
      .returning()
      .get()

    if (!created) throw new Error("insert failed")

    clearPendingCookie(res)

    await issueSession(
      { id: created.id, name: created.name, role: created.role, field: created.field },
      req,
      res,
    )

    res.status(201).json({
      user: {
        id: created.id,
        name: created.name,
        username: created.username,
        field: created.field,
        role: created.role,
      },
    })
  } catch {
    // Lost an insert race (email taken meanwhile): link-and-login path.
    const winner = await resolveOAuthAccount(profile)

    if (!winner) {
      res.status(409).json({ error: "این ایمیل قبلاً ثبت شده است", code: "EMAIL_TAKEN" })

      return
    }

    clearPendingCookie(res)

    await issueSession(
      { id: winner.id, name: winner.name, role: winner.role, field: winner.field },
      req,
      res,
    )

    res.status(200).json({
      user: { id: winner.id, name: winner.name, role: winner.role, field: winner.field },
    })
  }
})
