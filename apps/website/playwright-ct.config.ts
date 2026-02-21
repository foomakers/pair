import { defineConfig, devices } from '@playwright/experimental-ct-react'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  testMatch: '**/*.ct.test.tsx',
  use: {
    ctPort: 3101,
    ctViteConfig: {
      plugins: [react() as never],
      resolve: {
        alias: {
          'next/link': resolve(__dirname, 'playwright/mocks/next-link.tsx'),
          'next/navigation': resolve(__dirname, 'playwright/mocks/next-navigation.ts'),
          'next-themes': resolve(
            __dirname,
            '../../packages/brand/playwright/mocks/next-themes.tsx',
          ),
        },
      },
    },
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
})
