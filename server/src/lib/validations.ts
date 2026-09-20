import type { Response } from "express"
import { z } from "zod"

/** Standard zod parse → 422 on failure. Returns the parsed data or null. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const result = schema.safeParse(body)
  if (!result.success) {
    res
      .status(422)
      .json({ error: result.error.issues[0]?.message ?? "ورودی نامعتبر است" })
    return null
  }
  return result.data
}

// username: 3..32 chars, lowercase letters/digits/_/, allowed Persian letters too
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/\s+/g, ""))
  .refine((v) => /^[a-z0-9_.]{3,32}$/.test(v), {
    message: "نام کاربری باید ۳ تا ۳۲ نویسه (انگلیسی، عدد، _ یا نقطه) باشد",
  })

export const passwordSchema = z
  .string()
  .min(8, "رمز عبور حداقل ۸ کاراکتر باشد")
  .max(72, "رمز عبور حداکثر ۷۲ کاراکتر باشد") // bcrypt limit
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
    message: "رمز عبور باید شامل حرف و عدد باشد",
  })

export const nameSchema = z
  .string()
  .trim()
  .min(2, "نام حداقل ۲ نویسه باشد")
  .max(40, "نام حداکثر ۴۰ نویسه باشد")

export const registerSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  password: passwordSchema,
  field: z.enum(["FANI_HERFEI", "KARDANESH"]),
})

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "رمز عبور را وارد کنید"),
})

// External machine-to-machine verification: same credentials as login plus
// an OPTIONAL study field. When sent, it must match the user's real field.
export const externalVerifySchema = loginSchema.extend({
  field: z.enum(["FANI_HERFEI", "KARDANESH"]).optional(),
})

export const startExamSchema = z.object({
  moduleId: z.string().min(1),
  durationMin: z.number().int().min(1).max(180).optional(),
  practice: z.boolean().optional(),
})

export const answerSchema = z.object({
  questionId: z.string().min(1),
  // questions may carry 2..6 options → index range 0..5; the engine also
  // validates the index against the question's real options.length
  selectedOption: z.number().int().min(0).max(5).nullable(),
  timeSpentMs: z.number().int().min(0).optional(),
})

export const finishSchema = z.object({
  force: z.boolean().optional(),
})

export const prefsSchema = z.object({
  repeatQuestions: z.boolean().optional(),
  examDurationMin: z.number().int().min(5).max(180).optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
  dailyGoal: z.number().int().min(5).max(200).optional(),
})

// ---- Admin content management ----
export const bookCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  // null/omitted = shared book visible to BOTH fields
  field: z.enum(["FANI_HERFEI", "KARDANESH"]).nullable().optional(),
  order: z.number().int().default(0),
})
export const bookUpdateSchema = bookCreateSchema.partial()

export const moduleCreateSchema = z.object({
  bookId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  order: z.number().int().default(0),
})
export const moduleUpdateSchema = moduleCreateSchema.partial().omit({ bookId: true })

// imageBase64 may be a data URL; cap at ~2MB
// claude-red xss: SVG data URLs can carry <script> — block svg+xml even
// though <img> usually neuters it (copy-paste / download / old browsers).
// Only raster images reach the client.
export const questionCreateSchema = z.object({
  moduleId: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctOption: z.number().int().min(0).max(5),
  explanation: z.string().trim().max(1000).optional(),
  imageBase64: z
    .string()
    .max(2_500_000, "تصویر خیلی بزرگ است (حداکثر ۲ مگابایت)")
    .refine(
      (v) => !v || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
      "تصویر باید یک data URL معتبر (png، jpg، webp یا gif) باشد",
    )
    .optional()
    .nullable(),
})
export const questionUpdateSchema = questionCreateSchema.partial().omit({ moduleId: true })

export const archiveCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  field: z.enum(["FANI_HERFEI", "KARDANESH"]),
  year: z.number().int().min(1300).max(1500),
  month: z.number().int().min(1).max(12).nullable().optional(),
  // Link OR uploaded file — the route enforces "at least one deliverable".
  fileUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "لینک باید با http(s) شروع شود")
    .optional()
    .nullable(),
  answerUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "لینک باید با http(s) شروع شود")
    .optional()
    .nullable(),
  institutionId: z.string().optional().nullable(),
})

export const remoteConfigUpdateSchema = z.object({
  siteLocked: z.boolean().optional(),
  lockMessage: z.string().max(500).optional(),
  bannerText: z.string().max(300).optional(),
  // Same scheme allowlist as archive fileUrl/answerUrl above: the banner
  // renders as <a href> for every student, so javascript:/data:/etc. here
  // would be stored XSS. Empty string clears the link.
  bannerLink: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "لینک باید با http(s) شروع شود")
    .optional(),
  bannerActive: z.boolean().optional(),
  defaultTimerMin: z.number().int().min(1).max(180).optional(),
  negativeMarking: z.boolean().optional(),
  registrationOpen: z.boolean().optional(),
  registrationMessage: z.string().max(500).optional(),
})

export const chatSendSchema = z.object({
  text: z.string().trim().min(1).max(2000),
})

// Admin-broadcast notification: rendered as plain text (toast + native
// notification), so cap lengths and forbid nothing else — no HTML is ever
// interpreted, but a bound keeps the toast/native tray readable.
export const notificationCreateSchema = z.object({
  title: z.string().trim().min(1, "عنوان را وارد کنید").max(120, "عنوان حداکثر ۱۲۰ نویسه باشد"),
  body: z.string().trim().min(1, "متن پیام را وارد کنید").max(500, "متن پیام حداکثر ۵۰۰ نویسه باشد"),
})
