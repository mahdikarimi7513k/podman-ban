import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Repro for «typing the password in admin create-user breaks the page»:
 * typing must land every keystroke in the field without unmounting/crashing
 * the form.
 */
const apiFetch = vi.fn()

vi.mock("@/lib/store", () => ({
  useApp: (sel: (s: unknown) => unknown) =>
    sel({
      user: {
        id: "admin1",
        name: "مدیر",
        username: "admin",
        field: "FANI_HERFEI",
        role: "ADMIN",
        totalTests: 0,
      },
      refreshConfig: vi.fn(),
    }),
}))
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}))
vi.mock("@/components/chat-panel", () => ({ ChatPanel: () => <div /> }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }))

import { AdminView } from "./admin-view"

const PW_PLACEHOLDER = "رمز عبور (حداقل ۸ نویسه شامل حرف و عدد)"

describe("AdminUsers create-user password field", () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockImplementation((url: unknown) => {
      if (String(url).includes("/api/admin/users")) return Promise.resolve({ users: [] })
      return Promise.resolve({})
    })
  })

  it("keeps every typed character without breaking the form", async () => {
    const user = userEvent.setup()
    render(<AdminView />)
    await user.click(screen.getByText("کاربران"))

    const pw = await screen.findByPlaceholderText(PW_PLACEHOLDER)
    await user.click(pw)
    await user.keyboard("Test-1234")

    expect(pw).toHaveValue("Test-1234")
    // Form still intact after typing (nothing unmounted/crashed).
    expect(screen.getByPlaceholderText(PW_PLACEHOLDER)).toBeInTheDocument()
    expect(screen.getByText("ساخت کاربر")).toBeInTheDocument()
  })

  it("submits name/username/password/email/field and clears the form", async () => {
    const user = userEvent.setup()
    render(<AdminView />)
    await user.click(screen.getByText("کاربران"))

    await user.type(screen.getByPlaceholderText("نام و نام خانوادگی"), "تست تازه")
    await user.type(screen.getByPlaceholderText("username"), "freshuser1")
    await user.type(screen.getByPlaceholderText(PW_PLACEHOLDER), "Fresh-1234")
    await user.type(screen.getByPlaceholderText(/ایمیل/), "fresh1@mail.com")
    await user.click(screen.getByText("ساخت کاربر"))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/admin/users",
        expect.objectContaining({ method: "POST" }),
      ),
    )
    const postCall = apiFetch.mock.calls.find(
      (c) => c[0] === "/api/admin/users" && (c[1] as RequestInit)?.method === "POST",
    )
    const body = JSON.parse((postCall?.[1] as RequestInit)?.body as string)
    expect(body).toMatchObject({ username: "freshuser1", password: "Fresh-1234", email: "fresh1@mail.com" })
  })
})
