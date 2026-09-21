/**
 * Auth library for the Express backend.
 *
 * Barrel re-exports so callers can `import { ... } from "@/lib/auth"`.
 *
 *  - password.ts  : bcrypt hashing (12 rounds)
 *  - jwt.ts       : HS256 access (15m) + refresh (7d) with issuer/audience
 *  - csrf.ts      : HMAC-SHA256 double-submit token tied to userId
 *  - rate-limit.ts: in-memory sliding-window limiter
 *  - cookies.ts   : httpOnly + Secure + SameSite=Strict cookie helpers (Express)
 *  - session.ts   : getSession / requireUser / requireAdmin / requireSuperAdmin
 *                   / requireCsrf / issueSession / rotateRefreshToken / logout
 *
 * Role type is `"STUDENT" | "ADMIN" | "CONTENT_ADMIN"` everywhere.
 */

export {
  hashPassword,
  verifyPassword,
} from "./password"

export {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
  type AccessPayload,
  type RefreshPayload,
} from "./jwt"

export {
  issueCsrfToken,
  verifyCsrf,
} from "./csrf"

export {
  rateLimit,
  clientIp,
  socketIp,
  type RateLimitResult,
} from "./rate-limit"

export {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  setAuthCookies,
  clearAuthCookies,
  readCookie,
  readCookieFromHeader,
} from "./cookies"

export {
  getSession,
  requireUser,
  requireAdmin,
  requireSuperAdmin,
  requireCsrf,
  issueSession,
  rotateRefreshToken,
  logout,
  sha256,
  type SessionUser,
} from "./session"
