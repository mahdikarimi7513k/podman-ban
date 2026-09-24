import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useApp } from "@/lib/store"

/**
 * Seam: social login UI (mocked transport, real store + real components).
 *  - buttons render only when the server advertises the provider,
 *  - a pending verified profile opens the field picker and completes
 *    signup with the picked field.
 */
const apiFetch = vi.fn()

vi.mock("@/lib/api-client", () => ({
  apiFetch: (url: string, init?: RequestInit) => apiFetch(url, init),
  ApiError: class extends Error {},
  // Absolute on purpose: the APK build bakes the real origin in, which is
  // exactly what caught the double-prefix bug below.
  API_BASE: "https://api.example.com",
}))

import { AuthView } from "./views/auth-view"
import { SocialButtons } from "./social-buttons"

declare global {
  // Test-only bridge flag so isNativeApp() takes the APK path. Only ever
  // assigned/deleted inside the native test below.
  interface Window {
    androidBridge?: unknown
  }
}

function setConfig(oauth: { google: boolean; github: boolean }) {
  useApp.setState({
    user: null,
    config: {
      siteLocked: false,
      lockMessage: "",
      bannerText: "",
      bannerLink: "",
      bannerActive: false,
      defaultTimerMin: 20,
      negativeMarking: true,
      dailyGoalNotify: false,
      oauth,
    },
  })
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockImplementation((url: string) => {
    if (String(url).includes("/api/auth/oauth/pending")) {
      return Promise.reject(new Error("no pending"))
    }

    return Promise.resolve({})
  })
  setConfig({ google: false, github: false })
})

describe("SocialButtons visibility", () => {
  it("hides both provider buttons when the server disables them", async () => {
    render(<AuthView />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText("username")).toBeInTheDocument()
    })

    expect(screen.queryByText("ادامه با گوگل")).not.toBeInTheDocument()

    expect(screen.queryByText("ادامه با گیت‌هاب")).not.toBeInTheDocument()
  })

  it("shows both provider buttons when enabled", async () => {
    setConfig({ google: true, github: true })
    render(<AuthView />)

    expect(await screen.findByText("ادامه با گوگل")).toBeInTheDocument()

    expect(screen.getByText("ادامه با گیت‌هاب")).toBeInTheDocument()
  })

  it("shows only the enabled provider", async () => {
    setConfig({ google: true, github: false })
    render(<AuthView />)

    expect(await screen.findByText("ادامه با گوگل")).toBeInTheDocument()

    expect(screen.queryByText("ادامه با گیت‌هاب")).not.toBeInTheDocument()
  })
})

describe("OAuthPending field picker", () => {
  it("completes signup with the picked field", async () => {
    const user = userEvent.setup()
    apiFetch.mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/oauth/pending")) {
        return Promise.resolve({
          profile: { provider: "google", email: "g@mail.com", name: "G User" },
        })
      }

      if (String(url).includes("/api/auth/oauth/complete")) {
        return Promise.resolve({
          user: { id: "u9", name: "G User", role: "STUDENT", field: "FANI_HERFEI" },
        })
      }

      return Promise.resolve({})
    })
    setConfig({ google: true, github: false })
    render(<AuthView />)

    expect(await screen.findByText(/یک قدم مانده/)).toBeInTheDocument()

    expect(screen.getByText("g@mail.com")).toBeInTheDocument()

    await user.click(screen.getByText("ساخت حساب"))

    await waitFor(() =>

      expect(apiFetch).toHaveBeenCalledWith(
        "/api/auth/oauth/complete",

        expect.objectContaining({ method: "POST" }),
      ),
    )
    const call = apiFetch.mock.calls.find((c) => String(c[0]).includes("/complete"))

    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      field: "FANI_HERFEI",
    })

    expect(useApp.getState().user?.id).toBe("u9")
  })
})

describe("SocialButtons native start", () => {
  it("requests a relative start URL (apiFetch adds the origin itself)", async () => {
    const user = userEvent.setup()

    // Simulate the APK WebView for bridge detection.
    window.androidBridge = {}

    try {
      render(
        <SocialButtons
          enabled={{ google: true, github: false }}
          onDone={vi.fn()}
          onPending={vi.fn()}
          onError={vi.fn()}
        />,
      )

      await user.click(await screen.findByText("ادامه با گوگل"))

      // Regression: an absolute URL here got prefixed a second time
      // (https://…https://…), so every APK tap failed before the system
      // browser even opened. (The trailing undefined is the absent init,
      // forwarded explicitly by the mock wrapper below.)
      await waitFor(() =>
        expect(apiFetch).toHaveBeenCalledWith("/api/auth/oauth/google?mode=native", undefined),
      )
    } finally {
      delete window.androidBridge
    }
  })
})

describe("Password warning", () => {
  it("warns on the register tab that the password is unrecoverable, not on login", async () => {
    const user = userEvent.setup()
    render(<AuthView />)

    await screen.findByPlaceholderText("username")
    expect(screen.queryByText(/قابل بازیابی نیست/)).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "ثبت‌نام" }))

    expect(await screen.findByText(/قابل بازیابی نیست/)).toBeInTheDocument()
  })
})

describe("Password visibility toggle", () => {
  it("reveals and hides the password with an accessible toggle", async () => {
    const user = userEvent.setup()
    render(<AuthView />)

    const input = await screen.findByPlaceholderText("••••••••")
    expect(input).toHaveAttribute("type", "password")

    await user.click(screen.getByRole("button", { name: "نمایش رمز" }))

    expect(input).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "پنهان کردن رمز" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    await user.click(screen.getByRole("button", { name: "پنهان کردن رمز" }))

    expect(input).toHaveAttribute("type", "password")
  })

  it("keeps credential inputs left-aligned LTR", async () => {
    render(<AuthView />)

    const username = await screen.findByPlaceholderText("username")

    expect(username).toHaveAttribute("dir", "ltr")
    expect(username.className).toContain("text-left")
  })
})
