import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

/**
 * Seam: the password-change form's PUBLIC behavior — on success it must force
 * re-login (setUser(null)) because the server kills every session.
 *
 * All factory-referenced holders are `mock`-prefixed (vi.hoisted) so the
 * hoisted vi.mock factories can legally read them.
 */
const { mockSetUser, mockApiFetch, mockPrefs } = vi.hoisted(() => ({
  mockSetUser: vi.fn(),
  mockApiFetch: vi.fn(),
  mockPrefs: { value: null as string | null },
}))

vi.mock("@/lib/store", () => ({
  useApp: (sel: (s: unknown) => unknown) =>
    sel({
      user: {
        id: "u1",
        name: "تست",
        username: "tester",
        field: "FANI_HERFEI",
        role: "STUDENT",
        totalTests: 0,
        prefs: mockPrefs.value,
      },
      signOut: vi.fn(),
      setUser: mockSetUser,
    }),
}))
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class extends Error {},
}))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }))
vi.mock("@/components/chat-panel", () => ({ ChatPanel: () => <div /> }))

import { SettingsView } from "./settings-view"

describe("PasswordChangeSection", () => {
  beforeEach(() => {
    mockSetUser.mockClear()
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue({ ok: true })
    mockPrefs.value = null
  })

  async function fillAndSubmit() {
    fireEvent.change(screen.getByLabelText("رمز عبور فعلی"), { target: { value: "Old-Pass-1" } })
    fireEvent.change(screen.getByLabelText("رمز عبور جدید", { selector: "input" }), {
      target: { value: "New-Pass-123" },
    })
    const confirmInput = screen.getByPlaceholderText("تکرار رمز جدید")
    fireEvent.change(confirmInput, { target: { value: "New-Pass-123" } })
    fireEvent.click(screen.getByText("تغییر رمز"))
  }

  it("after success forces re-login (setUser(null))", async () => {
    render(<SettingsView />)
    await fillAndSubmit()
    await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith(null))
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/user/password",
      expect.objectContaining({ method: "PUT" }),
    )
  })

  it("does NOT log out when the server rejects the change", async () => {
    mockApiFetch.mockRejectedValue(new Error("رمز عبور فعلی نادرست است"))
    render(<SettingsView />)
    await fillAndSubmit()
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled())
    expect(mockSetUser).not.toHaveBeenCalled()
  })

  it("blocks submit until the new password meets policy and matches", () => {
    render(<SettingsView />)
    fireEvent.change(screen.getByLabelText("رمز عبور فعلی"), { target: { value: "Old-Pass-1" } })
    fireEvent.change(screen.getByLabelText("رمز عبور جدید", { selector: "input" }), {
      target: { value: "short" },
    })
    const btn = screen.getByText("تغییر رمز") as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})

describe("repeat toggle (display-only inversion, backend untouched)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue({ ok: true })
    mockPrefs.value = null
  })

  function toggle() {
    return screen.getByRole("switch")
  }

  it("backend repeatQuestions:true (show repeats) renders the switch OFF", () => {
    mockPrefs.value = JSON.stringify({ repeatQuestions: true })
    render(<SettingsView />)
    expect(toggle().getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText("حذف سوالات تکراری")).toBeTruthy()
  })

  it("backend repeatQuestions:false (hide repeats) renders the switch ON", () => {
    mockPrefs.value = JSON.stringify({ repeatQuestions: false })
    render(<SettingsView />)
    expect(toggle().getAttribute("aria-checked")).toBe("true")
  })

  it("toggling ON sends repeatQuestions:false to the same prefs endpoint", async () => {
    mockPrefs.value = JSON.stringify({ repeatQuestions: true })
    render(<SettingsView />)
    fireEvent.click(toggle())
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/user/prefs",
        expect.objectContaining({ method: "PUT" }),
      ),
    )
    const init = mockApiFetch.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ repeatQuestions: false })
  })

  it("toggling OFF sends repeatQuestions:true", async () => {
    mockPrefs.value = JSON.stringify({ repeatQuestions: false })
    render(<SettingsView />)
    fireEvent.click(toggle())
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled())
    const init = mockApiFetch.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ repeatQuestions: true })
  })
})
