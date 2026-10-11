/**
 * Storage hardening: the database runs WAL + busy timeout so a stalled
 * shared-host disk turns SQLITE_BUSY ("database is locked") into a wait
 * instead of an instant failure. journal_mode is persistent (assertable
 * cross-connection); busy_timeout is per-connection by design.
 */
import { describe, it, expect } from "vitest"
import Better from "better-sqlite3"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const here =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

describe("db pragmas", () => {
  it("runs the test database in WAL mode", () => {
    const probe = new Better(resolve(here, "data", "test.db"), { readonly: true })

    try {
      // SAFETY: better-sqlite3 returns rows as plain objects; the pragma
      // selects exactly one column, checked by name below.
      const rows = probe.prepare("PRAGMA journal_mode").all() as Array<{ journal_mode: string }>

      expect(rows[0]?.journal_mode.toLowerCase()).toBe("wal")
    } finally {
      probe.close()
    }
  })
})
