
import { Archive, GraduationCap, ShieldCheck, Trophy, Award } from "lucide-react"
import { useApp } from "@/lib/store"
import { ThemeToggle } from "@/components/theme-toggle"
import { FaNum } from "@/components/fa-utils"
import { cn } from "@/lib/utils"

export function TopBar() {
  const user = useApp((s) => s.user)
  const setView = useApp((s) => s.setView)
  const view = useApp((s) => s.view)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur pt-safe">
      {/* Adaptive gutters: tight on phones so the action cluster never
          overflows; comfortable from sm up. */}
      <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setView("home")}
          className="flex items-center gap-2 min-w-0 cursor-pointer group"
          aria-label="خانه"
        >
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="size-4" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 text-right">
            <p className="font-semibold text-sm leading-tight truncate">پودمان‌بان</p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {user?.name ?? "—"}
            </p>
          </div>
        </button>

        {/* shrink-0 keeps every 36px hit area intact on narrow screens
            while the brand side truncates instead of overflowing. */}
        <div className="flex items-center gap-1 shrink-0">
          {user && (
            <span className="hidden xs:inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              <FaNum>{user.totalTests}</FaNum>&nbsp;آزمون
            </span>
          )}
          <button
            type="button"
            onClick={() => setView("archive")}
            aria-label="آرشیو آزمون‌های قلمچی"
            title="آرشیو آزمون‌های قلمچی"
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-md transition-colors cursor-pointer",
              view === "archive"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Archive className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setView("leaderboard")}
            aria-label="رتبه‌بندی هنرجویان"
            title="رتبه‌بندی هنرجویان"
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-md transition-colors cursor-pointer",
              view === "leaderboard"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Trophy className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setView("achievements")}
            aria-label="دستاوردها"
            title="دستاوردها"
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-md transition-colors cursor-pointer",
              view === "achievements"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Award className="size-4" strokeWidth={2} />
          </button>
          {(user?.role === "ADMIN" || user?.role === "CONTENT_ADMIN") && (
            <button
              type="button"
              onClick={() => setView("admin")}
              aria-label="پنل مدیریت"
              title="پنل مدیریت"
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-md transition-colors cursor-pointer",
                view === "admin"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <ShieldCheck className="size-4" strokeWidth={2} />
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
