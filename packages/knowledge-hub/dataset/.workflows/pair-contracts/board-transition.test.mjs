import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, runTransition } from '../../skills/pair-workflow-cycle/scripts/board-transition.mjs'
import { closeStory } from '../../skills/pair-workflow-cycle/scripts/cycle-merge.mjs'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('AC-1: PR open transition uses the PM adapter and adopted Review label', () => {
  let boardState = 'Todo'
  const calls = []
  const pm = {
    cardState: () => ({ issueState: 'OPEN', issueReason: null, boardState, member: true }),
    setBoardState: ({ state }) => { calls.push(state); boardState = state; return { confirmed: true } },
  }
  assert.deepEqual(runTransition({ hosts: { pm }, story: '42', pr: 'open', adoption: '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Inspect | Review |\n' }), { confirmed: true, expected: 'Inspect', actions: ['status:Inspect'] })
  assert.deepEqual(calls, ['Inspect'])
})

// r0-8: a `Refs: <ID>` association writes only when the ID resolves to exactly one card of the bound PM tool.
test('AC-1/4: --require-card skips an unresolved or foreign card without writing, and applies a resolved one', () => {
  assert.deepEqual(parseArgs(['--story', 'ENG-42', '--pr-state', 'open', '--require-card']), { story: 'ENG-42', pr: 'open', requireCard: true })
  let boardState = 'Todo'
  const writes = []
  const pm = {
    parseCardRef: ref => ({ id: ref, inScope: ref.startsWith('ENG-') }),
    readCard: id => { if (id !== 'ENG-42') throw new Error(`issue ${id} not found`); return { state: 'OPEN' } },
    cardState: () => ({ issueState: 'OPEN', issueReason: null, boardState, member: true }),
    setBoardState: ({ id, state }) => { writes.push(`${id}:${state}`); boardState = state; return { confirmed: true } },
  }
  for (const story of ['ENG-404', 'OPS-42']) assert.deepEqual(runTransition({ hosts: { pm }, story, pr: 'open', adoption: '', requireCard: true }), { confirmed: false, skipped: 'card-unresolved' }, story)
  assert.deepEqual(writes, [])
  assert.equal(runTransition({ hosts: { pm }, story: 'ENG-42', pr: 'open', adoption: '', requireCard: true }).confirmed, true)
  assert.deepEqual(writes, ['ENG-42:Review'])
})

test('AC-1: transition args refuse implicit apply and unknown PR states', () => {
  assert.deepEqual(parseArgs(['--story', '42', '--pr-state', 'open']), { story: '42', pr: 'open' })
  assert.deepEqual(parseArgs(['--story', '42', '--pr-state', 'none']), { story: '42', pr: 'none' })
  assert.throws(() => parseArgs(['--story', '42', '--pr-state', 'missing']), /pr-state/)
  assert.throws(() => parseArgs(['--story', '42']), /pr-state/)
})

test('AC-1/4: merge closure uses the adopted Done label after confirming membership', () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-merge-map-'))
  const dir = join(root, '.pair', 'adoption', 'tech')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'way-of-working.md'), '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Shipped | Done |\n')
  const calls = []
  const hosts = { pm: {
    readCard: () => ({ body: '## Definition of Done\n- [x] done\n' }),
    closeAndCascade: () => ({ closed: ['42'] }),
    syncEpic: () => { calls.push('epic'); return { confirmed: true, parent: '7' } },
    ensureBoardMembership: () => { calls.push('member'); return { confirmed: true } },
    setBoardState: ({ state }) => { calls.push(`state:${state}`); return { confirmed: true } },
  }, code: {} }
  closeStory({ hosts, story: '42', root, fs: { exists: () => false, rm: () => {} } })
  assert.deepEqual(calls, ['epic', 'member', 'state:Shipped'])
})
