// #646 r1-g1-rev2-gap1: the gate's real sandbox must run every dev suite,
// including delivery publication and formatter dependencies. Keep this oracle
// outside scripts/dev: that directory is the gate-under-test's recursive input.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const cases = [
  ['r1-g1-rev2-gap1-complete-sandbox', 'r0-1-w5'],
  ['r1-g1-rev2-gap1-hook-control', 'r0-1-c1'],
  ['r1-g1-rev2-gap1-path-control', 'r0-1-c2'],
]

for (const [id, pattern] of cases) {
  test(id, () => {
    const result = spawnSync(
      'pnpm',
      [
        '--dir',
        'packages/dev-tools',
        'exec',
        'vitest',
        'run',
        'src/quality-gates/dev-scripts-gate.test.ts',
        '-t',
        pattern,
        '--reporter=json',
      ],
      { cwd: repo, encoding: 'utf8', timeout: 55000, maxBuffer: 4 * 1024 * 1024 },
    )
    assert.ifError(result.error)
    const report = JSON.parse(result.stdout)
    const selected = report.testResults
      .flatMap(suite => suite.assertionResults)
      .filter(row => row.title.startsWith(pattern))
    assert.equal(selected.length, 1, 'the real gate assertion must execute')
    assert.equal(selected[0].status, 'passed', selected[0].failureMessages.join('\n'))
    assert.equal(result.status, 0, result.stderr)
  })
}
