import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { AnimatedTabs, tabIndicatorStyle } from "./animated-tabs"
import { BottomNav } from "./bottom-nav"
import { useApp } from "@/lib/store"

/**
 * Seam: animated tab list (DOM + keyboard, no measurement).
 *  - indicator glides via inset-inline-start (logical: RTL-safe),
 *  - keyboard follows the RTL tab pattern (ArrowLeft = next),
 *  - tabs/panels carry the correct ARIA wiring.
 */

const TABS = [
  { value: "a", label: "الف" },
  { value: "b", label: "ب" },
  { value: "c", label: "ج" },
] as const

function Harness({ initial = "a" }: { initial?: string }) {
  const [value, setValue] = React.useState(initial)

  return (
    <AnimatedTabs tabs={TABS} value={value} onValueChange={setValue}>
      {(active) => <p>panel:{active}</p>}
    </AnimatedTabs>
  )
}

/** Focused element or bust — key events need a real target. */
function focused(): Element {
  const el = document.activeElement

  if (!(el instanceof Element)) throw new Error("nothing focused")

  return el
}

describe("AnimatedTabs", () => {
  it("renders tabs with tablist semantics and the active panel", () => {
    render(<Harness />)

    expect(screen.getByRole("tablist")).toBeInTheDocument()

    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    expect(tabs[1]).toHaveAttribute("aria-selected", "false")
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel:a")
  })

  it("click switches the tab and glides the indicator", async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)
    const indicator = container.querySelector(".tab-indicator") as HTMLElement | null

    expect(indicator).not.toBeNull()

    const before = indicator?.style.insetInlineStart

    await user.click(screen.getByRole("tab", { name: "ب" }))

    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel:b")
    expect(indicator?.style.insetInlineStart).not.toBe(before)
  })

  it("ArrowLeft moves forward and ArrowRight moves back (RTL)", () => {
    render(<Harness />)
    const first = screen.getByRole("tab", { name: "الف" })

    first.focus()
    fireEvent.keyDown(first, { key: "ArrowLeft" })
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel:b")

    fireEvent.keyDown(focused(), { key: "ArrowRight" })
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel:a")
  })

  it("Home and End jump to the edges", () => {
    render(<Harness />)
    const first = screen.getByRole("tab", { name: "الف" })

    first.focus()
    fireEvent.keyDown(first, { key: "End" })
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel:c")

    fireEvent.keyDown(focused(), { key: "Home" })
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel:a")
  })

  it("exposes equal-share geometry without measuring", () => {
    const one = tabIndicatorStyle(2, 0)
    const two = tabIndicatorStyle(2, 1)

    expect(one.width).toBe(two.width)
    expect(one.width).toContain("calc")
    expect(String(one.insetInlineStart)).not.toBe(String(two.insetInlineStart))
    expect(Object.keys(one)).not.toContain("left")
  })
})

describe("BottomNav active state", () => {
  beforeEach(() => {
    cleanup()
  })

  it("marks the active destination without any sliding indicator", () => {
    useApp.setState({ view: "home" })
    const first = render(<BottomNav />)

    expect(first.container.querySelector(".tab-indicator")).toBeNull()
    expect(first.container.querySelector('[aria-current="page"]')).toHaveTextContent("خانه")
    first.unmount()

    useApp.setState({ view: "admin" })
    const second = render(<BottomNav />)
    expect(second.container.querySelector(".tab-indicator")).toBeNull()
    second.unmount()

    useApp.setState({ view: "auth", user: null, examSessionId: null })
  })
})
