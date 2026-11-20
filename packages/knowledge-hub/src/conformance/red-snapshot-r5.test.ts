import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test('seal retry and dirty-directory regression witnesses', () => {
  const root = resolve(__dirname, '../../../..')
  const result = spawnSync(
    process.execPath,
    ['--test', 'packages/knowledge-hub/src/conformance/fixtures/red-snapshot-r5-witness.mjs'],
    { cwd: root, encoding: 'utf8', timeout: 30000 },
  )
  expect(result.status, result.stdout + result.stderr).toBe(0)
}, 30000)
