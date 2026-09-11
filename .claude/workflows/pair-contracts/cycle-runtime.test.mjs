// Tests for cycle-runtime.mjs — the host-side journal/usage observer (US-479 T-25, S7).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chmodSync } from 'node:fs'

import {
  tailJournalFile,
  journalRecordToObservation,
  usageRecordToObservation,
  readCheckpoint,
  writeCheckpoint,
  shouldStop,
  runtimeTick,
  runObserveLoop,
  finalizeMetrics,
  extractUsage,
  dispatchStatsFromResult,
} from '../../skills/pair-workflow-review-phase/scripts/cycle-runtime.mjs'
import { publish } from '../../skills/pair-workflow-review-phase/scripts/cycle-state.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-review-phase/scripts/cycle-runtime.mjs', import.meta.url))
const SHA = c => c.repeat(40)

function runDir() {
  const root = mkdtempSync(join(tmpdir(), 'runtime-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  return { root, dir }
}
function journalFile(root, lines) {
  const p = join(root, 'journal.jsonl')
  writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''))
  return p
}
// A minimal STATEFUL `gh` recorder for the CLI-level finalize test: the readback after publish
// must see the same comment the create/update just wrote, exactly like the real API would.
function fakeGhDir() {
  const dir = mkdtempSync(join(tmpdir(), 'gh-fake-'))
  const state = join(dir, 'state.json')
  writeFileSync(state, '[]')
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
const statePath = ${JSON.stringify(state)}
const list = JSON.parse(fs.readFileSync(statePath, 'utf8'))
const body = () => { const i = args.indexOf('-f'); return args[i + 1].replace(/^body=/, '') }
if (args[0] === 'api' && args.includes('--paginate')) process.stdout.write(JSON.stringify(list))
else if (args[0] === 'api' && args.includes('POST')) {
  const c = { id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1, body: body(), html_url: 'https://x/c/1' }
  list.push(c)
  fs.writeFileSync(statePath, JSON.stringify(list))
  process.stdout.write(JSON.stringify({ id: c.id, html_url: c.html_url }))
} else if (args[0] === 'api' && args.includes('PATCH')) {
  const id = Number(args.find(a => /comments\\/\\d+$/.test(a)).split('/').pop())
  const c = list.find(x => x.id === id)
  c.body = body()
  fs.writeFileSync(statePath, JSON.stringify(list))
  process.stdout.write(JSON.stringify({ id, html_url: c.html_url }))
} else { process.stderr.write('unexpected gh call'); process.exit(1) }
`)
  chmodSync(join(dir, 'gh'), 0o755)
  return dir
}

test('cycle-runtime.mjs ships byte-identical inside review-phase (installed and dataset)', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  assert.equal(read('../../../packages/knowledge-hub/dataset/.skills/workflow/review-phase/scripts/cycle-runtime.mjs'), read('../../skills/pair-workflow-review-phase/scripts/cycle-runtime.mjs'))
})

// ── tailJournalFile: complete JSONL, incomplete last line withheld, rotation, EOF is not completion ──
test('tailJournalFile: consumes complete records, withholds an incomplete last line, and picks it up once completed (DT-24-style replay)', () => {
  const { root } = runDir()
  const p = join(root, 'j.jsonl')
  writeFileSync(p, '{"key":"a","started":true}\n{"key":"a","started":true,"result":{"status":"ok"}}\n')
  const first = tailJournalFile({ path: p, offset: 0 })
  assert.equal(first.records.length, 2)
  assert.equal(first.malformed.length, 0)
  // an idempotent re-read at the SAME offset returns nothing new
  const replay = tailJournalFile({ path: p, offset: first.newOffset })
  assert.equal(replay.records.length, 0)
  // append an incomplete record — EOF is not completion, it must not be parsed yet
  appendFileSync(p, '{"key":"b","started":true')
  const partial = tailJournalFile({ path: p, offset: first.newOffset })
  assert.equal(partial.records.length, 0, 'an incomplete last line is withheld, never parsed as malformed')
  assert.equal(partial.newOffset, first.newOffset, 'the offset does not advance past an incomplete line')
  appendFileSync(p, '}\n')
  const completed = tailJournalFile({ path: p, offset: partial.newOffset })
  assert.equal(completed.records.length, 1)
  assert.equal(completed.records[0].key, 'b')
})

test('tailJournalFile: a malformed COMMITTED record is reported with a visible source error, never silently skipped or crashing the tail', () => {
  const { root } = runDir()
  const p = join(root, 'j.jsonl')
  writeFileSync(p, '{"key":"a","started":true}\nnot json at all\n{"key":"b","started":true}\n')
  const r = tailJournalFile({ path: p, offset: 0 })
  assert.equal(r.records.length, 2)
  assert.deepEqual(r.malformed, ['not json at all'])
})

test('tailJournalFile: a truncated/rotated file (shrunk below the checkpoint offset) is detected and replay restarts from the beginning', () => {
  const { root } = runDir()
  const p = join(root, 'j.jsonl')
  writeFileSync(p, '{"key":"a","started":true}\n{"key":"a","started":true,"result":{"status":"ok"}}\n')
  const first = tailJournalFile({ path: p, offset: 0 })
  // rotation: a fresh, shorter file at the same path
  writeFileSync(p, '{"key":"c","started":true}\n')
  const rotated = tailJournalFile({ path: p, offset: first.newOffset })
  assert.equal(rotated.rotated, true)
  assert.equal(rotated.records.length, 1)
  assert.equal(rotated.records[0].key, 'c')
})

test('tailJournalFile: an absent file is empty, not an error — the source may not exist yet', () => {
  const r = tailJournalFile({ path: '/nonexistent/path/j.jsonl', offset: 0 })
  assert.deepEqual(r, { records: [], newOffset: 0, malformed: [], rotated: false })
})

// ── observation identity: never content-only dedup (DT-19-adjacent) ─────────────────────────
test('journalRecordToObservation: a started record and its result share ONE executionId (re-observation), a different agentId is a genuinely new execution', () => {
  const started = journalRecordToObservation({ key: 'a', agentId: 'ag1', started: true }, { runId: 'r1', storyId: '42', observedAt: 1 })
  const finished = journalRecordToObservation({ key: 'a', agentId: 'ag1', started: true, result: { status: 'ok' } }, { runId: 'r1', storyId: '42', observedAt: 2 })
  assert.equal(started.executionId, finished.executionId)
  assert.equal(started.kind, 'step-started')
  assert.equal(finished.kind, 'step-finished')
  const otherAgent = journalRecordToObservation({ key: 'a', agentId: 'ag2', started: true, result: { status: 'ok' } }, { runId: 'r1', storyId: '42', observedAt: 3 })
  assert.notEqual(otherAgent.executionId, finished.executionId)
  const failed = journalRecordToObservation({ key: 'a', agentId: 'ag1', started: true, result: { status: 'error' } }, { runId: 'r1', storyId: '42', observedAt: 4 })
  assert.equal(failed.kind, 'step-failed')
  const cancelled = journalRecordToObservation({ key: 'a', agentId: 'ag1', started: true, result: { cancelled: true } }, { runId: 'r1', storyId: '42', observedAt: 5 })
  assert.equal(cancelled.kind, 'step-cancelled')
  assert.deepEqual(journalRecordToObservation({ foo: 'bar' }, { runId: 'r1' }), { error: 'record-missing-key' })
})

// ── stop condition (DT-31-ish): terminal + reconciled, or the grace period, or a cancel ──────
test('shouldStop: keeps going with no terminal; stops once terminal+reconciled; stops after the grace period with a partial-usage reason; stops immediately on cancel', () => {
  assert.deepEqual(shouldStop({ terminalObservedAt: null, usageReconciled: false, cancelled: false, now: 1000 }), { stop: false })
  assert.deepEqual(shouldStop({ terminalObservedAt: 900, usageReconciled: true, cancelled: false, now: 1000 }), { stop: true, reason: 'terminal-reconciled' })
  assert.deepEqual(shouldStop({ terminalObservedAt: 900, usageReconciled: false, cancelled: false, graceMs: 30000, now: 10000 }), { stop: false })
  assert.deepEqual(shouldStop({ terminalObservedAt: 900, usageReconciled: false, cancelled: false, graceMs: 30000, now: 31000 }), { stop: true, reason: 'terminal-partial-usage' })
  assert.deepEqual(shouldStop({ terminalObservedAt: null, usageReconciled: false, cancelled: true, now: 1 }), { stop: true, reason: 'cancelled' })
})

// ── runtimeTick: real fs + real cycle-state handoffs, one full cycle ─────────────────────────
// ── Finding 3 (remediation): the ADAPTER preserves event identity, not just the pure reducer ──
test('Finding 3 (adapter): usageRecordToObservation preserves the raw record\'s OWN eventId (never a fixed synthesized one) — two genuinely distinct delta samples for the same execution stay distinguishable; role and parentExecutionId pass through', () => {
  const first = usageRecordToObservation({ key: 'k', agentId: 'a1', eventId: 'usage-ev-1', role: 'reviewer', usage: { inputTokens: 10, isDelta: true } }, { runId: 'r1', storyId: '42', observedAt: 1 })
  const second = usageRecordToObservation({ key: 'k', agentId: 'a1', eventId: 'usage-ev-2', role: 'reviewer', usage: { inputTokens: 5, isDelta: true } }, { runId: 'r1', storyId: '42', observedAt: 2 })
  assert.notEqual(first.eventId, second.eventId, 'two distinct raw samples must not collapse onto one fixed synthesized eventId')
  assert.equal(first.role, 'reviewer')
  const withParent = usageRecordToObservation({ key: 'k', agentId: 'a1', parentExecutionId: 'parent-x' }, { runId: 'r1', storyId: '42', observedAt: 1 })
  assert.equal(withParent.parentExecutionId, 'parent-x')
  // no raw eventId supplied: falls back to the fixed id (only correct for a NON-delta cumulative
  // sample, which mergeObservations replaces rather than sums, so no double count results)
  const fallback = usageRecordToObservation({ key: 'k', agentId: 'a1' }, { runId: 'r1', storyId: '42', observedAt: 1 })
  assert.equal(fallback.eventId, `${fallback.executionId}:usage`)
})

test('Finding 3 (adapter, real duplicate source line): the usage SOURCE itself commits the same delta record twice (an at-least-once upstream retry) — runtimeTick, through the real adapter mapping, applies it once; a second, genuinely NEW delta appended later still sums on top', () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' } }])
  const usagePath = join(root, 'usage.jsonl')
  const record = { key: 'prepare', agentId: 'ag1', eventId: 'usage-ev-1', usage: { inputTokens: 100, isDelta: true } }
  // the SAME record committed twice in one read, as an at-least-once upstream export would
  writeFileSync(usagePath, JSON.stringify(record) + '\n' + JSON.stringify(record) + '\n')
  const tick1 = runtimeTick({ dir, journalPath: journal, usagePath, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: 1 })
  writeCheckpoint(dir, tick1.checkpoint)
  assert.equal(tick1.view.usage.observedTotalTokens, 100, 'the duplicated source line is applied once through the REAL adapter, not the pure function alone')
  // a later, genuinely NEW delta (its own eventId) appended to the same file DOES sum on top
  appendFileSync(usagePath, JSON.stringify({ key: 'prepare', agentId: 'ag1', eventId: 'usage-ev-2', usage: { inputTokens: 25, isDelta: true } }) + '\n')
  const tick2 = runtimeTick({ dir, journalPath: journal, usagePath, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: 2 })
  assert.equal(tick2.view.usage.observedTotalTokens, 125)
})

test('Finding 3 residual RED->GREEN (reported reproduction): the dedup ledger survives a REAL checkpoint write+read round trip across separate ticks — a delta replayed after the checkpoint is reloaded from disk stays a no-op, through the real adapter, not just the pure reducer', () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' } }])
  const usagePath = join(root, 'usage.jsonl')
  const d1 = { key: 'prepare', agentId: 'ag1', eventId: 'd1', usage: { inputTokens: 100, isDelta: true } }
  const d2 = { key: 'prepare', agentId: 'ag1', eventId: 'd2', usage: { inputTokens: 200, isDelta: true } }
  writeFileSync(usagePath, JSON.stringify(d1) + '\n' + JSON.stringify(d2) + '\n')
  const tick1 = runtimeTick({ dir, journalPath: journal, usagePath, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: 1 })
  assert.equal(tick1.view.usage.observedTotalTokens, 300)
  writeCheckpoint(dir, tick1.checkpoint) // REAL file write — the reported bug is specifically about what survives this
  // "resume": the checkpoint is RE-READ from disk (a fresh process, not the in-memory object), and
  // the usage source re-delivers d1+d2 from the start (an upstream redelivery/rotation) — this is
  // the exact residual reproduction: 100+200 -> checkpoint -> replay of d1(+d2) must stay 300.
  const reloaded = readCheckpoint(dir)
  const resumeCheckpoint = { ...reloaded, usageOffset: 0 }
  const tick2 = runtimeTick({ dir, journalPath: journal, usagePath, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: resumeCheckpoint, now: 2 })
  assert.equal(tick2.view.usage.observedTotalTokens, 300, 'a replayed delta after a real checkpoint reload must not double to 400')
  writeCheckpoint(dir, tick2.checkpoint)
  // a genuinely NEW delta after the restart still sums on top
  appendFileSync(usagePath, JSON.stringify({ key: 'prepare', agentId: 'ag1', eventId: 'd3', usage: { inputTokens: 50, isDelta: true } }) + '\n')
  const tick3 = runtimeTick({ dir, journalPath: journal, usagePath, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: 3 })
  assert.equal(tick3.view.usage.observedTotalTokens, 350)
  writeCheckpoint(dir, tick3.checkpoint)
  // a SECOND restart, replaying all three from the start again — still 350
  const secondResume = { ...readCheckpoint(dir), usageOffset: 0 }
  const tick4 = runtimeTick({ dir, journalPath: journal, usagePath, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: secondResume, now: 4 })
  assert.equal(tick4.view.usage.observedTotalTokens, 350, 'a second restart replaying the same events again must still not double-count')
})

test('Finding 4 residual RED->GREEN: dispatchStats/sharedCost supplied to runtimeTick reach the real reduced view AND persist in the checkpoint — a LATER tick that omits them keeps the last host-supplied values, never reverting to null', () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '292', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' } }])
  const dispatchStats = { redirects: 2, engineRecoveries: 1, administrativeDispatches: 0, nestedDispatches: 3 }
  const sharedCost = { tokens: 11, admittedIds: ['292', '100', '5'] }
  const tick1 = runtimeTick({ dir, journalPath: journal, runId: 'run-1', storyId: '292', repository: 'foomakers/pair', story: '292', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: 1, dispatchStats, sharedCost })
  assert.deepEqual({ redirects: tick1.view.execution.redirects, engineRecoveries: tick1.view.execution.engineRecoveries, administrativeDispatches: tick1.view.execution.administrativeDispatches, nestedDispatches: tick1.view.execution.nestedDispatches }, dispatchStats, 'the host-launch-recipe counters reached the view through the REAL tick, not a direct reducer call')
  assert.equal(tick1.view.usage.sharedOverhead, 4)
  assert.deepEqual(tick1.checkpoint.dispatchStats, dispatchStats, 'persisted in the checkpoint')
  assert.deepEqual(tick1.checkpoint.sharedCost, sharedCost)
  writeCheckpoint(dir, tick1.checkpoint)
  // a LATER tick that does NOT re-supply them must still report the last known values
  const tick2 = runtimeTick({ dir, journalPath: journal, runId: 'run-1', storyId: '292', repository: 'foomakers/pair', story: '292', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: 2 })
  assert.deepEqual({ redirects: tick2.view.execution.redirects, engineRecoveries: tick2.view.execution.engineRecoveries, administrativeDispatches: tick2.view.execution.administrativeDispatches, nestedDispatches: tick2.view.execution.nestedDispatches }, dispatchStats, 'a tick that omits dispatchStats must not silently revert real counters to null')
  assert.equal(tick2.view.usage.sharedOverhead, 4)
  writeCheckpoint(dir, tick2.checkpoint)
  // finalize (a separate real path, may run after the observer already stopped) still sees them
  const finalized = finalizeMetrics({ dir, repository: 'foomakers/pair', story: '292', branch: 'b', pr: 7, runId: 'run-1', publish: null })
  assert.deepEqual({ redirects: finalized.view.execution.redirects, engineRecoveries: finalized.view.execution.engineRecoveries }, { redirects: 2, engineRecoveries: 1 })
  assert.equal(finalized.view.usage.sharedOverhead, 4)
})

test('CLI: reconcile/finalize accept --dispatchStats/--sharedCost as JSON and wire them into the real reduced view — proving the CLI itself forwards them, not only the JS function', () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '292', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' } }])
  const dispatchStatsJson = JSON.stringify({ redirects: 5, engineRecoveries: 2, administrativeDispatches: 1, nestedDispatches: 0 })
  const r = spawnSync('node', [CLI, 'reconcile', '--dir', dir, '--repository', 'foomakers/pair', '--story', '292', '--branch', 'b', '--journal', journal, '--pr', '7', '--dispatchStats', dispatchStatsJson], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const metrics = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'))
  assert.deepEqual({ redirects: metrics.execution.redirects, engineRecoveries: metrics.execution.engineRecoveries, administrativeDispatches: metrics.execution.administrativeDispatches, nestedDispatches: metrics.execution.nestedDispatches }, { redirects: 5, engineRecoveries: 2, administrativeDispatches: 1, nestedDispatches: 0 })
  // finalize, run separately (no --dispatchStats this time), must still see the persisted values
  const ghDir = fakeGhDir()
  const fin = spawnSync('node', [CLI, 'finalize', '--dir', dir, '--repo', 'foomakers/pair', '--story', '292', '--branch', 'b', '--pr', '7'], { encoding: 'utf8', env: { ...process.env, PATH: `${ghDir}:${process.env.PATH}` } })
  assert.equal(fin.status, 0, fin.stdout + fin.stderr)
  const finalMetrics = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'))
  assert.equal(finalMetrics.execution.redirects, 5, 'finalize kept the last CLI-supplied dispatchStats from the checkpoint')
})

test('DT-18/24: one runtime tick validates sources, merges idempotently, reduces metrics, writes atomically and reports errors visibly', () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true }, { key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' } }])
  let checkpoint = readCheckpoint(dir)
  const r1 = runtimeTick({ dir, journalPath: journal, usagePath: undefined, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint, now: 1000 })
  assert.equal(r1.writeResult.written, true)
  assert.equal(r1.errors.length, 0)
  assert.ok(existsSync(join(dir, 'metrics.json')))
  writeCheckpoint(dir, r1.checkpoint)
  // a second tick with nothing new is idempotent: same offsets, still a valid (newer) write
  const r2 = runtimeTick({ dir, journalPath: journal, usagePath: undefined, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: r1.checkpoint, now: 1005 })
  assert.equal(r2.checkpoint.journalOffset, r1.checkpoint.journalOffset)
  assert.equal(r2.checkpoint.observations.length, r1.checkpoint.observations.length)
  // no stray temp files left behind
  assert.deepEqual(readdirSync(dir).filter(f => f.startsWith('.tmp-')), [])
})

test('a checkpoint kill before/after the atomic rename recovers the SAME totals on the next tick — no truncated metric view, no stale overwrite', () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' } }])
  const before = runtimeTick({ dir, journalPath: journal, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: 1 })
  // simulate a kill BEFORE the checkpoint was persisted: re-tick from the OLD (empty) checkpoint
  const stillOld = readCheckpoint(dir) // never written in this scenario
  const replay = runtimeTick({ dir, journalPath: journal, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: stillOld, now: 2 })
  assert.deepEqual(replay.checkpoint.observations.map(o => o.executionId).sort(), before.checkpoint.observations.map(o => o.executionId).sort())
  // now persist and simulate a kill AFTER: a second identical tick changes nothing new
  writeCheckpoint(dir, replay.checkpoint)
  const after = runtimeTick({ dir, journalPath: journal, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: 3 })
  assert.equal(after.checkpoint.observations.length, replay.checkpoint.observations.length)
})

// ── the observe loop: stop conditions with a controllable clock/sleep, no real waiting ───────
test('runObserveLoop: stops once a run-terminal record is observed and there is no usage source to reconcile', async () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' }, terminal: true }])
  let now = 0
  const ticks = []
  const result = await runObserveLoop({ dir, journalPath: journal, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, intervalMs: 5, sleepFn: () => Promise.resolve(), nowFn: () => (now += 10), onTick: r => ticks.push(r), maxTicks: 20 })
  assert.equal(result.stopReason, 'terminal-reconciled')
  assert.equal(ticks.length, 1, 'stops on the FIRST tick that observes the terminal record — no wasted polling')
})

test('runObserveLoop: with a usage source still pending, stops after the grace period with terminal-partial-usage, never hangs forever', async () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' }, terminal: true }])
  const usagePath = join(root, 'usage.jsonl') // declared but never written — pending forever
  let now = 0
  const result = await runObserveLoop({ dir, journalPath: journal, usagePath, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, intervalMs: 1, graceMs: 25, sleepFn: () => Promise.resolve(), nowFn: () => (now += 10), maxTicks: 100 })
  assert.equal(result.stopReason, 'terminal-partial-usage')
  assert.ok(result.ticks > 1 && result.ticks < 100, 'stopped by the grace period, not by exhausting maxTicks')
})

test('runObserveLoop: an abort signal stops the loop immediately, mid-poll — no broad process killing, just this run', async () => {
  const { dir, root } = runDir()
  const journal = journalFile(root, [])
  const controller = new AbortController()
  let ticks = 0
  const result = await runObserveLoop({ dir, journalPath: journal, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', intervalMs: 1, sleepFn: () => Promise.resolve(), nowFn: () => Date.now(), maxTicks: 1000, signal: controller.signal, onTick: () => { ticks++; if (ticks === 3) controller.abort() } })
  assert.equal(result.stopReason, 'cancelled')
  assert.equal(ticks, 3)
})

// ── finalize: honest completeness, never claims a source it never saw ───────────────────────
test('finalize: honest completeness — partial with no prior observations; a lone observation missing its counterpart/usage is STILL partial (Finding 4: an observation existing is not proof every declared source was reconciled); complete only once start+finish+usage all agree', () => {
  const { dir } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const noObs = finalizeMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'run-1' })
  assert.equal(noObs.view.snapshot.completeness, 'partial')
  // ONE observation with no matching start and no usage — an execution IS visible now, but it is
  // missing usage, so this must still be partial, never complete just because something exists
  writeCheckpoint(dir, { journalOffset: 5, usageOffset: 0, observations: [{ eventId: 'e1', executionId: 'x', runId: 'run-1', kind: 'step-finished', phase: 'r0', attempt: 1, sourceRef: 'journal' }], revision: 1 })
  const oneSided = finalizeMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'run-1' })
  assert.equal(oneSided.view.snapshot.completeness, 'partial', 'a lone finish observation with no usage is not proof of a fully reconciled cycle')
  // start + finish + usage, all consistent — genuinely complete
  writeCheckpoint(dir, {
    journalOffset: 10,
    usageOffset: 5,
    observations: [
      { eventId: 'e-start', executionId: 'x', runId: 'run-1', kind: 'step-started', phase: 'r0', attempt: 1, sourceRef: 'journal', observedAt: 1000 },
      { eventId: 'e-fin', executionId: 'x', runId: 'run-1', kind: 'step-finished', phase: 'r0', attempt: 1, sourceRef: 'journal', observedAt: 2000 },
      { eventId: 'e-usage', executionId: 'x', runId: 'run-1', kind: 'usage-observed', phase: 'r0', attempt: 1, sourceRef: 'usage', usage: { inputTokens: 10 } },
    ],
    revision: 2,
  })
  const complete = finalizeMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'run-1' })
  assert.equal(complete.view.snapshot.completeness, 'complete')
})

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
test('CLI: entry/reconcile/finalize print JSON; observe runs a bounded real loop and stops', async () => {
  const { dir, root } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  let r = spawnSync('node', [CLI, 'entry', '--dir', dir, '--repo', 'foomakers/pair', '--story', '42', '--workflowVersion', '4.0.0'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const journal = journalFile(root, [{ key: 'prepare', agentId: 'ag1', started: true, result: { status: 'ok' }, terminal: true }])
  r = spawnSync('node', [CLI, 'observe', '--dir', dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--journal', journal, '--interval-ms', '5', '--max-ticks', '20'], { encoding: 'utf8', timeout: 5000 })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const lastLine = r.stdout.trim().split('\n').pop()
  assert.equal(JSON.parse(lastLine).stopReason, 'terminal-reconciled')
  const ghDir = fakeGhDir()
  r = spawnSync('node', [CLI, 'finalize', '--dir', dir, '--repo', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7'], { encoding: 'utf8', env: { ...process.env, PATH: `${ghDir}:${process.env.PATH}` } })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(JSON.parse(r.stdout).publication.state, 'confirmed')
  r = spawnSync('node', [CLI, 'bogus'], { encoding: 'utf8' })
  assert.equal(r.status, 2)
})

// ── US-479 B4 (S7, AC-20/21/25): the host usage ADAPTER — real transcripts to metrics ─────────
// The fixture below is the REAL harness shape, anonymized: a workflow journal (`started`/`result`
// keyed by `key` + `agentId`, NO tokens and NO timestamps) beside one `agent-<id>.jsonl` transcript
// per execution, whose `assistant` records carry `message.usage`, `message.model`, `timestamp`,
// `requestId` and `apiBlockIndex`, and one `agent-<id>.meta.json` with `{agentType, spawnDepth}`.
// No message content is reproduced here — the adapter never reads any.
const KEY = n => `v2:${String(n).repeat(64)}`
// Inside ONE requestId the provider repeats the input/cache fields on every block and grows
// `output_tokens`; only the block carrying a non-null `stop_reason` completes the request.
function assistantBlocks({ agentId, requestId, at, input, cacheWrite, cacheRead, outputs, model = 'claude-opus-5', effort = 'high', complete = true }) {
  return outputs.map((out, i) => ({
    parentUuid: `${requestId}-${i}`,
    isSidechain: true,
    agentId,
    type: 'assistant',
    apiBlockIndex: i,
    requestId,
    effort,
    attributionAgent: 'pair-fix-test-author',
    timestamp: new Date(at + i * 1000).toISOString(),
    message: {
      role: 'assistant',
      model,
      stop_reason: i === outputs.length - 1 && complete ? 'end_turn' : null,
      usage: { input_tokens: input, cache_creation_input_tokens: cacheWrite, cache_read_input_tokens: cacheRead, cache_creation: { ephemeral_5m_input_tokens: cacheWrite, ephemeral_1h_input_tokens: 0 }, output_tokens: out },
    },
  }))
}
function transcripts(root, specs) {
  const dir = join(root, 'wf_fixture')
  mkdirSync(dir, { recursive: true })
  for (const s of specs) {
    writeFileSync(join(dir, `agent-${s.agentId}.meta.json`), JSON.stringify({ agentType: s.agentType, spawnDepth: s.spawnDepth ?? 1 }))
    const lines = []
    for (const r of s.requests) lines.push(...assistantBlocks({ agentId: s.agentId, ...r }))
    // user/attachment records exist in the real file and carry no usage — the adapter skips them
    lines.splice(1, 0, { agentId: s.agentId, type: 'user', timestamp: new Date(s.requests[0].at).toISOString(), uuid: 'u1' })
    writeFileSync(join(dir, `agent-${s.agentId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  }
  return dir
}
const T0 = Date.parse('2026-09-11T10:00:00.000Z')
// One reviewer (2 requests, one of them 3 blocks) and one author (1 request, 2 blocks).
const STD_SPECS = [
  { agentId: 'aaa1', agentType: 'pair-reviewer', requests: [{ requestId: 'req_a1', at: T0, input: 10, cacheWrite: 1000, cacheRead: 0, outputs: [1, 8, 500] }, { requestId: 'req_a2', at: T0 + 10_000, input: 2, cacheWrite: 0, cacheRead: 1000, outputs: [1, 40] }] },
  { agentId: 'bbb2', agentType: 'pair-fix-test-author', requests: [{ requestId: 'req_b1', at: T0 + 20_000, input: 4, cacheWrite: 500, cacheRead: 2000, outputs: [2, 300] }] },
]
// expected, computed by hand from the fixture: per request the fixed fields count ONCE and the
// output is the last block's value.  reviewer: in 10+2, write 1000, read 1000, out 500+40=540
//                                       author: in 4,     write 500,  read 2000, out 300
const STD_TOTAL = { inputTokens: 16, cacheWriteTokens: 1500, cacheReadTokens: 3000, outputTokens: 840 }
const STD_JOURNAL = [
  { type: 'started', key: KEY(1), agentId: 'aaa1' },
  { type: 'result', key: KEY(1), agentId: 'aaa1', result: { status: 'reviewed' } },
  { type: 'started', key: KEY(2), agentId: 'bbb2' },
  { type: 'result', key: KEY(2), agentId: 'bbb2', result: { status: 'red' } },
]

