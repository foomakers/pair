import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testMatch: '**/*.e2e.test.ts',
  use: {
    baseURL: 'http://localhost:3123',
  },
  webServer: {
    command: 'pnpm next build && pnpm next start -p 3123',
    port: 3123,
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
})
