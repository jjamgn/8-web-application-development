import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 5173);

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results/mock',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/*.live.spec.ts',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [
    ['list'], ['html', { open: 'never' }],
    ['json', { outputFile: '../docs/evidence/mock-browser/playwright-results.json' }],
  ],
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
