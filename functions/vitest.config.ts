import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Functions tests are source-scoped so stale compiled tests in lib/ can
    // never be rediscovered by a broad Vitest invocation.
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'lib/**', 'coverage/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../artifacts/functions-coverage',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      thresholds: {
        statements: 34,
        branches: 46,
        functions: 45,
        lines: 35
      }
    }
  }
});
