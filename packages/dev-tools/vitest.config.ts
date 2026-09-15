import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    // #419: this suite shells out per test (turbo builds + real CLI runs — the
    // regenerate file alone burns ~60s of subprocesses). Under turbo's
    // package-parallel CI run the default worker count starves the vitest
    // parent RPC (`Timeout calling "onTaskUpdate"` with every test green),
    // so cap workers here instead of flakes-gating the branch.
    maxWorkers: 2,
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
