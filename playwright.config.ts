import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/dist/server/src/index.js',
    url: `${baseURL}/api/ready`,
    // Release checks must never silently attach to a stale developer server.
    // Opt in explicitly only for interactive local debugging.
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 30_000,
    env: {
      NODE_ENV: 'production',
      PORT: new URL(baseURL).port || '3001',
      STATIC_DIR: 'dist',
      DATA_DIR: '.tmp/playwright-submissions',
      CORS_ORIGIN: baseURL,
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
});
