
import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Loader2, Circle } from "lucide-react"
import { useChat, type ChatMessage } from "@/hooks/use-chat"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { FaNum } from "@/components/fa-utils"
import { cn } from "@/lib/utils"

interface ChatPanelProps {
  userId: string
  isAdmin: boolean
  /** admin-only: called when the conversation is viewed (mark read) */
  onViewed?: () => void
  /** compact mode for embedding in settings */
  height?: string
}

export function ChatPanel({
  userId,
  isAdmin,
  onViewed,
  height = "h-[55vh]",
}: ChatPanelProps) {
  const { messages, loading, connected, sending, send, markRead } = useChat({
    userId,
    isAdmin,
  })
  const [text, setText] = React.useState("")
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // Snap to bottom on new messages only while the user is already reading
  // the latest ones — never yank the scroll while typing or reading history.
  const nearBottomRef = React.useRef(true)

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
  }

  // auto-scroll to bottom on new message (when already near bottom)
  React.useEffect(() => {
    const el = scrollRef.current
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  // admin: mark read when opening / new messages arrive
  React.useEffect(() => {
    if (isAdmin && onViewed) {
      onViewed()
      void markRead()
    }
  }, [isAdmin, onViewed, markRead, messages.length])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    nearBottomRef.current = true // my own message → follow to bottom
    void send(text)
    setText("")
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
      {/* header: connection status */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
        <span className="relative flex size-2">
          {connected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          )}
          <Circle
            className={cn("relative size-2 rounded-full", connected ? "fill-success text-success" : "fill-muted-foreground text-muted-foreground")}
          />
        </span>
        <span className="text-xs text-muted-foreground">
          {connected ? "متصل" : "در حال اتصال…"}
        </span>
        <span className="ms-auto text-xs text-muted-foreground tabular-nums">
          <FaNum>{messages.length}</FaNum> پیام
        </span>
      </div>

      {/* messages */}
      <div ref={scrollRef} onScroll={onScroll} className={cn("scroll-mono overflow-y-auto px-1", height)}>
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {isAdmin ? "هنوز پیامی وجود ندارد." : "پیامی برای پشتیبانی ارسال نکرده‌اید."}
              <br />
              {isAdmin ? "اولین پاسخ را شما بدهید." : "سوال خود را بنویسید تا مدیریت پاسخ دهد."}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} isAdmin={isAdmin} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* composer */}
      <form onSubmit={submit} className="border-t border-border p-2 flex items-end gap-2 bg-background">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isAdmin ? "پاسخ به کاربر…" : "پیام خود را بنویسید…"}
          rows={1}
          className="min-h-[44px] max-h-32 resize-none border-border bg-background"
          disabled={sending}
          aria-label="متن پیام"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!text.trim() || sending}
          className="size-10 shrink-0 cursor-pointer"
          aria-label="ارسال"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4 rtl:-scale-x-100" strokeWidth={2.25} />
          )}
        </Button>
      </form>
    </div>
  )
}

function MessageBubble({ msg, isAdmin }: { msg: ChatMessage; isAdmin: boolean }) {
  const mine = isAdmin ? msg.sender === "ADMIN" : msg.sender === "STUDENT"
  const time = new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(msg.createdAt))

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className={cn("flex", mine ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2",
          mine
            ? "bg-foreground text-background rounded-bl-sm"
            : "bg-secondary text-secondary-foreground rounded-br-sm",
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {msg.text}
        </p>
        <p
          className={cn(
            "mt-1 text-[10px] tabular-nums",
            mine ? "text-background/60" : "text-muted-foreground",
          )}
        >
          {time}
        </p>
      </div>
    </motion.div>
  )
}
