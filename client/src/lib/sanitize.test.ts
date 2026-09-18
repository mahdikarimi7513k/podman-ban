import { describe, it, expect } from "vitest"
import {
  sanitizeUsername,
  sanitizeName,
  clampPassword,
  sanitizeMessageText,
} from "./sanitize"

// All hostile inputs below use \u escapes on purpose — never put literal
// invisible characters in source.

describe("sanitizeUsername", () => {
  it("lowercases", () => {
    expect(sanitizeUsername("Ali_9")).toBe("ali_9")
  })

  it("removes whitespace", () => {
    expect(sanitizeUsername("a li\tb")).toBe("alib")
  })

  it("strips characters outside [a-z0-9_.]", () => {
    expect(sanitizeUsername("ali!@#")).toBe("ali")
    expect(sanitizeUsername("AلBی")).toBe("ab")
  })

  it("clamps to 32 chars", () => {
    expect(sanitizeUsername("a".repeat(40))).toHaveLength(32)
  })

  it("strips bidi overrides", () => {
    expect(sanitizeUsername("\u202Aali\u202C")).toBe("ali")
  })
})

describe("sanitizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeName("  علی   رضایی  ")).toBe("علی رضایی")
  })

  it("strips bidi overrides", () => {
    expect(sanitizeName("\u202Eali")).toBe("ali")
  })

  it("strips zero-width chars", () => {
    expect(sanitizeName("a\u200Bb\u200Dc")).toBe("abc")
  })

  it("strips control chars", () => {
    expect(sanitizeName("a\u0000b")).toBe("ab")
  })

  it("clamps to 40 chars", () => {
    expect(sanitizeName("ا".repeat(50))).toHaveLength(40)
  })
})

describe("clampPassword", () => {
  it("strips zero-width chars", () => {
    expect(clampPassword("pass\u200Bword")).toBe("password")
  })

  it("clamps to 72 chars (bcrypt limit)", () => {
    expect(clampPassword("p".repeat(100))).toHaveLength(72)
  })

  it("preserves visible spaces", () => {
    expect(clampPassword("a b  c")).toBe("a b  c")
  })
})

describe("sanitizeMessageText", () => {
  it("preserves newlines and tabs", () => {
    expect(sanitizeMessageText("a\nb\tc")).toBe("a\nb\tc")
  })

  it("strips bidi overrides", () => {
    expect(sanitizeMessageText("سلام \u202Etest")).toBe("سلام test")
  })

  it("strips zero-width chars", () => {
    expect(sanitizeMessageText("a\u200Bb")).toBe("ab")
  })

  it("strips control chars", () => {
    expect(sanitizeMessageText("a\u0000b")).toBe("ab")
  })

  it("clamps to 2000 chars", () => {
    expect(sanitizeMessageText("x".repeat(2500))).toHaveLength(2000)
  })
})
