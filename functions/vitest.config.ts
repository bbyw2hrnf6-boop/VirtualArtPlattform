import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Functions tests are source-scoped so stale compiled tests in lib/ can
    // never be rediscovered by a broad Vitest invocation.
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'lib/**', 'coverage/**']
  }
});
