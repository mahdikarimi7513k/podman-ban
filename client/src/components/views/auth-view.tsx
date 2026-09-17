
import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { transitionBase } from "@/lib/motion"
import { GraduationCap, Loader2, User, UserX } from "lucide-react"
import { useApp } from "@/lib/store"
import { apiFetch, ApiError } from "@/lib/api-client"
import type { AppUser } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type Mode = "login" | "register"

interface FieldState {
  value: string
  error?: string
}

const FIELD_LABELS = {
  username: "نام کاربری",
  password: "رمز عبور",
  name: "نام و نام خانوادگی",
} as const

export function AuthView() {
  const setUser = useApp((s) => s.setUser)
  const config = useApp((s) => s.config)
  // Server enforces this too — the closed screen is cosmetic.
  const registrationOpen = config?.registrationOpen !== false
  const registrationMessage = config?.registrationMessage?.trim() || null
  const [mode, setMode] = React.useState<Mode>("login")

  const [name, setName] = React.useState<FieldState>({ value: "" })
  const [username, setUsername] = React.useState<FieldState>({ value: "" })
  const [password, setPassword] = React.useState<FieldState>({ value: "" })
  const [field, setField] = React.useState<"FANI_HERFEI" | "KARDANESH">(
    "FANI_HERFEI",
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const validate = (): boolean => {
    let ok = true
    const u = username.value.trim()
    if (!/^[a-z0-9_.]{3,32}$/.test(u)) {
      setUsername((s) => ({
        ...s,
        error: "۳ تا ۳۲ نویسه (انگلیسی، عدد، _ یا نقطه)",
      }))
      ok = false
    } else setUsername((s) => ({ ...s, error: undefined }))

    if (password.value.length < 1) {
      setPassword((s) => ({ ...s, error: "رمز عبور را وارد کنید" }))
      ok = false
    } else if (
      mode === "register" &&
      (password.value.length < 8 ||
        !(/[a-zA-Z]/.test(password.value) && /\d/.test(password.value)))
    ) {
      setPassword((s) => ({ ...s, error: "حداقل ۸ نویسه شامل حرف و عدد" }))
      ok = false
    } else setPassword((s) => ({ ...s, error: undefined }))

    if (mode === "register") {
      if (name.value.trim().length < 2) {
        setName((s) => ({ ...s, error: "نام حداقل ۲ نویسه باشد" }))
        ok = false
      } else setName((s) => ({ ...s, error: undefined }))
    }
    return ok
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register"
      const body =
        mode === "login"
          ? { username: username.value, password: password.value }
          : {
              name: name.value.trim(),
              username: username.value,
              password: password.value,
              field,
            }
      const res = await apiFetch<{ user: AppUser }>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      })
      setUser(res.user)
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "خطایی رخ داد. دوباره تلاش کنید."
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-4">
              <GraduationCap className="size-7" strokeWidth={2.25} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">پودمان‌بان</h1>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              آزمون پودمانی هنرستان — تمرین، کارنامه و درصدگیری
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login" className="cursor-pointer">ورود</TabsTrigger>
                <TabsTrigger value="register" className="cursor-pointer">ثبت‌نام</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-5 focus-visible:outline-none">
                <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key="login"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={transitionBase}
                >
                <AuthForm
                  mode="login"
                  name={name}
                  username={username}
                  password={password}
                  field={field}
                  submitting={submitting}
                  formError={formError}
                  onNameChange={(v) => setName({ value: v })}
                  onUsernameChange={(v) => setUsername({ value: v })}
                  onPasswordChange={(v) => setPassword({ value: v })}
                  onFieldChange={setField}
                  onSubmit={submit}
                />
                </motion.div>
                </AnimatePresence>
              </TabsContent>
              <TabsContent value="register" className="mt-5 focus-visible:outline-none">
                <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key="register"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={transitionBase}
                >
                {!registrationOpen ? (
                  <RegistrationClosed
                    message={registrationMessage}
                    onBackToLogin={() => setMode("login")}
                  />
                ) : (
                  <AuthForm
                    mode="register"
                    name={name}
                    username={username}
                    password={password}
                    field={field}
                    submitting={submitting}
                    formError={formError}
                    onNameChange={(v) => setName({ value: v })}
                    onUsernameChange={(v) => setUsername({ value: v })}
                    onPasswordChange={(v) => setPassword({ value: v })}
                    onFieldChange={setField}
                    onSubmit={submit}
                  />
                )}
                </motion.div>
                </AnimatePresence>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  )
}

