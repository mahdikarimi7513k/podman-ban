/**
 * Seam: booting against an OLD production database.
 *
 * Regression target: the 0003 indexes were applied before the ALTERs, so
 * a database without the email columns crashed the boot with
 * "no such column: email" — a total 503 outage on update. The guard must
 * upgrade an old schema in place (data intact) and stay a no-op after.
 */
import { describe, it, expect, afterAll } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Better from "better-sqlite3"

const OLD_USER_DDL = `CREATE TABLE "User" (
  id text PRIMARY KEY NOT NULL,
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  passwordHash text NOT NULL,
  field text NOT NULL,
  role text NOT NULL DEFAULT 'STUDENT',
  prefs text NOT NULL DEFAULT '{}',
  totalTests integer NOT NULL DEFAULT 0,
  createdAt integer NOT NULL,
  updatedAt integer NOT NULL
)`

const dir = mkdtempSync(join(tmpdir(), "old-schema-"))

const dbFile = join(dir, "old.db")

function userColumns(): string[] {
  const probe = new Better(dbFile, { readonly: true })
  const cols: { name: string }[] = probe.prepare("PRAGMA table_info(User)").all()
  probe.close()

  return cols.map((c) => c.name)
}

describe("boot against an old-schema database", () => {
  it("upgrades in place without touching existing rows", async () => {
    const seed = new Better(dbFile)
    seed.exec(OLD_USER_DDL)
    seed.exec(
      "INSERT INTO \"User\" (id, username, name, passwordHash, field, role, prefs, totalTests, createdAt, updatedAt) " +
      "VALUES ('u1', 'olduser', 'Old', 'hash', 'FANI_HERFEI', 'STUDENT', '{}', 3, 1, 1)",
    )
    seed.close()

    expect(userColumns()).not.toContain("email")

    process.env.DATABASE_URL = `file:${dbFile}`

    const { ensureRuntimeTables } = await import("../src/lib/db.js")

    // Boot applied the 0003/0004 guards.
    expect(userColumns()).toEqual(
      expect.arrayContaining(["email", "googleSub", "githubId"]),
    )

    const probe = new Better(dbFile, { readonly: true })

    const names: { name: string }[] = probe
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()

    const kept: { username: string; totalTests: number } = probe
      .prepare("SELECT username, totalTests FROM \"User\" WHERE id = 'u1'")
      .get()

    probe.close()

    expect(names.map((t) => t.name)).toEqual(
      expect.arrayContaining(["OauthTicket", "OauthState"]),
    )
    expect(kept).toEqual({ username: "olduser", totalTests: 3 })

    // Second and third boots are pure no-ops (duplicate columns/indexes).
    const live = new Better(dbFile)
    ensureRuntimeTables((stmt) => live.exec(stmt))
    ensureRuntimeTables((stmt) => live.exec(stmt))
    live.close()

    expect(userColumns()).toEqual(
      expect.arrayContaining(["email", "googleSub", "githubId"]),
    )
  })

  afterAll(() => {
    delete process.env.DATABASE_URL

    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // The imported db module keeps its connection open by design
      // (production never closes it either); Windows then refuses the
      // rmdir. The OS reclaims tmp dirs — nothing leaks that matters.
    }
  })
})
