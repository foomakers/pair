import { defineConfig, devices } from '@playwright/experimental-ct-react'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  testMatch: '**/*.ct.test.tsx',
  use: {
    ctPort: 3100,
    ctViteConfig: {
      plugins: [react()],
      resolve: {
        alias: {
          'next-themes': resolve(__dirname, 'playwright/mocks/next-themes.tsx'),
        },
      },
    },
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
})
