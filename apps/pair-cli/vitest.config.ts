import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@pair/content-ops': resolve(__dirname, '../../packages/content-ops/src'),
      '@pair/workflows': resolve(__dirname, '../../packages/workflows/src'),
      '@pair/content-ops/http': resolve(__dirname, '../../packages/content-ops/src/http'),
      '@pair/content-ops/file-system': resolve(
        __dirname,
        '../../packages/content-ops/src/file-system',
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // Under the parallel quality gate (turbo x vitest) the default (cores - 1 forks) oversubscribes the CPU: real-CLI tests exceed their 60 s and workers hit the onTaskUpdate RPC timeout.
    maxWorkers: 4,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/index.ts',
        'src/cli.ts',
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
