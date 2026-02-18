import { defineConfig, devices } from '@playwright/experimental-ct-react'
import react from '@vitejs/plugin-react'

export default defineConfig({
  testMatch: '**/*.ct.test.tsx',
  use: {
    ctPort: 3100,
    ctViteConfig: {
      plugins: [react()],
    },
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
})