test('B4: usage-extract turns real transcripts into one cumulative record per execution — per request the fixed fields count once and the output is the last block, never the naive per-message sum nor the first block', () => {
  const { root, dir } = runDir()
  const tdir = transcripts(root, STD_SPECS)
  const journalPath = journalFile(root, STD_JOURNAL)
  const out = join(dir, 'usage.jsonl')
  const res = extractUsage({ transcriptsDir: tdir, journalPath, out, runId: 'run-1' })
  assert.equal(res.executions, 2)
  const records = readFileSync(out, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.equal(records.length, 2)
  const total = k => records.reduce((s, r) => s + r.usage[k], 0)
  assert.deepEqual({ inputTokens: total('inputTokens'), cacheWriteTokens: total('cacheWriteTokens'), cacheReadTokens: total('cacheReadTokens'), outputTokens: total('outputTokens') }, STD_TOTAL)
  // the two wrong reductions this invariant exists to exclude
  assert.notEqual(total('outputTokens'), 1 + 8 + 500 + 1 + 40 + 2 + 300, 'naive per-message sum')
  assert.notEqual(total('outputTokens'), 1 + 1 + 2, 'first block only')
  assert.notEqual(total('cacheReadTokens'), 1000 + 1000 + 2000 + 2000, 'cache read repeated per block')
  // identity is the journal's, not the transcript's: the same executionId the journal observation uses
  assert.deepEqual(records.map(r => r.executionId).sort(), [`run-1:${KEY(1)}:aaa1`, `run-1:${KEY(2)}:bbb2`])
  // role, model and effort come from data that is actually present
  const reviewer = records.find(r => r.executionId.includes('aaa1'))
  assert.equal(reviewer.role, 'pair-reviewer')
  assert.deepEqual(reviewer.models, ['claude-opus-5'])
  assert.deepEqual(reviewer.efforts, ['high'])
  assert.equal(reviewer.usage.requests, 2)
})

test('B4: an execution the journal knows with NO transcript stays explicitly missing, and a transcript the journal does not know keeps its cost under an explicit unattributed identity', () => {
  const { root, dir } = runDir()
  const tdir = transcripts(root, [STD_SPECS[0], { agentId: 'ccc3', agentType: 'pair-implementer', spawnDepth: 2, requests: [{ requestId: 'req_c1', at: T0 + 30_000, input: 1, cacheWrite: 7, cacheRead: 11, outputs: [5] }] }])
  const journalPath = journalFile(root, STD_JOURNAL) // knows aaa1 and bbb2; bbb2 has no transcript
  const out = join(dir, 'usage.jsonl')
  const res = extractUsage({ transcriptsDir: tdir, journalPath, out, runId: 'run-1' })
  const records = readFileSync(out, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const nested = records.find(r => r.agentId === 'ccc3')
  assert.ok(nested, 'the unattributable transcript is not silently dropped — its cost is real')
  assert.equal(nested.phase, 'unattributed')
  assert.equal(nested.attribution, 'transcript-only')
  assert.equal(nested.parentExecutionId, undefined, 'no parent is invented')
  assert.deepEqual(res.unattributed, ['ccc3'])
  // and the journal execution with no transcript is reported, never given a plausible number
  assert.deepEqual(res.withoutTranscript, [`run-1:${KEY(2)}:bbb2`])
  assert.equal(records.some(r => r.executionId.includes('bbb2')), false)
})

test('B4: a request whose last block has no stop_reason is INCOMPLETE — its observed cost is kept, and having usage does not make it complete', () => {
  const { root, dir } = runDir()
  const specs = [{ agentId: 'aaa1', agentType: 'pair-reviewer', requests: [{ requestId: 'req_a1', at: T0, input: 10, cacheWrite: 1000, cacheRead: 0, outputs: [1, 8], complete: false }] }]
  const tdir = transcripts(root, specs)
  const journalPath = journalFile(root, [STD_JOURNAL[0]])
  const out = join(dir, 'usage.jsonl')
  extractUsage({ transcriptsDir: tdir, journalPath, out, runId: 'run-1' })
  const rec = JSON.parse(readFileSync(out, 'utf8').trim())
  assert.equal(rec.usage.outputTokens, 8, 'the cost already observed is not thrown away')
  assert.equal(rec.usage.partialRequests, 1)
  assert.equal(rec.usage.requests, 1)
  assert.equal(rec.complete, false)
})

test('B4: blocks of ONE request that disagree on the fixed fields are an error, never a plausible sum or an average', () => {
  const { root, dir } = runDir()
  const tdir = transcripts(root, [STD_SPECS[0]])
  const p = join(tdir, 'agent-aaa1.jsonl')
  const lines = readFileSync(p, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const second = lines.find(l => l.type === 'assistant' && l.requestId === 'req_a1' && l.apiBlockIndex === 1)
  second.message.usage.cache_read_input_tokens = 999999
  writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  const out = join(dir, 'usage.jsonl')
  const res = extractUsage({ transcriptsDir: tdir, journalPath: journalFile(root, STD_JOURNAL), out, runId: 'run-1' })
  assert.ok(res.errors.some(e => e.error === 'usage-request-inconsistent' && e.requestId === 'req_a1'), JSON.stringify(res.errors))
  const rec = JSON.parse(readFileSync(out, 'utf8').trim().split('\n')[0])
  // req_a1 is the inconsistent one (cache write 1000, input 10, output 500); req_a2 is untouched
  assert.equal(rec.usage.cacheWriteTokens, 0, 'the disagreeing request contributes nothing, not an average')
  assert.equal(rec.usage.inputTokens, 2, 'only the consistent request counts')
  assert.equal(rec.usage.outputTokens, 40)
  assert.equal(rec.usage.inconsistentRequests, 1)
  assert.equal(rec.complete, false)
})

test('B4: re-reading, rotation and truncation never lose or double a cost already observed', () => {
  const { root, dir } = runDir()
  const tdir = transcripts(root, STD_SPECS)
  const journalPath = journalFile(root, STD_JOURNAL)
  const out = join(dir, 'usage.jsonl')
  const totals = () => {
    const recs = readFileSync(out, 'utf8').trim().split('\n').map(l => JSON.parse(l))
    const last = new Map()
    for (const r of recs) last.set(r.executionId, r) // cumulative: the last record of an execution wins
    return [...last.values()].reduce((s, r) => s + r.usage.outputTokens, 0)
  }
  extractUsage({ transcriptsDir: tdir, journalPath, out, runId: 'run-1' })
  assert.equal(totals(), 840)
  extractUsage({ transcriptsDir: tdir, journalPath, out, runId: 'run-1' }) // full re-read
  assert.equal(totals(), 840, 'a replay is cumulative, never summed twice')
  // the transcript is truncated and rewritten from scratch (rotation): the totals are rebuilt
  const p = join(tdir, 'agent-bbb2.jsonl')
  writeFileSync(p, readFileSync(p, 'utf8'))
  extractUsage({ transcriptsDir: tdir, journalPath, out, runId: 'run-1' })
  assert.equal(totals(), 840)
})

// ── B4 end to end: transcripts + journal -> the REAL tick -> metrics.json / metrics.md -> PR summary
function seedCycle(dir) {
  const file = join(dir, 'draft.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') }, mode: 'first' }))
  assert.equal(publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' }).published, true)
}

