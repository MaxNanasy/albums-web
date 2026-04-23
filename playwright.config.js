import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    serviceWorkers: 'block',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/serve-static.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
