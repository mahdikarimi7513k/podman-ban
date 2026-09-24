import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Animated tab list with a sliding indicator (no measurement needed).
 *
 * The indicator is positioned purely with logical CSS: each tab owns an
 * equal share of the padded track, so `inset-inline-start` glides it in
 * both LTR and RTL with zero getBoundingClientRect calls. Motion follows
 * the app standard (180ms, same ease as lib/motion) and is disabled
 * under prefers-reduced-motion (see .tab-indicator in index.css).
 *
 * Accessibility follows the WAI-ARIA tab pattern: roving tabindex,
 * automatic activation, arrow keys (in RTL, ArrowLeft moves forward),
 * Home/End. Panels are rendered by the caller through the render prop.
 */

export interface AnimatedTab {
  value: string
  label: string
}

interface AnimatedTabsProps {
  tabs: readonly AnimatedTab[]
  value: string
  onValueChange: (value: string) => void
  id?: string
  className?: string
  children: (active: string) => React.ReactNode
}

/** Equal-share indicator geometry as pure CSS (shared with BottomNav). */
export function tabIndicatorStyle(count: number, index: number): React.CSSProperties {
  return {
    width: `calc((100% - 0.5rem) / ${count})`,
    insetInlineStart: `calc(0.25rem + ${index} * ((100% - 0.5rem) / ${count}))`,
  }
}

export function AnimatedTabs({
  tabs,
  value,
  onValueChange,
  id,
  className,
  children,
}: AnimatedTabsProps) {
  const baseId = React.useId()
  const rootId = id ?? `animated-tabs-${baseId}`

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.value === value),
  )

  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([])

  const focusTab = (index: number): void => {
    const el = tabRefs.current[index]

    if (el) el.focus()
  }

  const move = (delta: 1 | -1): void => {
    const next = (activeIndex + delta + tabs.length) % tabs.length
    const tab = tabs[next]

    if (tab) {
      onValueChange(tab.value)
      focusTab(next)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    // In RTL the visual "forward" direction points left.
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      move(1)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      move(-1)
    } else if (e.key === "Home") {
      e.preventDefault()

      const first = tabs[0]

      if (first) {
        onValueChange(first.value)
        focusTab(0)
      }
    } else if (e.key === "End") {
      e.preventDefault()

      const last = tabs[tabs.length - 1]

      if (last) {
        onValueChange(last.value)
        focusTab(tabs.length - 1)
      }
    }
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="تب‌ها"
        onKeyDown={onKeyDown}
        className="relative grid auto-cols-fr grid-flow-col gap-0 rounded-lg border border-border bg-muted/40 p-1"
      >
        <span
          aria-hidden="true"
          className="tab-indicator pointer-events-none absolute inset-y-1 rounded-md bg-card shadow-sm ring-1 ring-border"
          style={tabIndicatorStyle(tabs.length, activeIndex)}
        />
        {tabs.map((tab, i) => {
          const selected = i === activeIndex

          return (
            <button
              key={tab.value}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${rootId}-tab-${tab.value}`}
              aria-selected={selected}
              aria-controls={`${rootId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(tab.value)}
              className={cn(
                "relative z-10 min-h-[44px] cursor-pointer rounded-md px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`${rootId}-panel`}
        aria-labelledby={`${rootId}-tab-${tabs[activeIndex]?.value ?? ""}`}
        tabIndex={0}
        className="mt-5 focus-visible:outline-none"
      >
        {children(tabs[activeIndex]?.value ?? "")}
      </div>
    </div>
  )
}
