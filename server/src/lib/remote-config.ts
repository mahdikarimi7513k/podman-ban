import { eq } from "drizzle-orm"
import { db } from "./db.js"
import { remoteConfig } from "./db/schema.js"

/**
 * RemoteConfig — single source of truth for app state without an app update.
 * Banner, maintenance mode, default timer, negative-marking default.
 */
export interface AppState {
  siteLocked: boolean
  lockMessage: string
  bannerText: string
  bannerLink: string
  bannerActive: boolean
  defaultTimerMin: number
  negativeMarking: boolean
  registrationOpen: boolean
  registrationMessage: string
  // external verify API — hash never leaves the server; clients only see
  // whether it is enabled + a short prefix to identify the active key.
  externalApiEnabled: boolean
  externalApiKeyPrefix: string
}

// Short TTL cache so hot paths (maintenance middleware) don't hit the DB
// on every request. updateAppState invalidates it.
let cache: { state: AppState; at: number } | null = null
const CACHE_TTL_MS = 2_000

export async function getAppState(): Promise<AppState> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.state
  let row = await db.select().from(remoteConfig).where(eq(remoteConfig.id, "singleton")).get()
  if (!row) {
    row = await db.insert(remoteConfig).values({ id: "singleton" }).returning().get()
  }
  const state: AppState = {
    siteLocked: row.siteLocked,
    lockMessage: row.lockMessage,
    bannerText: row.bannerText,
    bannerLink: row.bannerLink,
    bannerActive: row.bannerActive,
    defaultTimerMin: row.defaultTimerMin,
    negativeMarking: row.negativeMarking,
    registrationOpen: row.registrationOpen,
    registrationMessage: row.registrationMessage,
    externalApiEnabled: !!row.externalApiKeyHash,
    externalApiKeyPrefix: row.externalApiKeyPrefix ?? "",
  }
  cache = { state, at: Date.now() }
  return state
}

/** Columns the generic config endpoint may patch (key hash is key-endpoint only). */
const PATCHABLE = [
  "siteLocked",
  "lockMessage",
  "bannerText",
  "bannerLink",
  "bannerActive",
  "defaultTimerMin",
  "negativeMarking",
  "registrationOpen",
  "registrationMessage",
  "externalApiKeyHash",
  "externalApiKeyPrefix",
] as const

export async function updateAppState(patch: {
  [k: string]: string | boolean | number | null | undefined
}): Promise<AppState> {
  const clean: Record<string, string | boolean | number | null> = {}
  for (const k of PATCHABLE) {
    const v = (patch as Record<string, unknown>)[k]
    if (v !== undefined) clean[k] = v as string | boolean | number | null
  }
  await db
    .insert(remoteConfig)
    .values({ id: "singleton", ...clean })
    .onConflictDoUpdate({ target: remoteConfig.id, set: { ...clean, updatedAt: new Date() } })
    .run()
  cache = null
  return getAppState()
}
