/**
 * Storage hardening: the host keeps ONLY the .db file, so the journal must
 * live inside it too (DELETE mode — never WAL sidecars), and a stalled
 * shared-host disk waits 5s (busy_timeout) instead of failing instantly
 * with SQLITE_BUSY. journal_mode is persistent and cross-connection
 * assertable; busy_timeout is per-connection by design.
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
  it("keeps everything inside the single .db file (DELETE journal)", () => {
    const probe = new Better(resolve(here, "data", "test.db"), { readonly: true })

    try {
      // SAFETY: better-sqlite3 returns rows as plain objects; the pragma
      // selects exactly one column, checked by name below.
      const rows = probe.prepare("PRAGMA journal_mode").all() as Array<{ journal_mode: string }>

      expect(rows[0]?.journal_mode.toLowerCase()).toBe("delete")
    } finally {
      probe.close()
    }
  })
})
