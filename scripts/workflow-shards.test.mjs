import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  isNodeTestCandidate,
  planWorkflowTests,
  runShards,
  shardArguments,
  shardPatterns,
} from './workflow-shards.mjs'

test('every workflow case is assigned to exactly one shard', () => {
  for (const name of [
    'github merge',
    'azure-devops merge',
    'linear merge',
    'filesystem merge',
    'unclassified regression',
    'github and linear interaction',
    'Azure-DevOps and filesystem interaction',
    '',
  ]) {
    assert.equal(shardPatterns.filter(pattern => new RegExp(pattern).test(name)).length, 1, name)
  }
})

test('separates dataset and installed cases without a transport name', () => {
  const dataset = shardPatterns.findIndex(pattern =>
    new RegExp(pattern).test('r1-g1-repair-dataset'),
  )
  const installed = shardPatterns.findIndex(pattern =>
    new RegExp(pattern).test('r1-g1-repair-installed'),
  )
  assert.notEqual(dataset, installed)
})

test('runs every shard and reports failure if any shard fails', async () => {
  const calls = []
  const result = await runShards(async pattern => {
    calls.push(pattern)
    return pattern === shardPatterns[2] ? 1 : 0
  })
  assert.deepEqual(calls, shardPatterns)
  assert.equal(result, 1)
})

test('Node executes every real case exactly once across the shards', () => {
  if (!process.allowedNodeEnvironmentFlags.has('--test-skip-pattern')) {
    assert.equal(planWorkflowTests(['pair-contracts/board-sync.test.mjs'], false), null)
    return
  }
  const fixture = fileURLToPath(new URL('./fixtures/workflow-shard-cases.mjs', import.meta.url))
  const names = []
  for (const args of shardArguments) {
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    const result = spawnSync(
      process.execPath,
      ['--test', '--test-reporter=spec', ...args, fixture],
      { encoding: 'utf8', env },
    )
    assert.equal(result.status, 0, result.stderr)
    names.push(
      ...[...result.stdout.matchAll(/^✔ (.+?) \(/gm)]
        .map(match => match[1])
        .filter(name => name !== fixture),
    )
  }
  assert.deepEqual(
    names.sort(),
    ['dataset', 'github', 'github and linear', 'installed', 'other'].sort(),
  )
})

test('falls back to native discovery when the sharded suite or discovery shape changes', () => {
  const files = ['pair-contracts/board-sync.test.mjs', 'pair-contracts/other.test.mjs']
  assert.equal(planWorkflowTests(files, false), null)
  assert.equal(planWorkflowTests([...files, 'test/extra.js'], true), null)
  assert.equal(planWorkflowTests(['pair-contracts/board-sync.test.mjs'], true), null)
  assert.deepEqual(planWorkflowTests(files, true), ['pair-contracts/other.test.mjs'])
})

test('recognizes Node test discovery patterns and ignores helpers', () => {
  for (const name of ['x.test.mjs', 'x-test.cjs', 'test-extra.js', 'nested/test/helper.js']) {
    assert.equal(isNodeTestCandidate(name), true, name)
  }
  assert.equal(isNodeTestCandidate('nested/helper.mjs'), false)
})
