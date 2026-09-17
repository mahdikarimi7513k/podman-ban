/**
 * Global setup: provision an isolated SQLite test database ONCE per run,
 * apply the Drizzle migrations into it, and seed security-test fixtures.
 *
 * Runs before any test module is imported (vitest globalSetup).
 */
import { execSync } from "child_process"
import { mkdirSync, rmSync } from "fs"
import { resolve } from "path"

const TEST_DB = resolve(__dirname, "data", "test.db")

export default function setup() {
  // Fresh file per run — no cross-run state leaks.
  rmSync(TEST_DB, { force: true })
  rmSync(TEST_DB + "-journal", { force: true })
  mkdirSync(resolve(__dirname, "data"), { recursive: true })

  process.env.DATABASE_URL = `file:${TEST_DB}`
  process.env.JWT_SECRET ??= "test-jwt-secret"
  process.env.CSRF_SECRET ??= "test-csrf-secret"
  process.env.TRUST_PROXY = "true" // exercise XFF-aware paths like production

  execSync(`bunx drizzle-kit migrate`, {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env },
    stdio: "pipe",
  })
}
