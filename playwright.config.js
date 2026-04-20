import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  timeout: 1_000_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    launchOptions: {
      // slowMo: 10_000,
    },
  },
  webServer: {
    command: 'node scripts/serve-static.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
