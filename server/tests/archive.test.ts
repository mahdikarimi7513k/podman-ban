/**
 * Seam: archive records.
 *   POST /api/admin/archive   — create (needs a deliverable link)
 *   PUT  /api/admin/archive/:id — partial update (any subset of fields)
 *   DELETE /api/admin/archive/:id — delete
 */
import { describe, it, expect, beforeAll } from "vitest"
import { login } from "./helpers.js"
import { ensureFixtures, PASSWORD } from "./fixtures.js"

beforeAll(ensureFixtures)

describe("archive partial update", () => {
  it("PUT accepts a subset of fields and leaves the rest untouched", async () => {
    const admin = await login("sec_admin", PASSWORD)

    const created = await admin.post("/api/admin/archive").send({
      title: "آزمون آزمایشی",
      field: "FANI_HERFEI",
      year: 1403,
      fileUrl: "https://example.ir/exam.pdf",
    })

    expect(created.status).toBe(201)

    const id = String(created.body.file.id)

    const updated = await admin.put(`/api/admin/archive/${id}`).send({
      title: "آزمون ویراسته",
    })

    expect(updated.status).toBe(200)
    expect(updated.body.file.title).toBe("آزمون ویراسته")
    expect(updated.body.file.field).toBe("FANI_HERFEI")
    expect(updated.body.file.year).toBe(1403)

    const missing = await admin.put("/api/admin/archive/does-not-exist").send({
      title: "x",
    })

    expect(missing.status).toBe(404)

    const del = await admin.delete(`/api/admin/archive/${id}`)
    expect(del.status).toBe(200)
  })

  it("PUT still rejects invalid values", async () => {
    const admin = await login("sec_admin", PASSWORD)

    const created = await admin.post("/api/admin/archive").send({
      title: "موقت",
      field: "KARDANESH",
      year: 1402,
      fileUrl: "https://example.ir/tmp.pdf",
    })

    const id = String(created.body.file.id)

    try {
      const bad = await admin.put(`/api/admin/archive/${id}`).send({ year: 999 })
      expect(bad.status).toBe(422)
    } finally {
      await admin.delete(`/api/admin/archive/${id}`)
    }
  })
})
