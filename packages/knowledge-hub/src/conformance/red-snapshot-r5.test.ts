import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test.each(['installed', 'dataset'])(
  '%s seal retry and dirty-directory regression witnesses',
  representation => {
    const root = resolve(__dirname, '../../../..')
    const fixture = 'packages/knowledge-hub/src/conformance/fixtures/red-snapshot-r5-witness.mjs'
    const result = spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', '--test-name-pattern', ` ${representation} `, fixture],
      { cwd: root, encoding: 'utf8', timeout: 30_000 },
    )
    expect(result.status, result.error?.message ?? result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toMatch(new RegExp(`^ok \\d+ - .* ${representation} `, 'm'))
  },
  30_000,
)