test('B4 (end to end): the host tick reads the transcripts itself and the metrics view carries the real totals, roles, models and an honest completeness', () => {
  const { root, dir } = runDir()
  seedCycle(dir)
  const tdir = transcripts(root, STD_SPECS)
  const journalPath = journalFile(root, STD_JOURNAL)
  const tick = runtimeTick({ dir, journalPath, usagePath: join(dir, 'usage.jsonl'), transcriptsDir: tdir, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: T0 + 60_000 })
  const u = tick.view.usage
  // the cache categories are reported in full but are NOT folded into the aggregate: the total is
  // the billed input+output, and cache read/write stay their own named quantities (no aggregate and
  // subcategory counted twice)
  assert.equal(u.observedTotalTokens, STD_TOTAL.inputTokens + STD_TOTAL.outputTokens)
  assert.notEqual(u.observedTotalTokens, STD_TOTAL.inputTokens + STD_TOTAL.outputTokens + STD_TOTAL.cacheReadTokens + STD_TOTAL.cacheWriteTokens)
  assert.equal(u.inputTokens, STD_TOTAL.inputTokens)
  assert.equal(u.outputTokens, STD_TOTAL.outputTokens)
  assert.equal(u.cacheReadTokens, STD_TOTAL.cacheReadTokens)
  assert.equal(u.cacheWriteTokens, STD_TOTAL.cacheWriteTokens)
  assert.deepEqual(u.coverage, { known: 2, total: 2 })
  assert.deepEqual(u.missingExecutionIds, [])
  assert.deepEqual(u.byRole.map(r => r.role).sort(), ['pair-fix-test-author', 'pair-reviewer'])
  assert.deepEqual(tick.view.workflow.models, ['claude-opus-5'], 'models come from the transcripts actually observed')
  assert.equal(tick.view.snapshot.completeness, 'complete')
  assert.deepEqual(u.incompleteExecutionIds, [])
  const md = readFileSync(join(dir, 'metrics.md'), 'utf8')
  assert.match(md, /Tokens: 856 \(coverage 2\/2\) — in 16, out 840, cache read 3000, cache write 1500/)
  assert.equal(JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8')).usage.outputTokens, 840)
})

test('B4 (end to end): an incomplete request keeps its cost AND makes the snapshot partial — never a complete view built on an unfinished request', () => {
  const { root, dir } = runDir()
  seedCycle(dir)
  const specs = [{ ...STD_SPECS[0], requests: [{ ...STD_SPECS[0].requests[0], complete: false }] }, STD_SPECS[1]]
  const tick = runtimeTick({ dir, journalPath: journalFile(root, STD_JOURNAL), usagePath: join(dir, 'usage.jsonl'), transcriptsDir: transcripts(root, specs), runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: T0 + 60_000 })
  assert.equal(tick.view.usage.outputTokens, 500 + 300, 'the observed cost is kept')
  assert.deepEqual(tick.view.usage.incompleteExecutionIds, [`run-1:${KEY(1)}:aaa1`])
  assert.equal(tick.view.snapshot.completeness, 'partial')
  assert.ok(tick.view.snapshot.missingSources.includes('usage-incomplete'), JSON.stringify(tick.view.snapshot.missingSources))
})

test('B4 (end to end): a restart with the SAME checkpoint, a rotation, and a re-read from zero all land on the same totals — never doubled, never lost', () => {
  const { root, dir } = runDir()
  seedCycle(dir)
  const tdir = transcripts(root, STD_SPECS)
  const journalPath = journalFile(root, STD_JOURNAL)
  const usagePath = join(dir, 'usage.jsonl')
  const args = { dir, journalPath, usagePath, transcriptsDir: tdir, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7 }
  let cp = readCheckpoint(dir)
  const t1 = runtimeTick({ ...args, checkpoint: cp, now: T0 + 60_000 })
  writeCheckpoint(dir, t1.checkpoint)
  const t2 = runtimeTick({ ...args, checkpoint: readCheckpoint(dir), now: T0 + 70_000 })
  assert.equal(t2.view.usage.observedTotalTokens, t1.view.usage.observedTotalTokens, 'a second tick re-extracts and replaces, it does not sum')
  writeCheckpoint(dir, t2.checkpoint)
  // the observer dies and restarts with NO checkpoint offsets, re-reading everything from zero
  const restarted = runtimeTick({ ...args, checkpoint: { ...readCheckpoint(dir), journalOffset: 0, usageOffset: 0 }, now: T0 + 80_000 })
  assert.equal(restarted.view.usage.observedTotalTokens, t1.view.usage.observedTotalTokens)
  assert.equal(restarted.view.usage.outputTokens, 840)
})

test('B4 (end to end): three clocks stay distinct — the interval is widened by the message span, never narrowed, and an end is not claimed before the host observed a terminal result', () => {
  const { root, dir } = runDir()
  seedCycle(dir)
  const tdir = transcripts(root, [STD_SPECS[0]])
  // the host sees `started` on this tick; the transcript's first message is EARLIER than the tick
  const openJournal = journalFile(root, [STD_JOURNAL[0]])
  const open = runtimeTick({ dir, journalPath: openJournal, usagePath: join(dir, 'usage.jsonl'), transcriptsDir: tdir, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: T0 + 60_000 })
  assert.equal(open.view.time.elapsedMs, null, 'an execution the host never saw finish has no measured span')
  assert.equal(open.view.time.incomplete, true)
  const { root: root2, dir: dir2 } = runDir()
  seedCycle(dir2)
  const tdir2 = transcripts(root2, [STD_SPECS[0]])
  const closed = runtimeTick({ dir: dir2, journalPath: journalFile(root2, [STD_JOURNAL[0], STD_JOURNAL[1]]), usagePath: join(dir2, 'usage.jsonl'), transcriptsDir: tdir2, runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir2), now: T0 + 60_000 })
  // start = the earliest evidence (the first message), end = the latest (the host's observation):
  // the measured span is never shrunk by preferring the more flattering clock
  assert.equal(closed.view.time.startedAt, new Date(T0).toISOString())
  assert.equal(closed.view.time.lastObservedAt, new Date(T0 + 60_000).toISOString())
  assert.equal(closed.view.time.agentMs, 60_000)
  assert.equal(closed.view.time.incomplete, false)
})

