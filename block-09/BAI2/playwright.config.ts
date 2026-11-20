import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'e2e-ui.spec.ts',
  outputDir: './tmp/playwright-results',
  reporter: 'list',
  use: {
    browserName: 'chromium',
    channel: process.env.BAI2_E2E_BROWSER_CHANNEL || undefined,
    headless: true,
  },
});
