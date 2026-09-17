/**
 * Archive upload storage.
 *
 * Uploaded archive files (questions / answer keys) live under
 * <repo>/uploads/archive/<archiveId>-<kind>.<ext>. Names are derived from the
 * DB record id (cuid) and a whitelisted extension, so no user-controlled path
 * ever reaches the filesystem. Serving is always attachment-only through
 * GET /api/archive/file/:id/:kind.
 */
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

// Works under Bun ESM, Node CJS bundles (esbuild), and Node ESM.
const here =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

function findRepoRoot(): string {
  let dir = here
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "client"))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return process.cwd()
}

/** <repo>/uploads/archive — override with UPLOAD_DIR on servers. */
export const ARCHIVE_DIR =
  process.env.UPLOAD_DIR ?? resolve(findRepoRoot(), "uploads", "archive")

export const ARCHIVE_KINDS = ["question", "answer"] as const
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number]

const ALLOWED_EXT = new Set(["pdf", "png", "jpg", "jpeg", "webp", "zip"])
export const MAX_ARCHIVE_FILE_BYTES = 25 * 1024 * 1024 // 25 MB

export function isArchiveKind(kind: string): kind is ArchiveKind {
  return (ARCHIVE_KINDS as readonly string[]).includes(kind)
}

/** Pull a safe extension from an original filename; null when not allowed. */
function safeExt(filename: string | undefined): string | null {
  const raw = (filename ?? "").toLowerCase()
  const dot = raw.lastIndexOf(".")
  if (dot === -1) return null
  const ext = raw.slice(dot + 1)
  return ALLOWED_EXT.has(ext) ? ext : null
}

/** Map a content-type to a whitelisted extension (fallback when no filename). */
function extFromContentType(ct: string | undefined): string | null {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
  }
  const ext = map[(ct ?? "").split(";")[0].trim().toLowerCase()]
  return ext ?? null
}

/**
 * Persist an uploaded buffer. Returns the stored file NAME (not a path).
 * Throws Error with a Persian message when the input is unacceptable.
 */
export function saveArchiveUpload(
  archiveId: string,
  kind: ArchiveKind,
  buffer: Buffer,
  filename: string | undefined,
  contentType: string | undefined,
): string {
  if (!buffer || buffer.length === 0) throw new Error("فایلی ارسال نشده است")
  if (buffer.length > MAX_ARCHIVE_FILE_BYTES) throw new Error("حجم فایل بیش از حد مجاز است (حداکثر ۲۵ مگابایت)")
  const ext = safeExt(filename) ?? extFromContentType(contentType)
  if (!ext) throw new Error("فرمت فایل مجاز نیست (pdf، png، jpg، webp، zip)")

  mkdirSync(ARCHIVE_DIR, { recursive: true })
  const name = `${archiveId}-${kind}.${ext}`
  // archiveId comes from our own DB (cuid), kind is from the whitelist,
  // ext from the whitelist — the composed name cannot traverse.
  writeFileSync(resolve(ARCHIVE_DIR, name), buffer)
  return name
}

/** Best-effort delete of both stored files for a record. */
export function deleteArchiveUploads(names: { questionPath?: string | null; answerPath?: string | null }): void {
  for (const name of [names.questionPath, names.answerPath]) {
    if (!name) continue
    try {
      unlinkSync(resolve(ARCHIVE_DIR, name))
    } catch {
      /* already gone */
    }
  }
}

/** Resolve a stored file name to an absolute path, refusing anything unsafe. */
export function resolveStoredArchiveName(name: string | null | undefined): string | null {
  if (!name || !/^[a-zA-Z0-9_-]+\.(pdf|png|jpg|jpeg|webp|zip)$/.test(name)) return null
  return resolve(ARCHIVE_DIR, name)
}
