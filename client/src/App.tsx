import * as React from "react"
import { motion, AnimatePresence, MotionConfig } from "framer-motion"
import { fadeUp, transitionFast } from "@/lib/motion"
import { ThemeProvider } from "next-themes"
import { AppBootstrap } from "@/components/app-bootstrap"
import { ServiceWorkerRegister } from "@/components/sw-register"
import { Toaster } from "@/components/ui/toaster"
import { useApp } from "@/lib/store"
import {
  pushViewState,
  replaceViewState,
  readViewState,
  resolvePopState,
} from "@/lib/view-history"
import { isNativeApp } from "@/lib/native-notify"
import { TopBar } from "@/components/top-bar"
import { BottomNav } from "@/components/bottom-nav"
import { Banner } from "@/components/banner"
import { AuthView } from "@/components/views/auth-view"
import { HomeView } from "@/components/views/home-view"

// Views off the critical path load on demand — keeps the initial module
// graph small in dev and produces per-view chunks in the production build.
function lazyNamed(loader: () => Promise<Record<string, unknown>>, name: string) {
  return React.lazy(async () => {
    const mod = await loader()
    return { default: mod[name] as React.ComponentType }
  })
}

const ExamView = lazyNamed(() => import("@/components/views/exam-view"), "ExamView")

/** Warm the exam chunk early (hover/intent on «شروع آزمون») so clicking
 *  doesn't wait on the lazy fetch. Idempotent — one dynamic import. */
export function preloadExamView(): void {
  void import("@/components/views/exam-view")
}
const ReportView = lazyNamed(() => import("@/components/views/report-view"), "ReportView")
const SettingsView = lazyNamed(() => import("@/components/views/settings-view"), "SettingsView")
const CalculatorView = lazyNamed(() => import("@/components/views/calculator-view"), "CalculatorView")
const ArchiveView = lazyNamed(() => import("@/components/views/archive-view"), "ArchiveView")
const AdminView = lazyNamed(() => import("@/components/views/admin-view"), "AdminView")
const LeaderboardView = lazyNamed(() => import("@/components/views/leaderboard-view"), "LeaderboardView")
const AchievementsView = lazyNamed(() => import("@/components/views/achievements-view"), "AchievementsView")
// Takes a `message` prop — direct lazy() keeps its real prop types.
const MaintenanceView = React.lazy(() =>
  import("@/components/views/maintenance-view").then((m) => ({ default: m.MaintenanceView })),
)

function ViewFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <div
        className="size-8 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin"
        role="status"
        aria-label="در حال بارگذاری"
      />
    </div>
  )
}

const viewVariants = fadeUp

/**
 * Browser back button + Android hardware back button.
 * Every UI view change pushes a history entry, so Back walks views
 * backwards instead of leaving the site/app; leaving is only possible from
 * the first entry. One pure function (resolvePopState) decides every pop,
 * and Back inside an exam opens the exit-confirm dialog instead of killing
 * it.
 */
function useViewHistory(): void {
  const view = useApp((s) => s.view)
  // Set by the popstate handler right before setView(follow): the view
  // effect must not push a second entry for a navigation history already owns.
  const popFollow = React.useRef(false)

  React.useEffect(() => {
    replaceViewState(view)
  }, [])

  React.useEffect(() => {
    if (popFollow.current) {
      popFollow.current = false

      return
    }

    // Reconcile instead of blind push: exitExam() already retagged the exam
    // entry as "home", and a duplicate entry would only cost one dead Back press.
    if (readViewState() === view) return

    pushViewState(view)
  }, [view])

  React.useEffect(() => {
    const onPop = () => {
      const st = useApp.getState()

      const action = resolvePopState(readViewState(), {
        dialogOpen: st.exitConfirmOpen,
        view: st.view,
        signedIn: st.user !== null,
        isAdmin: st.user?.role === "ADMIN" || st.user?.role === "CONTENT_ADMIN",
        hasExamSession: st.examSessionId !== null,
      })

      switch (action.type) {
        case "dismiss-dialog":
          // The pop moved the stack while the view stayed put — re-stick it.
          pushViewState(st.view)
          st.dismissExitConfirm()

          return
        case "confirm-exit":
          // Same drift, opposite direction: view is "exam" (policy guarantees).
          pushViewState(st.view)
          st.requestExitConfirm()

          return
        case "retag":
          // Stale entry for the current session (auth/admin/exam): keep the
          // visible view, rewrite the entry so the next Back walks past it
          // instead of looping on it.
          replaceViewState(st.view)

          return
        case "follow":
          popFollow.current = true
          st.setView(action.view)

          return
        case "ignore":
        case "leave":
          // "ignore": entry already matches the view. "leave": popped below
          // our own stack — let the browser exit on its own.
          return
      }
    }

    window.addEventListener("popstate", onPop)

    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // Android hardware back button (Capacitor). Same policy as popstate — but
  // with a listener registered the WebView never pops on its own, so each
  // branch performs its own history effect: dialog → close, exam → confirm,
  // otherwise back-or-minimize.
  React.useEffect(() => {
    let remove: (() => void) | undefined
    let cancelled = false

    void (async () => {
      if (!isNativeApp()) return
      const { App: CapApp } = await import("@capacitor/app")

      const sub = await CapApp.addListener("backButton", ({ canGoBack }) => {
        const st = useApp.getState()

        if (st.exitConfirmOpen) {
          st.dismissExitConfirm()

          return
        }

        if (st.view === "exam") {
          st.requestExitConfirm()

          // Drift safety: keep the invariant (current entry === "exam").
          if (readViewState() !== "exam") pushViewState("exam")

          return
        }

        if (canGoBack) window.history.back()
        else void CapApp.minimizeApp()
      })

      if (cancelled) {
        void sub.remove()

        return
      }

      remove = () => {
        void sub.remove()
      }
    })()

    return () => {
      cancelled = true
      remove?.()
    }
  }, [])
}

function AppContent() {
  const user = useApp((s) => s.user)
  const config = useApp((s) => s.config)
  const view = useApp((s) => s.view)
  useViewHistory()

  if (config?.siteLocked && user?.role !== "ADMIN" && user?.role !== "CONTENT_ADMIN") {
    return <MaintenanceView message={config.lockMessage} />
  }

  if (!user) {
    return (
      <div className="min-h-dvh flex flex-col bg-background">
        <AuthView />
        <Footer />
      </div>
    )
  }

  if (view === "exam") {
    return (
      <React.Suspense fallback={<ViewFallback />}>
        <ExamView />
      </React.Suspense>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <TopBar />
      {config?.bannerActive && config.bannerText ? (
        <Banner text={config.bannerText} link={config.bannerLink} />
      ) : null}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pb-28 pt-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transitionFast}
          >
            {view === "home" && <HomeView />}
            <React.Suspense fallback={<ViewFallback />}>
              {view === "report" && <ReportView />}
              {view === "settings" && <SettingsView />}
              {view === "calculator" && <CalculatorView />}
              {view === "archive" && <ArchiveView />}
              {view === "leaderboard" && <LeaderboardView />}
              {view === "achievements" && <AchievementsView />}
              {view === "admin" && (user?.role === "ADMIN" || user?.role === "CONTENT_ADMIN") && <AdminView />}
            </React.Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav />
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-background/80 backdrop-blur">
      <div className="max-w-3xl mx-auto px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          پودمان‌بان — ساخته‌شده برای هنرجویان شبکه و حسابداری
        </p>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user">
        <AppBootstrap>
          <AppContent />
        </AppBootstrap>
      </MotionConfig>
      <ServiceWorkerRegister />
      <Toaster />
    </ThemeProvider>
  )
}
