"use client"

import { create } from "zustand"
import { apiFetch, ApiError } from "@/lib/api-client"

// Shared in-flight boot (see useApp.boot)
let bootPromise: Promise<void> | null = null

async function doBoot(
  set: (partial: Partial<AppState>) => void,
): Promise<void> {
  const [configRes, meRes] = await Promise.allSettled([
    apiFetch<{ state: RemoteConfigState }>("/api/config"),
    apiFetch<{ user: AppUser }>("/api/auth/me"),
  ])
  const next: Partial<AppState> = { booted: true }
  if (configRes.status === "fulfilled") next.config = configRes.value.state
  if (meRes.status === "fulfilled") {
    next.user = meRes.value.user
    next.view = "home"
  } else {
    next.user = null
    next.view = "auth"
  }
  set(next)
}

export type View =
  | "auth"
  | "home"
  | "exam"
  | "report"
  | "settings"
  | "calculator"
  | "archive"
  | "admin"
  | "leaderboard"
  | "achievements"

export interface AppUser {
  id: string
  name: string
  username: string
  field: "FANI_HERFEI" | "KARDANESH"
  role: "STUDENT" | "ADMIN" | "CONTENT_ADMIN"
  totalTests: number
  prefs?: string
  createdAt?: string
}

export interface RemoteConfigState {
  siteLocked: boolean
  lockMessage: string
  bannerText: string
  bannerLink: string
  bannerActive: boolean
  defaultTimerMin: number
  negativeMarking: boolean
  // absent on old cached payloads → treat as open (server enforces anyway)
  registrationOpen?: boolean
  registrationMessage?: string
  externalApiEnabled?: boolean
  externalApiKeyPrefix?: string
}

interface AppState {
  booted: boolean
  user: AppUser | null
  config: RemoteConfigState | null
  view: View
  examSessionId: string | null
  startExamModuleId: string | null

  // actions
  boot: () => Promise<void>
  setView: (v: View) => void
  setUser: (u: AppUser | null) => void
  enterExam: (sessionId: string, moduleId: string) => void
  exitExam: () => void
  signOut: () => Promise<void>
  refreshConfig: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  user: null,
  config: null,
  view: "auth",
  examSessionId: null,
  startExamModuleId: null,

  // Module-level memo so React StrictMode's double effect (and any remount)
  // shares one in-flight boot instead of issuing duplicate API calls.
  async boot() {
    if (get().booted) return
    if (!bootPromise) {
      bootPromise = doBoot(set).finally(() => {
        bootPromise = null
      })
    }
    await bootPromise
  },

  setView(v) {
    set({ view: v })
  },

  setUser(u) {
    set({ user: u, view: u ? "home" : "auth" })
  },

  enterExam(sessionId, moduleId) {
    set({ examSessionId: sessionId, startExamModuleId: moduleId, view: "exam" })
  },

  exitExam() {
    set({ examSessionId: null, startExamModuleId: null, view: "home" })
  },

  async signOut() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" })
    } catch {
      /* ignore */
    }
    set({ user: null, view: "auth", examSessionId: null })
  },

  async refreshConfig() {
    try {
      const res = await apiFetch<{ state: RemoteConfigState }>("/api/config")
      set({ config: res.state })
    } catch {
      /* ignore */
    }
  },
}))

export { ApiError }
