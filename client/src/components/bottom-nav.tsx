
import { Home, BarChart3, Settings, Calculator } from "lucide-react"
import { useApp, type View } from "@/lib/store"
import { cn, ICON_STROKE_ACTION, ICON_STROKE_LARGE } from "@/lib/utils"
import { tabIndicatorStyle } from "@/components/animated-tabs"

interface NavItem {
  view: View
  label: string
  icon: typeof Home
}

const ITEMS: NavItem[] = [
  { view: "settings", label: "تنظیمات", icon: Settings },
  { view: "report", label: "کارنامه", icon: BarChart3 },
  { view: "home", label: "خانه", icon: Home },
  { view: "calculator", label: "درصدگیری", icon: Calculator },
]

export function BottomNav() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  // Views reached from elsewhere (archive, admin, exam…) own no tab:
  // the indicator hides instead of pointing at the wrong destination.
  const activeIndex = ITEMS.findIndex((item) => item.view === view)

  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur pb-safe"
    >
      <div className="relative max-w-3xl mx-auto">
        {activeIndex >= 0 && (
          <span
            aria-hidden="true"
            className="tab-indicator pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-full bg-primary"
            style={tabIndicatorStyle(ITEMS.length, activeIndex)}
          />
        )}
        <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const active = view === item.view
          const Icon = item.icon
          return (
            <li key={item.view}>
              <button
                type="button"
                onClick={() => setView(item.view)}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "group w-full flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors cursor-pointer",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full transition-colors",
                    active ? "bg-foreground text-background" : "group-hover:bg-accent",
                  )}
                >
                  {/* outline default, fill on active via fill-current */}
                  <Icon
                    className="size-5"
                    strokeWidth={active ? ICON_STROKE_ACTION : ICON_STROKE_LARGE}
                    fill={active ? "currentColor" : "none"}
                    fillOpacity={active ? 0.12 : 0}
                  />
                </span>
                <span className={cn("text-[10px] leading-none", active && "font-semibold")}>
                  {item.label}
                </span>
              </button>
            </li>
          )
        })}
        </ul>
      </div>
    </nav>
  )
}
