import { defineConfig } from '@playwright/test';

process.env.BLOCK11_BROWSER_FIXTURE = '1';
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results/integration',
  testMatch: '**/*.live.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../docs/evidence/abc-browser-results.json' }]],
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    // Requires npm ci + db:generate in api/, and the web build from this script.
    command: 'node --import tsx tests/browser-server.ts',
    cwd: '../api',
    url: 'http://localhost:3000/api/photos',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
