/**
 * DDL parity: the boot-time RUNTIME_DDL guard (for hosts that cannot run
 * drizzle-kit migrate) must stay identical to drizzle/0001_add-notifications.sql.
 * If this test fails, update BOTH places — never just one.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { RUNTIME_DDL, RUNTIME_DDL_OAUTH, RUNTIME_ALTERS } from "../src/lib/db.js"

const here =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

/** Normalize away formatting/IF-guards/semicolons so only the schema shape compares. */
function norm(sql: string): string {
  return sql
    .replace(/IF NOT EXISTS/gi, "")
    .replace(/IF EXISTS/gi, "")
    .replace(/`/g, "")
    .replace(/;/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

describe("notification DDL parity", () => {
  it("RUNTIME_DDL matches the 0001 migration statement for statement", () => {
    const migration = readFileSync(
      resolve(here, "..", "drizzle", "0001_add-notifications.sql"),
      "utf8",
    )

    const migrated = migration
      .split("--> statement-breakpoint")
      .map((s) => norm(s))
      .filter(Boolean)

    expect(RUNTIME_DDL.map(norm)).toEqual(migrated)
  })
})

describe("oauth DDL parity", () => {
  it("RUNTIME_DDL_OAUTH + RUNTIME_ALTERS mirror 0003, 0004 and 0005", () => {
    const migrated = [
      "0003_add-user-email-oauth.sql",
      "0004_add-user-email-oauth.sql",
      "0005_add-exam-pausedat.sql",
    ].flatMap((f) =>
      readFileSync(resolve(here, "..", "drizzle", f), "utf8")
        .split("--> statement-breakpoint")
        .map((s) => norm(s))
        .filter(Boolean),
    )

    // Order between the two arrays is a runtime detail — content must match.
    expect([...RUNTIME_DDL_OAUTH, ...RUNTIME_ALTERS].map(norm).sort()).toEqual(
      migrated.sort(),
    )
  })
})
