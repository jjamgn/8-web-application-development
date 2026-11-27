import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results/live',
  testMatch: '**/*.live.spec.ts',
  workers: 1,
  retries: 0,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/live', open: 'never' }]],
  use: {
    baseURL: process.env.LIVE_BASE_URL || 'http://localhost:5173',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'off', // Do not persist live credentials, session cookies, or CSRF tokens.
  },
  // Start real A/B API and Vite (or production Express) before this suite.
});
