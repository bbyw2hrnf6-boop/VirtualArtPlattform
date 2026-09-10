import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.LIEUVA_BROWSER_SMOKE_BASE_URL?.trim();
const softwareRendering = Boolean(process.env.CI) || process.env.LIEUVA_BROWSER_SMOKE_SOFTWARE_GL === '1';

export default defineConfig({
  testDir: './tests/browser-smoke',
  outputDir: './artifacts/playwright-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // These are functional checks of the full-quality production scene, not GPU
  // speed benchmarks. Linux software rendering can block a browser query for
  // 6–8 seconds; the default 5-second assertion would fail before it returns.
  // Allow several bounded interactions plus scene preparation in each journey.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    baseURL: externalBaseUrl || 'http://127.0.0.1:4173',
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalBaseUrl ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{
    name: 'chromium',
    // Use the pinned full Chromium's modern headless mode. The separate legacy
    // headless shell can stall during the homepage's real WebGL shader warm-up.
    use: {
      ...devices['Desktop Chrome'], channel: 'chromium',
      // Pin CI's software backend; the same path is available locally. This
      // changes the test renderer, not the scene's assets or quality settings.
      ...(softwareRendering ? { launchOptions: {
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      } } : {}),
    },
  }],
});
