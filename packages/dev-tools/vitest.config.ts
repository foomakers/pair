import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    // #419: this suite shells out per test (turbo builds + real CLI runs — the
    // regenerate file alone burns ~60s of nested subprocesses). Under turbo's
    // package-parallel CI run the synchronous subprocesses block the event loop,
    // starving the vitest parent RPC (`Timeout calling "onTaskUpdate"` with
    // every test green). Use threads pool (no separate process RPC) with
    // extended timeout to avoid the 60s RPC timeout in forks pool.
    maxWorkers: 1,
    pool: 'threads',
    // Increase test timeout to 3 minutes to give subprocesses time to complete.
    testTimeout: 180_000,
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
