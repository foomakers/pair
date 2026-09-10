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
