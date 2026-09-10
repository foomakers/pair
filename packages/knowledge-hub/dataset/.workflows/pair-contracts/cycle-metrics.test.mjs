// Tests for cycle-metrics.mjs — the deterministic metrics reducer (US-479 T-24, S6/S7/S9).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import {
  METRICS_SCHEMA_VERSION,
  normalizeObservation,
  mergeObservations,
  allocateSharedCost,
  reduceTime,
  reduceUsage,
  reduceCycleMetrics,
  renderMarkdown,
  writeMetrics,
  aggregateCohort,
} from '../../skills/pair-workflow-review-phase/scripts/cycle-metrics.mjs'
import { publish } from '../../skills/pair-workflow-review-phase/scripts/cycle-state.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-review-phase/scripts/cycle-metrics.mjs', import.meta.url))
const SHA = c => c.repeat(40)

function runDir() {
  const root = mkdtempSync(join(tmpdir(), 'metrics-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  return { root, dir }
}

test('cycle-metrics.mjs ships byte-identical inside review-phase (installed and dataset)', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const canonical = read('../../skills/pair-workflow-review-phase/scripts/cycle-metrics.mjs')
  assert.equal(read('../../../packages/knowledge-hub/dataset/.skills/workflow/review-phase/scripts/cycle-metrics.mjs'), canonical)
})

test('METRICS_SCHEMA_VERSION is pinned at 1 (US-479 T-19 S1)', () => {
  assert.equal(METRICS_SCHEMA_VERSION, 1)
})

// ── observations: identity, idempotent merge (DT-19) ────────────────────────────────────────
test('DT-19: a duplicate journal record and a cumulative usage replacement do not double count; a different agent id with identical output IS a new execution', () => {
  const a = { kind: 'usage-observed', runId: 'r1', sourceRef: 's1', agentId: 'ag-1', usage: { inputTokens: 10, outputTokens: 5 } }
  const dup = { ...a }
  const { observations, errors } = mergeObservations([a, dup])
  assert.equal(errors.length, 0)
  assert.equal(observations.length, 1, 'the exact duplicate record collapses to one')
  // a later cumulative sample from the SAME execution replaces, never adds
  const replaced = mergeObservations([a, { ...a, usage: { inputTokens: 30, outputTokens: 15 } }])
  assert.equal(replaced.observations.length, 1)
  assert.equal(replaced.observations[0].usage.inputTokens, 30)
  // a delta-marked sample sums
  const delta = mergeObservations([a, { ...a, usage: { inputTokens: 4, outputTokens: 1, isDelta: true } }])
  assert.deepEqual(delta.observations[0].usage.inputTokens, 14)
  // a DIFFERENT agent id is a REAL new execution — never merged, even with an identical reply
  const b = { ...a, agentId: 'ag-2' }
  const distinct = mergeObservations([a, b])
  assert.equal(distinct.observations.length, 2)
  // malformed records are reported, not silently skipped
  const bad = mergeObservations([{ kind: 'nonsense' }, { kind: 'usage-observed', runId: 'r1' }])
  assert.equal(bad.observations.length, 0)
  assert.equal(bad.errors.length, 2)
})

// ── shared cost allocation (DT-21) ───────────────────────────────────────────────────────────
test('DT-21: 11 shared tokens over 3 sorted admitted PRs allocate 4/4/3, including a failed PR; batch counts 11 once', () => {
  const out = allocateSharedCost({ tokens: 11, admittedIds: ['292', '100', '5'] })
  assert.deepEqual(out.allocations, { '100': 4, '292': 4, '5': 3 })
  assert.equal(Object.values(out.allocations).reduce((a, b) => a + b, 0), 11)
  assert.equal(out.coverage, 'known')
  // unknown shared cost stays unknown, never zero
  const unknown = allocateSharedCost({ tokens: null, admittedIds: ['1', '2'] })
  assert.equal(unknown.coverage, 'unknown')
  assert.deepEqual(unknown.allocations, { 1: null, 2: null })
})

// ── time: union vs sum (DT-23) ────────────────────────────────────────────────────────────────
test('DT-23: intervals [0,10] and [5,15] give active wall=15 (union), agent sum=20; negative/impossible intervals are flagged, not silently dropped', () => {
  const t = reduceTime([{ startMs: 0, endMs: 10 }, { startMs: 5, endMs: 15 }])
  assert.deepEqual({ elapsedMs: t.elapsedMs, activeWallMs: t.activeWallMs, agentMs: t.agentMs, waitMs: t.waitMs }, { elapsedMs: 15, activeWallMs: 15, agentMs: 20, waitMs: 0 })
  const withGap = reduceTime([{ startMs: 0, endMs: 10 }])
  assert.equal(withGap.waitMs, 0)
  const flagged = reduceTime([{ startMs: 0, endMs: 10 }, { startMs: -5, endMs: 3 }])
  assert.equal(flagged.incomplete, true)
  assert.equal(flagged.flaggedCount, 1)
  assert.equal(flagged.waitMs, null, 'incomplete coverage never fabricates elapsed-active')
  const empty = reduceTime([])
  assert.deepEqual(empty, { elapsedMs: null, activeWallMs: null, agentMs: null, waitMs: null, incomplete: false, flaggedCount: 0 })
})

// ── usage: inclusive aggregation, missing coverage never a fabricated zero (DT-20/22) ────────
test('DT-20/22: known usage sums are exact; a missing token count is never a fabricated 0, and coverage names exactly what is known', () => {
  const obs = [
    { kind: 'usage-observed', runId: 'r1', sourceRef: 's1', executionId: 'e1', usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10 } },
    { kind: 'usage-observed', runId: 'r1', sourceRef: 's2', executionId: 'e2', usage: {} },
  ]
  const u = reduceUsage(obs)
  assert.equal(u.observedTotalTokens, 150)
  assert.equal(u.cacheReadTokens, 10)
  assert.deepEqual(u.coverage, { known: 1, total: 2 })
  assert.deepEqual(u.missingExecutionIds, ['e2'])
  const empty = reduceUsage([])
  assert.deepEqual(empty.coverage, { known: 0, total: 0 })
  assert.equal(empty.observedTotalTokens, null, 'zero observations means UNKNOWN, never a fabricated 0')
})

