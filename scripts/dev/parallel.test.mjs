import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const PARALLEL = fileURLToPath(new URL('./parallel.mjs', import.meta.url))

const run = (...cmds) =>
  spawnSync('node', [PARALLEL, ...cmds], { encoding: 'utf8' })

test('parallel: runs all commands, exit 0 when all pass', () => {
  const t0 = Date.now()
  const r = run('sleep 1', 'sleep 1')
  assert.equal(r.status, 0)
  assert.ok(Date.now() - t0 < 1900, 'ran concurrently')
})

test('parallel: a failing command fails the run but the others still finish', () => {
  const r = run('exit 3', 'sleep 1; echo done-b')
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /done-b/)
})
