
import * as React from "react"
import { Megaphone, X } from "lucide-react"

export function Banner({ text, link }: { text: string; link?: string }) {
  const [dismissed, setDismissed] = React.useState(false)
  if (dismissed) return null

  // Defense in depth: the server allowlists http(s), but a link that somehow
  // arrives with another scheme (old data, compromised admin) must never
  // become a clickable <a href> — it renders as plain text instead.
  const safeLink = link && /^https?:\/\//i.test(link) ? link : undefined

  return (
    <div className="border-b border-border bg-secondary">
      <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-3">
        <Megaphone className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        <p className="flex-1 text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap">
          {safeLink ? (
            <a href={safeLink} className="underline underline-offset-4">
              {text}
            </a>
          ) : (
            text
          )}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="بستن اعلان"
          className="shrink-0 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
