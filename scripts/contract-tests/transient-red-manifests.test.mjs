// #646 r1-g1-rev3-gap2: execute the quality gate's authoritative HEAD-tree assertion.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('r1-g1-rev3-gap2-transient-manifests', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-timeout=10000',
      '--test-reporter=tap',
      '--test-name-pattern=r0-1 w1:',
      '.claude/workflows/pair-contracts/red-snapshot-3.test.mjs',
    ],
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
      timeout: 15000,
    },
  )
  assert.ifError(result.error)
  assert.match(result.stdout, /# tests 1\b/, result.stdout + result.stderr)
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
