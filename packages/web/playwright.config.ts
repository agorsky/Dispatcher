import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  workers: 1, // Sequential — tests share live Docker state
  retries: 1, // Retry once on flaky connections
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['line'],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
