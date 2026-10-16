/**
 * usePwaInstall: hidden until the browser fires beforeinstallprompt,
 * then offers a working install button.
 */
import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { usePwaInstall } from "@/hooks/use-pwa-install"

describe("usePwaInstall", () => {
  it("stays hidden without a browser prompt", () => {
    const { result } = renderHook(() => usePwaInstall())

    expect(result.current.canInstall).toBe(false)
  })

  it("offers install after beforeinstallprompt and clears on accept", async () => {
    let prompted = false

    const { result } = renderHook(() => usePwaInstall())

    act(() => {
      const e = new Event("beforeinstallprompt")

      Object.defineProperties(e, {
        prompt: { value: () => { prompted = true } },
        userChoice: { value: Promise.resolve({ outcome: "accepted" }) },
      })
      window.dispatchEvent(e)
    })
    expect(result.current.canInstall).toBe(true)

    await act(async () => {
      await result.current.install()
    })
    expect(prompted).toBe(true)
    expect(result.current.canInstall).toBe(false)
  })
})
