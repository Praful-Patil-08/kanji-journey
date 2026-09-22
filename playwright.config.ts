import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run server',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 20 * 1000,
      env: {
        PORT: '4000',
        NODE_ENV: 'test',
        ALLOW_INSECURE_AUTH: 'true',
        MONGODB_URI: '',
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
    },
    {
      command: 'npm run dev -- --port 8080 --host 0.0.0.0',
      url: 'http://localhost:8080',
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    },
  ],
});
