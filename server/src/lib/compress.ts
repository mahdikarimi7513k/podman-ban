/**
 * Minimal gzip for JSON responses (no dependency).
 *
 * Exam payloads inline question images as base64 (megabytes of JSON).
 * Without compression, slow phones time out mid-download and users see
 * failed/half-loaded exams. Node's builtin zlib cuts base64 ~60-70% —
 * the same trick as the `compression` package, minus a production
 * dependency the shared host would have to install.
 */
import { gzip } from "node:zlib"
import type { Request, Response, NextFunction } from "express"

const MIN_BYTES = 1024

/** Any JSON-serializable response body (no unknown/any escape hatches). */
interface JsonObject {
  [key: string]: JsonValue
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]

export function gzipJson(req: Request, res: Response, next: NextFunction): void {
  const enc = req.headers["accept-encoding"]
  const accepted = Array.isArray(enc) ? enc.join(", ") : (enc ?? "")

  if (!accepted.includes("gzip")) {
    next()

    return
  }

  const origJson = res.json.bind(res)

  res.json = (body: JsonValue | undefined): Response => {
    let raw: string

    try {
      raw = JSON.stringify(body)
    } catch {
      return origJson(body)
    }

    if (raw.length < MIN_BYTES) return origJson(body)

    gzip(raw, (_err, buf) => {
      if (_err || !buf) {
        origJson(body)

        return
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.setHeader("Content-Encoding", "gzip")
      res.setHeader("Content-Length", buf.length)
      res.send(buf)
    })

    return res
  }

  next()
}