// ── the main reducer, over real handoffs ──────────────────────────────────────────────────────
test('DT-18: reduceCycleMetrics derives quality/delivery/cycles/defects/scopeChanges from the durable handoffs alone — schemaVersion pinned, snapshot has a digest', () => {
  const { dir } = runDir()
  const draft = (phase, skill, fields) => {
    const file = join(dir, `tmp-${phase}-${skill}.json`)
    writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'feature/US-42', phase, skill, inputHead: SHA('a'), ...fields }))
    const out = publish({ dir, file, phase, skill, workflowVersion: '4.0.0' })
    assert.equal(out.published, true, JSON.stringify(out))
  }
  draft('r0', 'review-phase', {
    reviewedHead: SHA('c'),
    verdict: 'APPROVED',
    findings: [{ id: 'r0-1', severity: 'Major', location: 'x', description: 'd', recommendation: 'r', blocking: false, transition: 'resolved', kind: 'defect' }],
    scopeChanges: [{ id: 'sc-1', type: 'new-requirement', proposal: 'p', status: 'pending' }],
    custody: { verified: true, contractBreach: false },
    readiness: { ready: true, remoteHead: SHA('c') },
  })
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'feature/US-42', pr: 7, runId: 'run-1', revision: 1, asOf: '2026-09-10T00:00:00.000Z' })
  assert.equal(view.schemaVersion, 1)
  assert.equal(view.identity.storyId, '42')
  assert.equal(view.identity.prNumber, 7)
  assert.match(view.snapshot.sourceDigest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(view.outcome.quality, 'converged', 'zero blocking findings converges quality regardless of the pending scope proposal — those are separate axes (S2)')
  assert.equal(view.scopeChanges.pending, 1)
  assert.equal(view.defects.closedBySeverity.Major, 1)
  const md = renderMarkdown(view)
  assert.match(md, /Quality: \*\*/)
})

