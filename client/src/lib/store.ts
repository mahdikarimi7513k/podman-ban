import { create } from "zustand"
import { apiFetch, ApiError } from "@/lib/api-client"
import { replaceViewState, type AppView } from "@/lib/view-history"

// Shared in-flight boot (see useApp.boot)
let bootPromise: Promise<void> | null = null

const SEEN_SESSION_KEY = "pb_seen_session"

function hasSeenSession(): boolean {
  try {
    return window.localStorage.getItem(SEEN_SESSION_KEY) === "1"
  } catch {
    return true
  }
}

function markSeenSession(seen: boolean): void {
  try {
    if (seen) window.localStorage.setItem(SEEN_SESSION_KEY, "1")
    else window.localStorage.removeItem(SEEN_SESSION_KEY)
  } catch {
    /* private mode — boot normally */
  }
}

async function doBoot(
  set: (partial: Partial<AppState>) => void,
): Promise<void> {
  // Fresh installs never held a session: skip /me + /refresh entirely so
  // first boot makes zero failing (console-red 401) requests.
  if (!hasSeenSession()) {
    const next: Partial<AppState> = { booted: true, user: null, view: "auth" }

    try {
      const configRes = await apiFetch<{ state: RemoteConfigState }>("/api/config")
      next.config = configRes.state
    } catch {
      /* offline — shell still boots */
    }

    set(next)

    return
  }

  const [configRes, meRes] = await Promise.allSettled([
    apiFetch<{ state: RemoteConfigState }>("/api/config"),
    apiFetch<{ user: AppUser }>("/api/auth/me"),
  ])

  const next: Partial<AppState> = { booted: true }

  if (configRes.status === "fulfilled") next.config = configRes.value.state

  if (meRes.status === "fulfilled") {
    next.user = meRes.value.user
    next.view = "home"
  } else if (meRes.status === "rejected" && meRes.reason instanceof ApiError && meRes.reason.status === 401) {
    // Access token expired while refresh is still valid (backgrounded APK,
    // 15-minute access lifetime): one explicit refresh + retry before
    // dropping the user to the login screen. apiFetch already retries once
    // per request, but racing boot calls can exhaust that single retry —
    // this second chance is what keeps users signed in.
    try {
      await apiFetch("/api/auth/refresh", { method: "POST" })
      const retry = await apiFetch<{ user: AppUser }>("/api/auth/me")
      next.user = retry.user
      next.view = "home"
    } catch {
      next.user = null
      next.view = "auth"
    }
  } else {
    next.user = null
    next.view = "auth"
  }

  set(next)
}

/** Single source of truth: the history allowlist and the store share it. */
export type View = AppView

export interface AppUser {
  id: string
  name: string
  username: string
  email: string | null
  field: "FANI_HERFEI" | "KARDANESH"
  role: "STUDENT" | "ADMIN" | "CONTENT_ADMIN"
  totalTests: number
  avatarBase64?: string | null
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
  // Nightly daily-goal reminder (23:00 Tehran) kill-switch.
  dailyGoalNotify: boolean
  // Konkur countdown target (ISO string, admin-selectable). Null = hidden.
  konkurDate?: string | null
  // Daily study goal (minutes) for the study-room overview card.
  studyDailyGoalMin?: number
  // Social-login capability (computed from server env, never stored).
  // Absent on old cached payloads → no social buttons (server enforces).
  oauth?: { google: boolean; github: boolean }
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
  // Notification deep-link target: when set, StudyView opens that room's
  // detail directly (then clears it). Set by the shade-tap handler.
  openRoomId: string | null

  // actions
  boot: () => Promise<void>
  setView: (v: View) => void
  openStudyRoom: (roomId: string) => void
  setUser: (u: AppUser | null) => void
  enterExam: (sessionId: string, moduleId: string) => void
  exitExam: () => void
  signOut: () => Promise<void>
  refreshConfig: () => Promise<void>
  // Merge user fields without touching the current view (setUser navigates).
  patchUser: (patch: Partial<AppUser>) => void
  // Exit-confirm dialog for the exam (back button / explicit exit).
  exitConfirmOpen: boolean
  requestExitConfirm: () => void
  dismissExitConfirm: () => void
}

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  user: null,
  config: null,
  view: "auth",
  examSessionId: null,
  startExamModuleId: null,
  openRoomId: null,
  exitConfirmOpen: false,

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

  openStudyRoom(roomId) {
    set({ openRoomId: roomId, view: "study" })
  },

  setUser(u) {
    markSeenSession(u !== null)
    set({ user: u, view: u ? "home" : "auth" })
  },

  enterExam(sessionId, moduleId) {
    set({ examSessionId: sessionId, startExamModuleId: moduleId, view: "exam" })
  },

  exitExam() {
    // The exam history entry dies with the session: retag it as "home" so a
    // later Back can never land on a sessionless ExamView (spinner forever).
    replaceViewState("home")
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

  patchUser(patch) {
    const user = get().user

    if (user) set({ user: { ...user, ...patch } })
  },

  requestExitConfirm() {
    set({ exitConfirmOpen: true })
  },

  dismissExitConfirm() {
    set({ exitConfirmOpen: false })
  },
}))

export { ApiError }
