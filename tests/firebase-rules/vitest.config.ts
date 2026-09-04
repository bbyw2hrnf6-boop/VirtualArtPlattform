import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/firebase-rules/**/*.rules.test.ts"],
    maxWorkers: 1,
    testTimeout: 30_000,
  },
});

