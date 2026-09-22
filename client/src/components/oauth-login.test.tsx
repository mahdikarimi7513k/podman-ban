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
  API_BASE: "",
}))

import { AuthView } from "./views/auth-view"

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
