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
 *  - oauth.ts     : Google/GitHub authorization-code + PKCE, tickets, pending
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
  parseProvider,
  oauthEnabled,
  oauthProviders,
  oauthAppScheme,
  redirectUri,
  newVerifier,
  pkceChallenge,
  buildAuthUrl,
  createOAuthStart,
  consumeOAuthState,
  stateMode,
  fetchOAuthProfile,
  pickGithubEmail,
  resolveOAuthAccount,
  deriveUsername,
  randomPassword,
  signPendingProfile,
  verifyPendingProfile,
  issueTicket,
  consumeTicket,
  OAuthError,
  OAUTH_STATE_TTL_MIN,
  OAUTH_TICKET_TTL_MIN,
  type OAuthProvider,
  type OAuthMode,
  type OAuthProfile,
} from "./oauth"

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
  cookieSecurity,
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
