/**
 * Explicit .env loader for the API server.
 *
 * Bun only auto-loads .env from the current working directory, but this server
 * is expected to boot from server/ while the canonical env file lives at the
 * repo root (same file the client tooling and chat-service read). Parsing it
 * here keeps every entrypoint (dev, prod, tests) consistent.
 * Real environment variables always win over file values.
 */
import { existsSync, readFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

// Works under Bun ESM (__dirname is shimmed), Node CJS bundles, and Node ESM.
const here =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

/** Walk upward until a folder that looks like the repo root (has client/). */
function findRepoRoot(): string {
  let dir = here
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "client"))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return process.cwd()
}

const ROOT_ENV = resolve(findRepoRoot(), ".env")

try {
  const text = readFileSync(ROOT_ENV, "utf8")
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
} catch {
  /* no root .env — rely on real env vars */
}

// claude-red auth: fail fast on weak/missing secrets in production only
// (tests use short throwaway secrets; dev warns but boots).
// HS256 is only as strong as JWT_SECRET — <32 chars is brute-forceable.
if (process.env.NODE_ENV === "production") {
  for (const k of ["JWT_SECRET", "CSRF_SECRET"] as const) {
    const v = process.env[k] ?? ""
    if (
      !v ||
      v.length < 32 ||
      v.includes("change-me")
    ) {
      throw new Error(
        `${k} must be set to a long random value in production (openssl rand -hex 32)`,
      )
    }
  }
  if ((process.env.JWT_SECRET ?? "") === (process.env.CSRF_SECRET ?? "")) {
    throw new Error("JWT_SECRET and CSRF_SECRET must differ")
  }
}
