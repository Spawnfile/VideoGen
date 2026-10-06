import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5190', channel: 'chrome', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node --import tsx stack.mjs',
    url: 'http://127.0.0.1:5190/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
    // Without this Playwright SIGKILLs the process group and stack.mjs never cleans up (M2 known limit).
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
