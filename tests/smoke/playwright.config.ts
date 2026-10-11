import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5190', channel: 'chrome', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  // Desktop runs S1–S8 at 1280×720 (the desktop layout starts at 1200 px); mobile runs S9 as a phone.
  projects: [
    { name: 'desktop', testIgnore: /s9-mobile/, use: { viewport: { width: 1280, height: 720 } } },
    { name: 'mobile', testMatch: /s9-mobile/, use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node --import tsx stack.mjs',
    url: 'http://127.0.0.1:5190/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
    // Without this Playwright SIGKILLs the process group and stack.mjs never cleans up (M2 known limit).
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
