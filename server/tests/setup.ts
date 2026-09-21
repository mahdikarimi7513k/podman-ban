/**
 * Test bootstrap (per worker). Values here are test-only, never real
 * credentials. Must match the DB path global-setup provisions.
 */
process.env.DATABASE_URL ??= "file:" + new URL("./data/test.db", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
process.env.JWT_SECRET ??= "test-jwt-secret"
process.env.CSRF_SECRET ??= "test-csrf-secret"
process.env.TRUST_PROXY ??= "true"

import { beforeEach } from "vitest"
import { clearRateLimitBuckets } from "../src/lib/auth/rate-limit.js"

// Fresh rate-limit budgets per test file: supertest always dials from
// loopback, so socket-IP floors would otherwise accumulate across files
// and flake unrelated tests.
beforeEach(() => {
  clearRateLimitBuckets()
})
