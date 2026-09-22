/**
 * Client-side input sanitization (defense in depth — the server re-validates
 * everything with zod; this layer only stops invisible/ambiguous characters
 * from ever leaving the browser).
 *
 * Threats handled:
 *  - bidi overrides (Trojan Source) → UI spoofing, e.g. a display name that
 *    renders backwards in the admin user list.
 *  - zero-width chars → visually identical but byte-different values (login
 *    mismatches, duplicate-looking usernames).
 *  - control chars → log injection.
 * Lengths mirror the server limits (username 32, name 40, bcrypt 72,
 * chat message 2000) so over-long pastes are cut before submit.
 *
 * NOTE: all ranges below are \u escapes on purpose — never put literal
 * invisible characters in source.
 */

// U+061C, U+200E, U+200F, U+202A-U+202E, U+2066-U+2069
const BIDI_RE = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g
// U+200B-U+200D, U+2060, U+FEFF
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g
// C0 controls + DEL, except \t \n \r (kept for multi-line messages).
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const WHITESPACE_RUN_RE = /\s+/g
const LINE_BREAK_RE = /[\t\n\r]/g
const USERNAME_ALLOW_RE = /[^a-z0-9_.]/g

function stripInvisible(value: string, keepBreaks: boolean): string {
  const noBidi = value.replace(BIDI_RE, "").replace(ZERO_WIDTH_RE, "")
  const noControls = noBidi.replace(CONTROL_RE, "")
  return keepBreaks ? noControls : noControls.replace(LINE_BREAK_RE, "")
}

/** Login/register username: allow-listed, lowercased, no whitespace, ≤32. */
export function sanitizeUsername(value: string): string {
  return stripInvisible(value, false)
    .toLowerCase()
    .replace(WHITESPACE_RUN_RE, "")
    .replace(USERNAME_ALLOW_RE, "")
    .slice(0, 32)
}

/** Display name: readable text, single spaces, trimmed, ≤40. */
export function sanitizeName(value: string): string {
  return stripInvisible(value, false)
    .replace(WHITESPACE_RUN_RE, " ")
    .trim()
    .slice(0, 40)
}

/** Login email: readable text, lowercased, no whitespace, ≤254. The
 *  server re-validates the format and rejects duplicates. */
export function sanitizeEmail(value: string): string {
  return stripInvisible(value, false)
    .toLowerCase()
    .replace(WHITESPACE_RUN_RE, "")
    .slice(0, 254)
}

/** Password: invisible chars stripped, ≤72 (bcrypt limit). Never trimmed —
 *  visible spaces are legal password characters. */
export function clampPassword(value: string): string {
  return stripInvisible(value, false).slice(0, 72)
}

/** Support-chat message: breaks preserved, ≤2000 (server trims + enforces). */
export function sanitizeMessageText(value: string): string {
  return stripInvisible(value, true).slice(0, 2000)
}
