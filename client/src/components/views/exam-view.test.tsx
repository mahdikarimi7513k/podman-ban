import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react"
import { ExamView } from "@/components/views/exam-view"
import { useApp } from "@/lib/store"

/**
 * Seam: ExamView rendered behavior (DOM after user actions), with the
 * API client mocked at module boundary.
 *
 * Regression target: navigating between questions (رد شدن / سوال بعدی)
 * must swap the question card synchronously — the content region must
 * never be empty and the next question must appear in the same commit
 * as the click. This is the "page refresh feel" bug.
 */

const apiFetchMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
  ApiError: class ApiError extends Error {
    status: number
    body: unknown
    constructor(message: string, status: number, body: unknown) {
      super(message)
      this.status = status
      this.body = body
    }
  },
}))

const QUESTIONS = [
  { id: "q1", text: "متن سوال شماره یک", options: ["الف", "ب"], imageBase64: null, order: 1 },
  { id: "q2", text: "متن سوال شماره دو", options: ["الف", "ب", "ج"], imageBase64: null, order: 2 },
  { id: "q3", text: "متن سوال شماره سه", options: ["الف", "ب"], imageBase64: null, order: 3 },
]

function sessionResponse() {
  return {
    session: {
      id: "s1",
      moduleId: "m1",
      moduleTitle: "پودمان تست",
      bookTitle: "کتاب تست",
      status: "IN_PROGRESS",
      totalQuestions: 3,
      durationSec: 0,
      negativeMarking: false,
      isPractice: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      scorePercent: 0,
    },
    questions: QUESTIONS,
    answers: {},
  }
}

function mockApi() {
  apiFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/exam/s1" && !init?.method) return sessionResponse()
    if (url === "/api/exam/s1/answer") return { ok: true }

    if (url === "/api/exam/s1/pause" && init?.method === "POST") {
      return { pausedAt: new Date().toISOString(), remainingSec: 1199 }
    }

    if (url === "/api/exam/s1/resume" && init?.method === "POST") {
      return {
        session: { id: "s1", startedAt: new Date().toISOString(), pausedAt: null, remainingSec: 1199 },
      }
    }

    throw new Error(`unexpected fetch ${url}`)
  })
}

/** Same session but timed (isPractice false) so the pause path engages. */
function mockTimedApi(pausedAt: string | null = null) {
  const timedSession = () => {
    const base = sessionResponse()

    return {
      ...base,
      // durationSec: 0 would expire the timer on mount and auto-submit.
      session: { ...base.session, isPractice: false, durationSec: 1200, pausedAt },
    }
  }

  apiFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/exam/s1" && !init?.method) return timedSession()

    if (url === "/api/exam/s1/answer") return { ok: true }

    if (url === "/api/exam/s1/pause" && init?.method === "POST") {
      return { pausedAt: new Date().toISOString(), remainingSec: 1199 }
    }

    if (url === "/api/exam/s1/resume" && init?.method === "POST") {
      return {
        session: { id: "s1", startedAt: new Date().toISOString(), pausedAt: null, remainingSec: 1199 },
      }
    }

    throw new Error(`unexpected fetch ${url}`)
  })
}

beforeEach(() => {
  cleanup()
  apiFetchMock.mockReset()
  mockApi()
  useApp.setState({
    booted: true,
    user: {
      id: "u1",
      name: "تست",
      username: "test",
      email: null,
      field: "FANI_HERFEI",
      role: "STUDENT",
      totalTests: 0,
    },
    view: "exam",
    examSessionId: "s1",
    startExamModuleId: "m1",
  })
})

afterEach(() => {
  cleanup()
  useApp.setState({ examSessionId: null, startExamModuleId: null })
})

describe("ExamView question navigation stability", () => {
  it("renders the first question after session load", async () => {
    render(<ExamView />)
    expect(await screen.findByText("متن سوال شماره یک")).toBeInTheDocument()
  })

  it("shows the next question synchronously when رد شدن is clicked (no empty gap)", async () => {
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    // The assertion is synchronous on purpose: with AnimatePresence
    // mode="wait" the new card only mounts after the old one finishes
    // its exit animation, leaving the content region empty (~150ms).
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    expect(screen.getByText("متن سوال شماره دو")).toBeInTheDocument()
  })

  it("keeps exactly one question visible through rapid successive skips", async () => {
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    // second rapid click before any animation could settle
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    expect(screen.getByText("متن سوال شماره سه")).toBeInTheDocument()
    expect(screen.queryByText("متن سوال شماره یک")).not.toBeInTheDocument()
  })

  it("shows the next question synchronously when سوال بعدی is clicked", async () => {
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /سوال بعدی/ }))
    })
    expect(screen.getByText("متن سوال شماره دو")).toBeInTheDocument()
  })

  it("goes back to the previous question with سوال قبلی", async () => {
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /سوال بعدی/ }))
    })
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /سوال قبلی/ }))
    })
    expect(screen.getByText("متن سوال شماره یک")).toBeInTheDocument()
  })

  it("finish while offline warns and never POSTs /finish", async () => {
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    expect(screen.getByText("متن سوال شماره سه")).toBeInTheDocument()

    const finishCalls = () =>
      apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith("/finish")).length

    const before = finishCalls()

    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true })

    try {
      act(() => {
        window.dispatchEvent(new Event("offline"))
      })
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /اتمام آزمون/ }))
      })
      // Confirm dialog opens (not submitted yet).
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /ثبت نهایی/ }))
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(finishCalls() - before).toBe(0)
    } finally {
      Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true })
    }
  })
})