test('B4 (end to end, CLI): the last agent`s usage arrives AFTER the observer stopped — finalize reconciles it from the real sources into the SAME PR comment, idempotently', () => {
  const { root, dir } = runDir()
  seedCycle(dir)
  const tdir = transcripts(root, [STD_SPECS[0]])
  const journalPath = journalFile(root, STD_JOURNAL)
  const usagePath = join(dir, 'usage.jsonl')
  const ghDir = fakeGhDir()
  const env = { ...process.env, PATH: `${ghDir}:${process.env.PATH}` }
  // the observer ran while only the reviewer had produced anything: partial, and it stops
  const rec = spawnSync('node', [CLI, 'reconcile', '--dir', dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'run-1', '--journal', journalPath, '--usage', usagePath, '--transcripts', tdir], { encoding: 'utf8', env })
  assert.equal(rec.status, 0, rec.stdout + rec.stderr)
  assert.equal(JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8')).snapshot.completeness, 'partial', 'the author never reported: partial, not complete')
  // the author's transcript lands late, after the observer is gone
  const late = transcripts(root, STD_SPECS)
  const fin1 = spawnSync('node', [CLI, 'finalize', '--dir', dir, '--repo', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'run-1', '--journal', journalPath, '--usage', usagePath, '--transcripts', late], { encoding: 'utf8', env })
  assert.equal(fin1.status, 0, fin1.stdout + fin1.stderr)
  const view = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'))
  assert.equal(view.usage.outputTokens, 840, 'the late tail completed the same snapshot')
  assert.deepEqual(view.usage.missingExecutionIds, [])
  assert.equal(view.snapshot.completeness, 'complete')
  const comments = JSON.parse(readFileSync(join(ghDir, 'state.json'), 'utf8'))
  assert.equal(comments.length, 1, 'one synthesis comment, upserted')
  assert.match(comments[0].body, /tokens 856 \(in 16 · out 840 · cache read 3000 · cache write 1500; known 2\/2\)/)
  // a repeat reconciles nothing new and still updates exactly the same comment
  const fin2 = spawnSync('node', [CLI, 'finalize', '--dir', dir, '--repo', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'run-1', '--journal', journalPath, '--usage', usagePath, '--transcripts', late], { encoding: 'utf8', env })
  assert.equal(fin2.status, 0, fin2.stdout + fin2.stderr)
  const after = JSON.parse(readFileSync(join(ghDir, 'state.json'), 'utf8'))
  assert.equal(after.length, 1)
  assert.equal(after[0].id, comments[0].id)
  assert.equal(JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8')).usage.outputTokens, 840, 'not doubled by the repeat')
})

test('B4 (CLI): the host admin counters are DERIVED from the engine result the host already has — never hand-written JSON', () => {
  const { root, dir } = runDir()
  const resultPath = join(root, 'wf-result.json')
  writeFileSync(
    resultPath,
    JSON.stringify({
      workflowVersion: '4.0.0',
      batch: [{ id: '42', status: 'ready-for-merge', metrics: { dispatches: 9, retries: 2, redirects: 3 } }],
      metrics: { dispatches: 11, retries: 2, redirects: 3, perDispatch: [{ label: 'contract:code-review' }, { label: 'prepare:#42 a0' }, { label: 'verify:#42 r0' }] },
    }),
  )
  const out = spawnSync('node', [CLI, 'dispatch-stats', '--result', resultPath, '--story', '42'], { encoding: 'utf8' })
  assert.equal(out.status, 0, out.stdout + out.stderr)
  const stats = JSON.parse(out.stdout)
  assert.deepEqual(stats, { redirects: 3, engineRecoveries: 2, administrativeDispatches: 1, nestedDispatches: null })
  // and it flows through the real tick into the metrics view
  seedCycle(dir)
  const tick = runtimeTick({ dir, journalPath: journalFile(root, STD_JOURNAL), usagePath: join(dir, 'usage.jsonl'), transcriptsDir: transcripts(root, STD_SPECS), runId: 'run-1', storyId: '42', repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, checkpoint: readCheckpoint(dir), now: T0 + 60_000, dispatchStats: stats })
  assert.equal(tick.view.execution.redirects, 3)
  assert.equal(tick.view.execution.engineRecoveries, 2)
  assert.equal(tick.view.execution.administrativeDispatches, 1)
  assert.equal(tick.view.execution.nestedDispatches, null, 'a counter the host cannot observe stays null, never 0')
})
