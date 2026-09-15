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
    // every test green). Run serially with longer timeout and fork isolation.
    maxWorkers: 1,
    // Use forks pool with single fork to keep parent RPC responsive under CPU load.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Increase test timeout to 3 minutes to prevent RPC timeout during long
    // turbo+CLI subprocesses that block the event loop.
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
