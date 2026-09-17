/**
 * Regression locks for the three reported security bugs:
 *  1. cross-field archive download (BOLA/IDOR) → must be 404
 *  3. bannerLink scheme allowlist → javascript:/data: must be 422
 * (Bug 2, login timing oracle, is proven with a throwaway timing probe —
 * a timing assertion would be flaky in CI so it is not committed.)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { http, login } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

describe("bug 1: archive download respects the caller's field", () => {
  let fileId = ""

  it("setup: admin uploads a KARDANESH artifact", async () => {
    const admin = await login("sec_admin", PASSWORD)
    const created = await admin.post("/api/admin/archive").send({
      title: "SEC-Kardanesh-Secret",
      field: "KARDANESH",
      year: 1403,
      uploadQuestion: true,
    })
    expect(created.status).toBe(201)
    fileId = created.body.file.id as string

    const upload = await admin
      .post(`/api/admin/archive/${fileId}/file/question`)
      .set("Content-Type", "application/octet-stream")
      .set("x-file-name", "secret.pdf")
      .send(Buffer.from("%PDF-1.4 secret-bytes"))
    expect(upload.status).toBe(200)
  })

  it("a FANI_HERFEI student cannot download the KARDANESH file", async () => {
    const stu = await login("sec_student", PASSWORD) // FANI_HERFEI
    const res = await stu.get(`/api/archive/file/${fileId}/question`)
    expect(res.status).toBe(404)
  })

  it("a KARDANESH student still can", async () => {
    const kar = await login("sec_kardanesh", PASSWORD)
    const res = await kar.get(`/api/archive/file/${fileId}/question`)
    expect(res.status).toBe(200)
  })

  afterAll(async () => {
    // API delete (not raw db) so the uploaded bytes are cleaned from disk too.
    if (fileId) {
      const admin = await login("sec_admin", PASSWORD)
      await admin.delete(`/api/admin/archive/${fileId}`)
    }
  })
})

describe("bug 3: bannerLink accepts only http(s)", () => {
  it("rejects javascript: and data: URLs, accepts https:", async () => {
    const admin = await login("sec_admin", PASSWORD)

    for (const bad of [
      "javascript:alert(document.cookie)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      const res = await admin.put("/api/admin/config").send({ bannerLink: bad })
      expect(res.status).toBe(422)
    }

    const ok = await admin
      .put("/api/admin/config")
      .send({ bannerLink: "https://example.com/azmon" })
    expect(ok.status).toBe(200)

    await admin.put("/api/admin/config").send({ bannerLink: "" })
  })
})
