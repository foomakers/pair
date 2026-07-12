import { defineConfig, coverageConfigDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/*.ct.test.tsx', '**/*.e2e.test.ts', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '.next/**',
        '**/*.ct.test.tsx',
        '**/*.e2e.test.ts',
        'playwright*.config.ts',
        'next.config.*',
        'source.config.ts',
        'vitest.setup.ts',
      ],
      // Realistic baseline, NOT 80%: the website is a Next.js app validated
      // primarily by Playwright component + e2e suites, so unit coverage of
      // pages/components is intentionally low. These floors catch regressions
      // without forcing unit tests onto e2e-covered UI. See ADL 2026-07-12.
      thresholds: {
        lines: 9,
        statements: 9,
        functions: 40,
        branches: 60,
      },
    },
  },
})
