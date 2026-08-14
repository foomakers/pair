import { configDefaults, defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    // EXTENDS vitest's defaults, never replaces them. Spelling the list out by hand silently
    // dropped `**/cypress/**`, `**/.{idea,git,cache,output,temp}/**` and the `*.config.*`
    // entries, so a stray file under any of those became a collected test — and the two
    // entries actually needed here read as if they were the whole policy.
    //
    // The one addition: shipped workflow artifacts (#219). Their `.test.mjs` files are
    // `node:test` suites, not vitest ones, and they run in the gate via `pnpm workflows:test`
    // against the root copy — which the mirror guard keeps byte-identical to this one.
    // Collecting them here would fail on a runner mismatch, not on a defect.
    exclude: [...configDefaults.exclude, 'dataset/.workflows/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
})