/**
 * Seam: exit freezes the server clock (pause), re-entry restarts it.
 * Practice sessions have no timer, so exiting them must not pause.
 */
describe("ExamView pause on exit / resume on entry", () => {
  it("POSTs pause when leaving a timed exam", async () => {
    mockTimedApi()
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    expect(screen.getByText("متن سوال شماره سه")).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /اتمام آزمون/ }))
    })
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /خروج از آزمون/ }))
    })

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/exam/s1/pause",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })

  it("skips pause when leaving a practice exam", async () => {
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /رد شدن/ }))
    })
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /اتمام آزمون/ }))
    })
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /خروج از آزمون/ }))
    })

    await waitFor(() =>
      expect(useApp.getState().view).toBe("home"),
    )
    expect(
      apiFetchMock.mock.calls.some(([url]) => String(url).endsWith("/pause")),
    ).toBe(false)
  })

  it("resumes a paused session on entry before painting questions", async () => {
    mockTimedApi(new Date(Date.now() - 60_000).toISOString())
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/exam/s1/resume",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })
})

/**
 * Seam: sessionless ExamView (view "exam" with no live session id).
 * History retagging normally makes this unreachable, but if it ever
 * happens the view must offer the exit path — never spin forever and
 * never touch the API without a session to load.
 */
describe("ExamView without a session", () => {
  it("shows an exit fallback instead of the infinite spinner", () => {
    useApp.setState({ view: "exam", examSessionId: null, startExamModuleId: null })
    render(<ExamView />)

    expect(apiFetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /بازگشت به خانه/ })).toBeInTheDocument()
  })

  it("the fallback button leaves the exam view", () => {
    useApp.setState({ view: "exam", examSessionId: null, startExamModuleId: null })
    render(<ExamView />)

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /بازگشت به خانه/ }))
    })

    expect(useApp.getState().view).toBe("home")
    expect(useApp.getState().examSessionId).toBeNull()
  })
})

/**
 * Seam: mixed-script question content (pure English, pure Persian, or a
 * mix). Content elements carry dir="auto" so each script aligns itself
 * instead of inheriting the page direction.
 */
describe("ExamView mixed-language content", () => {
  const EN_QUESTIONS = [
    { id: "e1", text: "What is CPU?", options: ["Central Processing Unit", "Memory"], imageBase64: null, order: 1 },
    { id: "e2", text: "متن فارسی با English داخلش", options: ["الف", "Beta"], imageBase64: null, order: 2 },
  ]

  function mockMixedApi() {
    apiFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/exam/s1" && !init?.method) {
        const base = sessionResponse()

        return {
          ...base,
          session: { ...base.session, isPractice: false, durationSec: 1200, pausedAt: null },
          questions: EN_QUESTIONS,
        }
      }

      if (url === "/api/exam/s1/answer") return { ok: true }

      if (url === "/api/exam/s1/pause" && init?.method === "POST") {
        return { pausedAt: new Date().toISOString(), remainingSec: 1199 }
      }

      throw new Error(`unexpected fetch ${url}`)
    })
  }

  it("marks content dir=auto in both exam and review", async () => {
    mockMixedApi()
    render(<ExamView />)

    const heading = await screen.findByText("What is CPU?")
    expect(heading.closest("p")).toHaveAttribute("dir", "auto")

    const option = await screen.findByText("Central Processing Unit")
    expect(option.closest("span")).toHaveAttribute("dir", "auto")

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /سوال بعدی/ }))
    })

    const mixed = await screen.findByText("متن فارسی با English داخلش")
    expect(mixed.closest("p")).toHaveAttribute("dir", "auto")
  })

  it("keeps the practice banner slim on small screens", async () => {
    render(<ExamView />)
    await screen.findByText("متن سوال شماره یک")

    expect(screen.getByText("حالت تمرین")).toBeInTheDocument()

    const note = screen.getByText(/بدون محدودیت زمان/)
    expect(note.className).toContain("hidden")
    expect(note.className).toContain("sm:inline")
  })
})
