/**
 * Error boundary — a render crash must never white-screen the app.
 *
 * Catches errors in the view tree, reports them to /api/client-logs with
 * the React component stack, and offers recovery (retry the view, or back
 * to home) instead of a dead page.
 */
import * as React from "react"
import { AlertTriangle, Home, RotateCcw } from "lucide-react"
import { reportClientError } from "@/lib/error-report"
import { Button } from "@/components/ui/button"
import { useApp } from "@/lib/store"

interface BoundaryState {
  error: Error | null
  errorId: string
}

function newErrorId(): string {
  try {
    const bytes = new Uint8Array(6)

    window.crypto.getRandomValues(bytes)

    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return String(Date.now().toString(36))
  }
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null, errorId: "" }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error, errorId: newErrorId() }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportClientError(`render crash: ${error.message}`, {
      errorId: this.state.errorId,
      stack: String(error.stack ?? "").slice(0, 1000),
      componentStack: String(info.componentStack ?? "").slice(0, 1000),
    })
  }

  private reset = () => {
    this.setState({ error: null, errorId: "" })
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <ErrorFallback
          errorId={this.state.errorId}
          onRetry={this.reset}
        />
      )
    }

    return this.props.children
  }
}

function ErrorFallback({ errorId, onRetry }: { errorId: string; onRetry: () => void }) {
  const setView = useApp((s) => s.setView)
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  React.useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center text-center px-6 py-16 gap-4"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="text-base font-bold outline-none">
        چیزی خراب شد
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
        نگران نباش — اطلاعاتت سر جاشه. با تلاش مجدد معمولاً درست می‌شود.
      </p>
      <p className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
        کد خطا: {errorId}
      </p>
      <div className="flex gap-2">
        <Button onClick={onRetry} className="cursor-pointer">
          <RotateCcw className="size-4" />
          تلاش مجدد
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            onRetry()
            setView("home")
          }}
          className="cursor-pointer"
        >
          <Home className="size-4" />
          بازگشت به خانه
        </Button>
      </div>
    </div>
  )
}