test('reduceCycleMetrics: zero blocking findings and a pending scope proposal is a converged quality, awaiting-scope-decision delivery', () => {
  const { dir } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], scopeChanges: [{ id: 'sc-1', type: 'new-requirement', proposal: 'p', status: 'pending' }], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7 })
  assert.equal(view.outcome.quality, 'converged')
  assert.equal(view.outcome.delivery, 'awaiting-scope-decision')
})

test('writeMetrics: atomic write, revision-guarded — a stale revision never overwrites a newer persisted view', () => {
  const { dir } = runDir()
  const v1 = { schemaVersion: 1, identity: { repository: 'x', storyId: '1' }, snapshot: { revision: 2 }, outcome: {}, cycles: {}, execution: {}, usage: { coverage: {} }, time: {}, defects: {}, scopeChanges: { entries: [] }, steps: [], publication: {}, workflow: { versions: [] } }
  const out1 = writeMetrics({ dir, view: v1 })
  assert.equal(out1.written, true)
  assert.ok(existsSync(join(dir, 'metrics.json')) && existsSync(join(dir, 'metrics.md')))
  const stale = { ...v1, snapshot: { revision: 1 } }
  const out2 = writeMetrics({ dir, view: stale })
  assert.equal(out2.written, false)
  assert.equal(out2.reason, 'stale-revision')
  assert.equal(JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8')).snapshot.revision, 2, 'the newer view was never clobbered')
  const newer = { ...v1, snapshot: { revision: 3 } }
  assert.equal(writeMetrics({ dir, view: newer }).written, true)
  assert.equal(readFileSync(join(dir, 'metrics.json'), 'utf8').includes('"revision": 3'), true)
  assert.deepEqual(readdirSync(dir).filter(f => f.startsWith('.tmp-')), [])
})

// ── aggregate cohort (DT-25) ──────────────────────────────────────────────────────────────────
test('DT-25: a cohort of 5 (2 completed, 1 blocked, 1 abandoned, 1 running) is 40/20/20/20/0%, settled denominator 4; ready cycles 1 and 3 give mean 2, median 2, p90 3', () => {
  const entry = (state, cycles) => ({ outcome: { cohortState: state }, cycles: { completed: cycles }, usage: { observedTotalTokens: null } })
  const cohort = aggregateCohort([entry('completed', 1), entry('completed', 3), entry('blocked', 0), entry('abandoned', 0), entry('running', 0)])
  assert.deepEqual({ completedRate: cohort.completedRate, blockedRate: cohort.blockedRate, abandonedRate: cohort.abandonedRate, runningRate: cohort.runningRate, interruptedRate: cohort.interruptedRate }, { completedRate: 0.4, blockedRate: 0.2, abandonedRate: 0.2, runningRate: 0.2, interruptedRate: 0 })
  assert.equal(cohort.settled.denominator, 4)
  assert.equal(cohort.meanCompletedCycles, 2)
  assert.equal(cohort.medianCompletedCycles, 2)
  assert.equal(cohort.p90CompletedCycles, 3)
})

test('aggregateCohort: N=0 returns null rates, never 0% success; a mix of known/unknown token entries labels cost as a lower bound', () => {
  const empty = aggregateCohort([])
  assert.equal(empty.n, 0)
  assert.equal(empty.completedRate, null)
  const withTokens = aggregateCohort([
    { outcome: { cohortState: 'completed' }, cycles: { completed: 1 }, usage: { observedTotalTokens: 100 } },
    { outcome: { cohortState: 'completed' }, cycles: { completed: 1 }, usage: { observedTotalTokens: null } },
  ])
  assert.equal(withTokens.allWorkTokens, 100)
  assert.equal(withTokens.costPerCompletedDelivery.lowerBound, true)
})

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
test('CLI: reduce/write/aggregate print JSON; an unknown command exits 2', () => {
  const { dir } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } }))
  publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.0' })
  let r = spawnSync('node', [CLI, 'reduce', '--dir', dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(JSON.parse(r.stdout).schemaVersion, 1)
  r = spawnSync('node', [CLI, 'write', '--dir', dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.ok(existsSync(join(dir, 'metrics.json')))
  r = spawnSync('node', [CLI, 'frobnicate'], { encoding: 'utf8' })
  assert.equal(r.status, 2)
})
