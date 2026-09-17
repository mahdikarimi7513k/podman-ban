/**
 * Public archive — list archive files grouped by institution.
 *
 * Endpoints:
 *   GET /                        — grouped by institution (caller's field)
 *   GET /file/:id/:kind          — stream an uploaded artifact as attachment
 *                                  (kind: "question" | "answer")
 */

import { Router } from "express"
import { statSync } from "fs"
import { desc, eq } from "drizzle-orm"
import { db } from "../lib/db.js"
import { archiveFiles } from "../lib/db/schema.js"
import { getSession } from "../lib/auth/index.js"
import {
  isArchiveKind,
  resolveStoredArchiveName,
  MAX_ARCHIVE_FILE_BYTES,
} from "../lib/archive-files.js"

export const archiveRouter = Router()

archiveRouter.get("/", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }

  const files = await db.query.archiveFiles.findMany({
    where: eq(archiveFiles.field, user.field),
    orderBy: [desc(archiveFiles.year), desc(archiveFiles.month)],
    with: { institution: { columns: { id: true, name: true } } },
  })

  // group by institution
  const byInstitution = new Map<
    string,
    { id: string; name: string; files: typeof files }
  >()
  const noInstitution: typeof files = []

  for (const f of files) {
    if (f.institution) {
      const key = f.institution.id
      if (!byInstitution.has(key)) {
        byInstitution.set(key, {
          id: f.institution.id,
          name: f.institution.name,
          files: [],
        })
      }
      byInstitution.get(key)!.files.push(f)
    } else {
      noInstitution.push(f)
    }
  }

  res.json({
    institutions: Array.from(byInstitution.values()),
    ungrouped: noInstitution,
  })
})

// Serve an uploaded archive artifact. Auth required; always an attachment so
// the browser downloads instead of rendering (and CSP/CORP stay intact).
archiveRouter.get("/file/:id/:kind", async (req, res) => {
  const user = await getSession(req)
  if (!user) {
    res.status(401).json({ error: "برای ادامه باید وارد شوید" })
    return
  }
  const kind = String(req.params.kind)
  if (!isArchiveKind(kind)) {
    res.status(400).json({ error: "نوع فایل نامعتبر است" })
    return
  }
  const record = await db.select().from(archiveFiles).where(eq(archiveFiles.id, req.params.id)).get()
  if (!record) {
    res.status(404).json({ error: "فایل یافت نشد" })
    return
  }
  // Same scope as the list endpoint above: a file from another study field
  // must look nonexistent. 404 (not 403) so cuid-guessing can't distinguish
  // "other field's file" from "no such file" (BOLA/IDOR, OWASP API1).
  if (record.field !== user.field) {
    res.status(404).json({ error: "فایل یافت نشد" })
    return
  }
  const stored = resolveStoredArchiveName(kind === "question" ? record.questionPath : record.answerPath)
  if (!stored) {
    res.status(404).json({ error: "برای این مورد فایل آپلودی وجود ندارد — از لینک دانلود استفاده کنید" })
    return
  }
  let size = 0
  try {
    size = statSync(stored).size
  } catch {
    res.status(404).json({ error: "فایل روی سرور یافت نشد" })
    return
  }
  if (size > MAX_ARCHIVE_FILE_BYTES) {
    res.status(413).json({ error: "فایل بیش از حد مجاز است" })
    return
  }
  const ext = stored.split(".").pop() ?? "bin"
  const downloadName = `${record.title}.${ext}`.replace(/[\r\n"/\\]/g, "_")
  res.setHeader("Content-Type", "application/octet-stream")
  res.setHeader("Content-Length", String(size))
  // RFC 5987: Persian titles must be percent-encoded in filename*
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="archive-${record.id}-${kind}.${ext}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
  )
  res.sendFile(stored)
})
