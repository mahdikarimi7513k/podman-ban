import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DefaultLogger } from "drizzle-orm"
import type { drizzle as drizzleBetterFn } from "drizzle-orm/better-sqlite3"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import "./load-env.js"
import * as schema from "./db/schema.js"

// Ambient CJS wrapper param (esbuild --format=cjs output runs as CJS where
// `module` is in scope; under ESM runtimes it is absent — hence the probe).
declare const module: { require(id: string): unknown } | undefined

// require() that works in all three runtimes: the CJS bundle (native wrapper
// require), Bun ESM and Node ESM (derived from the module URL). A top-level
// createRequire(import.meta.url) alone would break the CJS bundle because
// esbuild leaves import.meta empty there.
const cjsRequire: (id: string) => unknown =
  typeof module !== "undefined" && module?.require
    ? module.require.bind(module)
    : createRequire(import.meta.url)

// Works under Bun ESM (__dirname is shimmed), Node CJS bundles, and Node ESM.
const here =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
const PRISMA_DIR = resolve(here, "..", "..", "prisma")

function dbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db"
  const file = url.startsWith("file:") ? url.slice("file:".length) : url
  if (file === ":memory:") return file
  // Prisma resolves a relative sqlite path against prisma/ — keep that so the
  // same DATABASE_URL keeps pointing at the same file after the migration.
  return isAbsolute(file) ? file : resolve(PRISMA_DIR, file)
}

// Query logging is opt-in (DEBUG_DB=true) — every line costs console I/O,
// which is surprisingly expensive on Windows dev machines.
const logger = process.env.DEBUG_DB === "true" ? new DefaultLogger() : undefined

/**
 * Host-safe schema guard — mirrors drizzle/0001_add-notifications.sql.
 *
 * Shared hosts (cPanel without shell) cannot run `drizzle-kit migrate`, so
 * a database created from an older bundle would miss the Notification
 * table and every broadcast endpoint would 500. IF NOT EXISTS makes this
 * a no-op everywhere else (dev, tests, fresh deploys) — existing data is
 * never touched.
 */
export const RUNTIME_DDL = [
  `CREATE TABLE IF NOT EXISTS \`Notification\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`title\` text NOT NULL,
	\`body\` text NOT NULL,
	\`active\` integer DEFAULT true NOT NULL,
	\`createdBy\` text,
	\`createdAt\` integer NOT NULL,
	FOREIGN KEY (\`createdBy\`) REFERENCES \`User\`(\`id\`) ON UPDATE no action ON DELETE set null
)`,
  "CREATE INDEX IF NOT EXISTS `Notification_createdAt_idx` ON `Notification` (`createdAt`)",
]

function ensureRuntimeTables(exec: (sql: string) => void): void {
  for (const stmt of RUNTIME_DDL) exec(stmt)
}

function openDatabase(): BetterSQLite3Database<typeof schema> {
  const path = dbPath()

  // Operational visibility: log the resolved file on every boot, and fail
  // fast with an actionable message when its directory is missing. The raw
  // better-sqlite3 TypeError ("directory does not exist") once surfaced on
  // cPanel as a bare 503 with no hint which path or variable was wrong.
  if (path !== ":memory:") {
    console.log(`[db] sqlite file: ${path}`)

    const parent = dirname(path)

    if (!existsSync(parent)) {
      throw new Error(
        `Cannot open SQLite database at ${path}: directory ${parent} does not exist. ` +
        `Upload the bundle's prisma/ directory or fix DATABASE_URL.`,
      )
    }
  }

  // NOTE: drivers are require()d lazily (never statically imported) because
  // drizzle-orm/bun-sqlite hard-imports the bun: builtin, which crashes the
  // Node-based test runner at load time.
  try {
    // SAFETY: under Bun this require hits the built-in bun:sqlite; under
    // Node it throws and we fall through to better-sqlite3. Both drivers
    // expose the same sync sqlite API drizzle needs.
    const { Database } = cjsRequire("bun:sqlite") as {
      Database: new (p: string) => { exec(sql: string): void }
    }
    type BunDrizzle = typeof import("drizzle-orm/bun-sqlite").drizzle
    // SAFETY: the drizzle-orm/bun-sqlite entry point is typed; the cast only
    // bridges the untyped require boundary.
    const { drizzle: drizzleBun } = cjsRequire("drizzle-orm/bun-sqlite") as { drizzle: BunDrizzle }
    const client = new Database(path)
    // Prisma enforced FK cascades on every connection — sqlite defaults to
    // OFF, so turn them on for parity.
    client.exec("PRAGMA foreign_keys = ON")
    ensureRuntimeTables((stmt) => client.exec(stmt))
    // SAFETY: bun:sqlite's Database is exactly what drizzle-orm/bun-sqlite
    // wraps; the double assertion only bridges the untyped require boundary.
    const bunClient = client as unknown as Parameters<BunDrizzle>[0]
    // SAFETY: both sync drivers expose the same query-builder surface, and
    // every call site only uses that shared surface.
    return drizzleBun(bunClient, { schema, logger }) as unknown as BetterSQLite3Database<typeof schema>
  } catch {
    // SAFETY: better-sqlite3's typings are authoritative here; the cast only
    // bridges the untyped require boundary.
    const Better = cjsRequire("better-sqlite3") as typeof import("better-sqlite3")
    // SAFETY: same as above — the drizzle entry point is typed.
    const { drizzle: drizzleBetter } = cjsRequire("drizzle-orm/better-sqlite3") as {
      drizzle: typeof drizzleBetterFn
    }
    const client = new Better(path)
    client.exec("PRAGMA foreign_keys = ON")
    ensureRuntimeTables((stmt) => client.exec(stmt))
    return drizzleBetter(client, { schema, logger })
  }
}

const db = openDatabase()

export { db }
export type AppDb = typeof db
