import type { Request, Response } from "express"
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from "./jwt"

/**
 * Cookie names — all prefixed `pb_` (podman-ban).
 *
 * SECURITY: tokens live ONLY in cookies. NEVER localStorage.
 *  - pb_access : access JWT — httpOnly, Secure, SameSite=Strict, path=/
 *  - pb_refresh: refresh JWT — httpOnly, Secure, SameSite=Strict, path=/api/auth
 *  - pb_csrf   : double-submit CSRF token — readable by JS, Secure, SameSite=Strict
 *
 * Express notes:
 *  - `cookie-parser` middleware populates `req.cookies` as a plain object.
 *  - `res.cookie(name, value, opts)` writes a Set-Cookie header.
 *  - `res.clearCookie(name, opts)` expires it (must match path/sameSite/secure
 *    of the original Set-Cookie to actually clear in the browser).
 */
export const ACCESS_COOKIE = "pb_access"
export const REFRESH_COOKIE = "pb_refresh"
export const CSRF_COOKIE = "pb_csrf"

const isProd = process.env.NODE_ENV === "production"

/**
 * SameSite mode. Default "strict" (web). Set COOKIE_SAMESITE=none for the
 * Capacitor APK: a WebView app is a cross-origin client (capacitor://localhost
 * or http://localhost), and its cookies are dropped unless SameSite=None.
 */
function cookieSameSite(): "strict" | "lax" | "none" {
  const v = (process.env.COOKIE_SAMESITE ?? "strict").toLowerCase()
  return v === "none" || v === "lax" ? v : "strict"
}

function cookieSecure(): boolean {
  // Browsers reject SameSite=None without Secure — force it on.
  if (cookieSameSite() === "none") return true
  // Default OFF: browsers drop Secure cookies on plain http, which makes
  // login look fine while every later request goes out cookieless (401s).
  // Set COOKIE_SECURE=true on HTTPS production hosts.
  return process.env.COOKIE_SECURE === "true"
}

/** Common attributes for auth cookies — the security core. */
function authCookieAttrs(maxAgeSec: number, path = "/") {
  const expires = new Date(Date.now() + maxAgeSec * 1000)
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path,
    expires,
  }
}

/** Set access + refresh + csrf cookies on the Express response. */
export function setAuthCookies(
  res: Response,
  args: {
    accessToken: string
    refreshToken: string
    csrfToken: string
  },
): void {
  res.cookie(ACCESS_COOKIE, args.accessToken, authCookieAttrs(ACCESS_TTL_SEC, "/"))
  res.cookie(
    REFRESH_COOKIE,
    args.refreshToken,
    authCookieAttrs(REFRESH_TTL_SEC, "/api/auth"),
  )
  // CSRF token is NOT httpOnly — client JS must read it to echo as a header.
  res.cookie(CSRF_COOKIE, args.csrfToken, {
    httpOnly: false,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path: "/",
    expires: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
  })
}

/** Clear all auth cookies on the Express response. */
export function clearAuthCookies(res: Response): void {
  const names = [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]
  for (const n of names) {
    const path = n === REFRESH_COOKIE ? "/api/auth" : "/"
    res.clearCookie(n, {
      httpOnly: n !== CSRF_COOKIE,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      path,
      expires: new Date(0),
    })
  }
}

/**
 * Read a cookie from the Express request.
 * Requires the `cookie-parser` middleware to have populated `req.cookies`.
 */
export function readCookie(
  req: Request,
  name: string,
): string | undefined {
  const v = req.cookies?.[name]
  return typeof v === "string" && v.length > 0 ? v : undefined
}

/**
 * Read a cookie from a raw `cookie` header (manual parsing fallback).
 * Useful when running outside of the cookie-parser middleware chain
 * (e.g. in a websocket mini-service that only sees the raw header).
 *
 * SECURITY: malformed percent-encoding (e.g. `pb_access=%`) throws URIError.
 * The socket.io handshake calls this before any auth — an uncaught throw
 * would crash the whole Node process (unauthenticated DoS). Never throw:
 * fall back to the raw value, which then fails authentication normally.
 */
export function readCookieFromHeader(
  cookieHeader: string | null | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined

  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=")

    if (k !== name) continue
    const raw = v.join("=")

    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }

  return undefined
}
