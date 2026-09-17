import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Integration tests share one SQLite file — serialize files, or writes race.
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
  },
})
