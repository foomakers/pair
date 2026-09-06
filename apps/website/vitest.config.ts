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
    // Two gate tests in `lib/` are I/O-bound, not logic-bound, and vitest's 5s default
    // is a WALL-CLOCK budget on the runner — so they pass on a developer machine and
    // time out on a slower CI runner, which reads as a red gate with no assertion in it.
    // MEASURED at bd8c3ad4: `matches github.com's anchors on every recorded corpus file`
    // reads + sha1s 937 files — 869ms here, 9493ms on the GitHub runner; and
    // `schedules @pair/content-ops#build before the site build` execs the REAL
    // `turbo … --dry=json` — 2044ms here, >5165ms there. Both were green locally and
    // `Error: Test timed out in 5000ms` in CI job 101536314349. The budget is raised, not
    // the tests: an exec/filesystem test may not be assertion-weakened to fit a default.
    testTimeout: 60_000,
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