function RegistrationClosed({
  message,
  onBackToLogin,
}: {
  message: string | null
  onBackToLogin: () => void
}) {
  return (
    <div className="space-y-4 py-2 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <UserX className="size-6" strokeWidth={2} />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold">ثبت‌نام بسته است</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {message ?? "ثبت‌نام جدید فعلاً توسط مدیر بسته شده است."}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onBackToLogin}
        className="w-full h-11 text-base cursor-pointer"
      >
        بازگشت به ورود
      </Button>
    </div>
  )
}

interface AuthFormProps {
  mode: Mode
  name: FieldState
  username: FieldState
  password: FieldState
  field: "FANI_HERFEI" | "KARDANESH"
  submitting: boolean
  formError: string | null
  onNameChange: (v: string) => void
  onUsernameChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onFieldChange: (f: "FANI_HERFEI" | "KARDANESH") => void
  onSubmit: (e: React.FormEvent) => void
}

function AuthForm(props: AuthFormProps) {
  const {
    mode,
    name,
    username,
    password,
    field,
    submitting,
    formError,
    onNameChange,
    onUsernameChange,
    onPasswordChange,
    onFieldChange,
    onSubmit,
  } = props

  const firstInvalidRef = React.useRef<HTMLInputElement | null>(null)
  React.useEffect(() => {
    if (username.error && firstInvalidRef.current) {
      firstInvalidRef.current.focus()
    }
  }, [username.error])

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "register" && (
        <Field label={FIELD_LABELS.name} htmlFor="auth-name" error={name.error}>
          <Input
            id="auth-name"
            name="name"
            autoComplete="name"
            value={name.value}
            onChange={(e) => onNameChange(e.target.value)}
            aria-invalid={!!name.error}
            aria-describedby={name.error ? "auth-name-error" : undefined}
            placeholder="مثلاً: علی رضایی"
            className="h-11"
          />
        </Field>
      )}

      <Field label={FIELD_LABELS.username} htmlFor="auth-username" error={username.error}>
        <div className="relative">
          <User className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" strokeWidth={2} />
          <Input
            id="auth-username"
            name="username"
            autoComplete="username"
            dir="ltr"
            className="h-11 text-right pr-9"
            value={username.value}
            onChange={(e) => onUsernameChange(e.target.value.toLowerCase())}
            aria-invalid={!!username.error}
            aria-describedby={username.error ? "auth-username-error" : undefined}
            placeholder="username"
            ref={firstInvalidRef}
            spellCheck={false}
            autoCapitalize="off"
          />
        </div>
      </Field>

      <Field label={FIELD_LABELS.password} htmlFor="auth-password" error={password.error}>
        <Input
          id="auth-password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          dir="ltr"
          className="h-11 text-right"
          value={password.value}
          onChange={(e) => onPasswordChange(e.target.value)}
          aria-invalid={!!password.error}
          aria-describedby={password.error ? "auth-password-error" : undefined}
          placeholder="••••••••"
        />
      </Field>

      {mode === "register" && (
        <Field label="رشته تحصیلی" htmlFor="auth-field" error={undefined}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" id="auth-field">
            {(["FANI_HERFEI", "KARDANESH"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={field === f}
                onClick={() => onFieldChange(f)}
                className={cn(
                  "min-h-[44px] rounded-md border text-sm font-medium transition-colors cursor-pointer",
                  field === f
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background hover:bg-accent",
                )}
              >
                {f === "FANI_HERFEI" ? "شبکه" : "حسابداری"}
              </button>
            ))}
          </div>
        </Field>
      )}

      {formError && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {formError}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full h-11 text-base cursor-pointer"
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting
          ? mode === "login"
            ? "در حال ورود…"
            : "در حال ثبت‌نام…"
          : mode === "login"
            ? "ورود"
            : "ثبت‌نام"}
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
