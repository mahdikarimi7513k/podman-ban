import * as React from "react"
import { motion, AnimatePresence, MotionConfig } from "framer-motion"
import { fadeUp, transitionFast } from "@/lib/motion"
import { ThemeProvider } from "next-themes"
import { AppBootstrap } from "@/components/app-bootstrap"
import { ServiceWorkerRegister } from "@/components/sw-register"
import { Toaster } from "@/components/ui/toaster"
import { useApp } from "@/lib/store"
import type { View } from "@/lib/store"
import { pushViewState, replaceViewState, readViewState } from "@/lib/view-history"
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
 * Only the exam entry is pushed (everything else replaces), so Back can
 * never trap the user: popping past our entries exits naturally, and Back
 * inside an exam opens the exit-confirm dialog instead of killing it.
 */
function useViewHistory(): void {
  const view = useApp((s) => s.view)

  React.useEffect(() => {
    replaceViewState(view)
  }, [])

  React.useEffect(() => {
    if (view === "exam") pushViewState("exam")
  }, [view])

  React.useEffect(() => {
    const onPop = () => {
      const st = useApp.getState()

      if (st.exitConfirmOpen) {
        st.dismissExitConfirm()

        return
      }

      const v = readViewState()

      if (v === st.view) return

      if (st.view === "exam") {
        st.requestExitConfirm()
        pushViewState("exam")

        return
      }

      if (v) {
        // SAFETY: readViewState only returns allowlisted view names.
        st.setView(v as View)
      }
      // v === null: popped past our entries — let the browser exit.
    }

    window.addEventListener("popstate", onPop)

    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // Android hardware back button (Capacitor). Same policy as popstate:
  // dialog → close, exam → confirm, otherwise back-or-minimize.
  React.useEffect(() => {
    let remove: (() => void) | undefined

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
          pushViewState("exam")

          return
        }

        if (canGoBack) window.history.back()
        else void CapApp.minimizeApp()
      })

      remove = () => {
        void sub.remove()
      }
    })()

    return () => remove?.()
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
