import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('red snapshot publication regressions', () => {
  it.each(['installed', 'dataset'])(
    '%s preserves custody on retry and with staged production edits',
    representation => {
      const fixture = resolve('src/conformance/fixtures/red-snapshot-push-regression.mjs')
      const result = spawnSync(
        process.execPath,
        ['--test', '--test-reporter=tap', '--test-name-pattern', ` ${representation} `, fixture],
        { encoding: 'utf8', timeout: 30_000 },
      )
      expect(result.status, result.error?.message ?? result.stdout + result.stderr).toBe(0)
      expect(result.stdout).toMatch(new RegExp(`^ok \\d+ - .* ${representation} `, 'm'))
    },
    30_000,
  )
})
