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
  renderPrSummary,
  publishSummary,
  updatePublicationState,
  HUMAN_BOUNDARY,
  writeMetrics,
  aggregateCohort,
  foldCohortIdentities,
} from '../../skills/pair-workflow-review-phase/scripts/cycle-metrics.mjs'
import { publish } from '../../skills/pair-workflow-review-phase/scripts/cycle-state.mjs'
import { findByMarker, withMarker } from '../../skills/pair-workflow-review-phase/scripts/pr-comment.mjs'

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

// ── Finding 3 (remediation): idempotent delta dedup, coverage from OBSERVED executions ──────
test('Finding 3.B RED->GREEN: the SAME delta usage event (identical executionId AND eventId) replayed twice is applied ONCE — 100, never 200; a genuinely distinct delta (different eventId) still sums', () => {
  const first = { eventId: 'usage-ev-1', kind: 'usage-observed', runId: 'r1', sourceRef: 's1', executionId: 'x1', usage: { inputTokens: 100, isDelta: true } }
  const replay = { ...first } // byte-identical replay of the SAME observed event
  const out = mergeObservations([first, replay])
  assert.equal(out.observations.length, 1)
  assert.equal(out.observations[0].usage.inputTokens, 100, 'a replayed identical delta event must not double the total')
  // a THIRD, genuinely new delta (its own eventId) still sums on top
  const second = { eventId: 'usage-ev-2', kind: 'usage-observed', runId: 'r1', sourceRef: 's1', executionId: 'x1', usage: { inputTokens: 40, isDelta: true } }
  const withNewDelta = mergeObservations([first, replay, second])
  assert.equal(withNewDelta.observations[0].usage.inputTokens, 140, 'a distinct delta event is summed, never dropped')
  // replayed out of order (the "new" one arrives before its own later replay) is still idempotent
  const outOfOrder = mergeObservations([first, second, replay])
  assert.equal(outOfOrder.observations[0].usage.inputTokens, 140)
})

test('Finding 3 residual RED->GREEN: the dedup ledger survives across a checkpoint/restart round trip — 100+200 -> ledger -> replay of the FIRST delta = 300, never 400; a new distinct delta after restart = 350; a second restart replaying the SAME two again still = 350', () => {
  const d1 = { eventId: 'd1', kind: 'usage-observed', runId: 'r1', sourceRef: 's1', executionId: 'x1', usage: { inputTokens: 100, isDelta: true } }
  const d2 = { eventId: 'd2', kind: 'usage-observed', runId: 'r1', sourceRef: 's1', executionId: 'x1', usage: { inputTokens: 200, isDelta: true } }
  // tick 1: both distinct deltas observed together — 300, and a ledger naming both is returned
  const tick1 = mergeObservations([d1, d2])
  assert.equal(tick1.observations[0].usage.inputTokens, 300)
  assert.deepEqual(tick1.appliedDeltaEventIds, { x1: ['d1', 'd2'] })
  // "checkpoint": only the MERGED observations + the ledger are persisted (never the raw deltas) —
  // exactly what cycle-runtime.mjs's checkpoint.json carries. Resume replays d1 (a lost-response
  // retry of the SAME event) WITHOUT feeding the ledger back in — this is the reported regression.
  const resumeWithoutLedger = mergeObservations([...tick1.observations, d1])
  assert.equal(resumeWithoutLedger.observations[0].usage.inputTokens, 400, '(documents the residual bug when the ledger is dropped, e.g. a caller that ignores it)')
  // the ACTUAL fix: the persisted ledger is seeded back in on resume
  const tick2 = mergeObservations([...tick1.observations, d1], tick1.appliedDeltaEventIds)
  assert.equal(tick2.observations[0].usage.inputTokens, 300, 'replay of an already-applied delta after restart stays a no-op')
  assert.deepEqual(tick2.appliedDeltaEventIds, { x1: ['d1', 'd2'] })
  // a genuinely NEW delta (d3) after the restart still sums on top
  const d3 = { eventId: 'd3', kind: 'usage-observed', runId: 'r1', sourceRef: 's1', executionId: 'x1', usage: { inputTokens: 50, isDelta: true } }
  const tick3 = mergeObservations([...tick2.observations, d3], tick2.appliedDeltaEventIds)
  assert.equal(tick3.observations[0].usage.inputTokens, 350)
  assert.deepEqual(tick3.appliedDeltaEventIds, { x1: ['d1', 'd2', 'd3'] })
  // ANOTHER restart, replaying d1 AND d2 again — still 350, never re-summed
  const tick4 = mergeObservations([...tick3.observations, d1, d2], tick3.appliedDeltaEventIds)
  assert.equal(tick4.observations[0].usage.inputTokens, 350)
  // the SAME eventId used by a DIFFERENT execution is its own, unrelated identity — never confluated
  const otherExecSameEventId = { eventId: 'd1', kind: 'usage-observed', runId: 'r1', sourceRef: 's1', executionId: 'x2', usage: { inputTokens: 999, isDelta: true } }
  const tick5 = mergeObservations([...tick4.observations, otherExecSameEventId], tick4.appliedDeltaEventIds)
  const byExec = Object.fromEntries(tick5.observations.filter(o => o.kind === 'usage-observed').map(o => [o.executionId, o.usage.inputTokens]))
  assert.deepEqual(byExec, { x1: 350, x2: 999 })
})

test('Finding 3.A RED->GREEN: reduceUsage denominator counts every OBSERVED execution (step-started/finished), not only ones that reported usage — B is explicitly missing, never invisible', () => {
  const obs = [
    { eventId: 'a-start', executionId: 'A', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal' },
    { eventId: 'a-fin', executionId: 'A', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal' },
    { eventId: 'a-usage', executionId: 'A', runId: 'r1', phase: 'p', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', usage: { inputTokens: 100 } },
    { eventId: 'b-start', executionId: 'B', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal' },
    { eventId: 'b-fin', executionId: 'B', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal' },
    // B never reports usage
  ]
  const u = reduceUsage(obs)
  assert.deepEqual(u.coverage, { known: 1, total: 2 }, 'B is a real observed execution missing usage, so the denominator is 2')
  assert.deepEqual(u.missingExecutionIds, ['B'])
  assert.equal(u.observedTotalTokens, 100)
})

test('Finding 3: parent/child accounting never double-counts an inclusive-subtree total together with its own children', () => {
  const obs = [
    { eventId: 'p-start', executionId: 'parent', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal' },
    { eventId: 'p-usage', executionId: 'parent', runId: 'r1', phase: 'p', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', usage: { inputTokens: 500, accountingBasis: 'inclusive-subtree' } },
    { eventId: 'c-start', executionId: 'child', parentExecutionId: 'parent', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal' },
    { eventId: 'c-usage', executionId: 'child', parentExecutionId: 'parent', runId: 'r1', phase: 'p', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', usage: { inputTokens: 120 } },
  ]
  const u = reduceUsage(obs)
  assert.equal(u.observedTotalTokens, 500, 'the parent already reports the whole subtree — the child is excluded, never added again')
  assert.equal(u.coverage.total, 1, 'the child is excluded from the denominator too — it is accounted for, not missing')
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

// ── Finding 2 (remediation): observer/reducer timestamp format must agree ───────────────────
test('Finding 2 RED->GREEN: runtimeTick emits observedAt as an epoch-ms NUMBER (S7); reduceCycleMetrics must consume that format directly, never Date.parse on a number, never crash', () => {
  const { dir } = runDir()
  const obs = [
    { eventId: 'e1', executionId: 'x1', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal', observedAt: 1700000000000 },
    { eventId: 'e2', executionId: 'x1', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal', observedAt: 1700000001000 },
  ]
  // this call used to throw RangeError: Invalid time value (Date.parse(1700000000000) is NaN)
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '1', branch: 'b', observations: obs })
  assert.equal(view.time.elapsedMs, 1000)
  assert.equal(view.time.activeWallMs, 1000)
  assert.equal(view.time.startedAt, new Date(1700000000000).toISOString())
  assert.equal(view.time.lastObservedAt, new Date(1700000001000).toISOString())
})

test('Finding 2: replay/resume across separate ticks (start on tick 1, finish on tick 2) still produces one correct interval; invalid timestamps are explicit partial evidence, never a crash and never an invented duration', () => {
  const { dir } = runDir()
  // start and finish observed on SEPARATE ticks (merged, as a checkpoint would accumulate them)
  const tick1 = [{ eventId: 'e1', executionId: 'x1', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal', observedAt: 1000 }]
  const tick2 = [{ eventId: 'e2', executionId: 'x1', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal', observedAt: 4000 }]
  const { observations: merged1 } = mergeObservations(tick1)
  const { observations: merged2 } = mergeObservations([...merged1, ...tick2])
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '1', branch: 'b', observations: merged2 })
  assert.equal(view.time.elapsedMs, 3000)
  assert.equal(view.time.incomplete, false, 'both timestamps were valid — nothing is flagged incomplete')
  assert.equal(view.time.activeWallMs, 3000)
  // an invalid/garbage timestamp on one execution never crashes and never fabricates a duration —
  // it is dropped from the union/sum and the view stays honest about partial coverage
  const withGarbage = [...merged2, { eventId: 'e3', executionId: 'x2', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal', observedAt: 'not-a-timestamp' }, { eventId: 'e4', executionId: 'x2', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal', observedAt: NaN }]
  const view2 = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '1', branch: 'b', observations: withGarbage })
  assert.equal(view2.time.elapsedMs, 3000, 'the garbage-timestamped execution never poisons the valid interval')
  assert.equal(view2.time.activeWallMs, 3000)
})

test('Finding 2: archived/replayed log entries arriving simultaneously (identical arrival tick) never get a fabricated non-zero historical duration attributed to them', () => {
  const { dir } = runDir()
  // two archived records observed in the SAME tick (same arrival time) — their REAL historical
  // duration is unknown; the reducer must not invent one from the arrival gap being zero
  const obs = [
    { eventId: 'e1', executionId: 'x1', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal', observedAt: 5000 },
    { eventId: 'e2', executionId: 'x1', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal', observedAt: 5000 },
  ]
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '1', branch: 'b', observations: obs })
  assert.equal(view.time.agentMs, 0, 'a zero-width observed interval is legitimately zero, not an error')
  assert.equal(view.time.activeWallMs, 0)
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

// ── Finding 4 (remediation): real execution derivation, never placeholders ──────────────────
test('Finding 4: execution.dispatches counts OBSERVED executions (step-started), never the handoff count; startedWithoutResult is real; zero telemetry is explicit null, not a fabricated 0', () => {
  const { dir } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', contractPath: '/x', contractHash: `sha256:${'1'.repeat(64)}` }))
  publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: '4.0.0' })
  // no observations at all: dispatches/startedWithoutResult are NOT measurable — null, never 0
  const noObs = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7 })
  assert.equal(noObs.execution.dispatches, null)
  assert.equal(noObs.execution.startedWithoutResult, null)
  assert.equal(noObs.execution.redirects, null)
  assert.equal(noObs.execution.engineRecoveries, null)
  assert.equal(noObs.execution.administrativeDispatches, null)
  assert.equal(noObs.execution.nestedDispatches, null)
  // three executions started, only two finished — one handoff exists (unrelated to this count)
  const obs = [
    { eventId: 'a-s', executionId: 'A', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal' },
    { eventId: 'a-f', executionId: 'A', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal' },
    { eventId: 'b-s', executionId: 'B', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal' },
    { eventId: 'b-f', executionId: 'B', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal' },
    { eventId: 'c-s', executionId: 'C', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal' },
    // C never reports a result — started without a result
  ]
  const withObs = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, observations: obs })
  assert.equal(withObs.execution.dispatches, 3, 'three EXECUTIONS started, not the one handoff on disk')
  assert.equal(withObs.execution.startedWithoutResult, 1)
})

test('Finding 4: an explicitly supplied dispatchStats (from the host launch recipe / WF result) fills redirects/engineRecoveries/administrativeDispatches/nestedDispatches honestly — never invented when absent', () => {
  const { dir } = runDir()
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', dispatchStats: { redirects: 2, engineRecoveries: 1, administrativeDispatches: 0, nestedDispatches: 3 } })
  assert.deepEqual({ redirects: view.execution.redirects, engineRecoveries: view.execution.engineRecoveries, administrativeDispatches: view.execution.administrativeDispatches, nestedDispatches: view.execution.nestedDispatches }, { redirects: 2, engineRecoveries: 1, administrativeDispatches: 0, nestedDispatches: 3 })
})

test('Finding 4: byRole aggregates usage tokens by the role an observation actually carries; sharedOverhead is the real allocateSharedCost share, wired into the reducer path (not orphaned)', () => {
  const { dir } = runDir()
  const obs = [
    { eventId: 'r-s', executionId: 'R', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal', role: 'reviewer' },
    { eventId: 'r-u', executionId: 'R', runId: 'r1', phase: 'p', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', role: 'reviewer', usage: { inputTokens: 200 } },
    { eventId: 'g-s', executionId: 'G', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal', role: 'green' },
    { eventId: 'g-u', executionId: 'G', runId: 'r1', phase: 'p', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', role: 'green', usage: { inputTokens: 50 } },
  ]
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '292', branch: 'b', observations: obs, sharedCost: { tokens: 11, admittedIds: ['292', '100', '5'] } })
  assert.deepEqual(new Set(view.usage.byRole), new Set([{ role: 'reviewer', tokens: 200 }, { role: 'green', tokens: 50 }]))
  assert.equal(view.usage.sharedOverhead, 4, 'story 292 sorts alongside 100 for the +1 remainder share (DT-21 formula)')
})

test('Finding 4 residual RED->GREEN (reported reproduction): an execution started with usage present but NO result is real timing coverage loss — time.incomplete must be true and completeness partial, never a silent complete', () => {
  const { dir } = runDir()
  const obs = [
    { eventId: 'a-s', executionId: 'A', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-started', sourceRef: 'journal', observedAt: 1000 },
    { eventId: 'a-u', executionId: 'A', runId: 'r1', phase: 'p', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', usage: { inputTokens: 10 } },
    // A never reports a result — no step-finished/failed/cancelled at all
  ]
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', observations: obs })
  assert.equal(view.execution.startedWithoutResult, 1)
  assert.equal(view.time.elapsedMs, null, 'no interval could ever be closed')
  assert.equal(view.time.incomplete, true, 'a start with no finish IS missing timing coverage — the prior bug reported this as false')
  assert.equal(view.snapshot.completeness, 'partial', 'an unresolved execution must never read as complete')
  assert.deepEqual(view.snapshot.missingSources, ['timing'])
  // the symmetric case — a finish arrives with NO matching start — is equally incomplete, never dropped
  const orphanFinish = [{ eventId: 'z-f', executionId: 'Z', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal', observedAt: 2000 }]
  const view2 = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', observations: orphanFinish })
  assert.equal(view2.time.incomplete, true)
  assert.equal(view2.snapshot.completeness, 'partial')
  // a FULLY resolved execution alongside it still reports complete once every source reconciles
  const resolved = [...obs, { eventId: 'a-f', executionId: 'A', runId: 'r1', phase: 'p', attempt: 1, kind: 'step-finished', sourceRef: 'journal', observedAt: 1500 }]
  const view3 = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', observations: resolved })
  assert.equal(view3.time.incomplete, false)
  assert.equal(view3.snapshot.completeness, 'complete')
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

// ── US-479 T-26: PR summary persistence (DT-25/26/28/29/30) ─────────────────────────────────
// An in-memory comment store standing in for `gh`, using pr-comment.mjs's OWN pure withMarker/
// findByMarker so the merge/ambiguity semantics tested here are the real ones, never a re-implementation.
function fakeStore(initial = []) {
  const comments = [...initial]
  let nextId = comments.reduce((m, c) => Math.max(m, c.id), 0) + 1
  return {
    listComments: () => comments,
    upsert: ({ marker, body }) => {
      const { hits } = findByMarker(comments, marker)
      if (hits.length > 1) return { error: 'marker-ambiguous', ids: hits.map(h => h.id), marker }
      const full = withMarker(body, marker)
      if (hits.length === 1) {
        if (hits[0].body === full) return { action: 'unchanged', id: hits[0].id, url: hits[0].url, marker }
        hits[0].body = full
        return { action: 'updated', id: hits[0].id, url: hits[0].url, marker }
      }
      const c = { id: nextId++, body: full, url: `https://x/c/${nextId}` }
      comments.push(c)
      return { action: 'created', id: c.id, url: c.url, marker }
    },
  }
}
function sampleView(overrides = {}) {
  return {
    schemaVersion: 1,
    identity: { canonicalRunId: 'run-1', runIds: ['run-1'] },
    workflow: { name: 'pair-implement-batch', versions: ['4.0.0'], mixedVersions: false, models: ['sonnet'] },
    snapshot: { revision: 1, asOf: '2026-09-10T00:00:00.000Z', sourceDigest: 'sha256:' + 'a'.repeat(64), completeness: 'complete', missingSources: [] },
    outcome: { quality: 'converged', delivery: 'ready-for-merge', reason: null, reviewedHead: SHA('c') },
    cycles: { attempted: 1, completed: 1 },
    execution: { reviewBatches: 1, reviewExecutions: 1, retries: 0, redirects: 0, contractRevisions: 0, preparationRepairs: 0, engineRecoveries: 0 },
    usage: { observedTotalTokens: 500, coverage: { known: 2, total: 2 }, missingExecutionIds: [] },
    time: { elapsedMs: 1000, activeWallMs: 900, agentMs: 1200, waitMs: 100 },
    defects: { late: { preexistingMissed: 0, introducedByRemediation: 0, unknown: 0 } },
    scopeChanges: { entries: [] },
    publication: { marker: null, commentId: null, url: null, metricsRevision: null, sourceDigest: null, state: 'pending', lastError: null },
    ...overrides,
  }
}

test('DT-28: renderPrSummary contains all six required sections in order, a separate scope table, and the compact schema-1 JSON with the same digest/revision as the view', () => {
  const view = sampleView({ scopeChanges: { entries: [{ id: 'sc-1', type: 'new-requirement', status: 'pending', targetIssueUrl: null }] } })
  const md = renderPrSummary(view)
  const order = ['**1. Identity**', '**2. Status**', '**3. Cycles**', '**4. Cost / time**', '**5. Late defects**', '**6. Machine-readable summary**']
  let lastIdx = -1
  for (const marker of order) {
    const idx = md.indexOf(marker)
    assert.ok(idx > lastIdx, `${marker} missing or out of order`)
    lastIdx = idx
  }
  assert.match(md, /\| sc-1 \| new-requirement \| pending \| — \|/)
  const jsonMatch = /```json\n([\s\S]*?)\n```/.exec(md)
  const embedded = JSON.parse(jsonMatch[1])
  assert.equal(embedded.sourceDigest, view.snapshot.sourceDigest)
  assert.equal(embedded.metricsRevision, view.snapshot.revision)
})

test('DT-25/28: publishSummary creates the ONE synthesis comment (distinct from a first-review marker), then read-back confirms marker/head/digest before reporting confirmed', () => {
  const firstReviewMarker = '<!-- pair:first-review #42 PR#7 -->'
  const store = fakeStore([{ id: 1, body: `${firstReviewMarker}\nfirst review body` }])
  const view = sampleView()
  const marker = '<!-- pair:synthesis #42 PR#7 -->'
  const out = publishSummary({ view, marker, pr: 7, repo: 'foomakers/pair', findByMarker, ...store })
  assert.equal(out.published, true, JSON.stringify(out))
  assert.deepEqual({ state: out.publication.state, sourceDigest: out.publication.sourceDigest, metricsRevision: out.publication.metricsRevision }, { state: 'confirmed', sourceDigest: view.snapshot.sourceDigest, metricsRevision: view.snapshot.revision })
  // the first-review comment is untouched — a distinct comment
  const first = store.listComments().find(c => c.body.startsWith(firstReviewMarker))
  assert.equal(first.body, `${firstReviewMarker}\nfirst review body`)
  assert.equal(store.listComments().length, 2)
})

test('DT-29: a lost response is safe to retry — the SAME comment id is reused, never a duplicate; an ambiguous marker (two comments) is reported, never silently picked', () => {
  const marker = '<!-- pair:synthesis #42 PR#7 -->'
  const store = fakeStore()
  const view = sampleView()
  const first = publishSummary({ view, marker, pr: 7, repo: 'x', findByMarker, ...store })
  const retry = publishSummary({ view, marker, pr: 7, repo: 'x', findByMarker, ...store })
  assert.equal(retry.publication.commentId, first.publication.commentId)
  assert.equal(store.listComments().length, 1, 'a retried publish never posts a second comment')
  // ambiguity: two comments carrying the marker
  const dup = fakeStore([{ id: 1, body: `${marker}\nA` }, { id: 2, body: `${marker}\nB` }])
  const ambiguous = publishSummary({ view, marker, pr: 7, repo: 'x', findByMarker, ...dup })
  assert.equal(ambiguous.published, false)
  assert.equal(ambiguous.publication.state, 'failed')
  assert.match(ambiguous.publication.lastError, /marker-ambiguous/)
})

test('DT-28: a republish preserves human material written after the owned boundary; a publish failure leaves local evidence intact and reports failed-publication only for the delivery reason', () => {
  const marker = '<!-- pair:synthesis #42 PR#7 -->'
  const view = sampleView()
  const withHuman = [{ id: 1, body: `${marker}\nold summary${HUMAN_BOUNDARY}\n\n> maintainer note: looks good` }]
  const store = fakeStore(withHuman)
  const out = publishSummary({ view, marker, pr: 7, repo: 'x', findByMarker, ...store })
  assert.equal(out.published, true)
  assert.match(store.listComments()[0].body, /maintainer note: looks good/)
  // a hard publish failure (the injected upsert always errors) reports failed, never confirmed
  const brokenUpsert = { listComments: () => [], upsert: () => ({ error: 'gh-down' }) }
  const failed = publishSummary({ view, marker, pr: 7, repo: 'x', findByMarker, ...brokenUpsert })
  assert.equal(failed.published, false)
  assert.equal(failed.publication.state, 'failed')
  assert.equal(failed.publication.lastError, 'gh-down')
})

test('DT-30: updatePublicationState patches ONLY the publication field of a persisted metrics.json — same revision, no fabricated re-derivation, no stray temp files', () => {
  const { dir } = runDir()
  const view = sampleView()
  writeMetrics({ dir, view })
  const before = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'))
  const out = updatePublicationState({ dir, publication: { state: 'confirmed', commentId: 99, url: 'https://x/c/99' } })
  assert.equal(out.written, true)
  const after = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'))
  assert.equal(after.snapshot.revision, before.snapshot.revision, 'a confirmation-only update is not a new semantic revision')
  assert.deepEqual({ state: after.publication.state, commentId: after.publication.commentId }, { state: 'confirmed', commentId: 99 })
  assert.deepEqual(readdirSync(dir).filter(f => f.startsWith('.tmp-')), [])
  assert.equal(updatePublicationState({ dir: join(dir, 'missing'), publication: {} }).written, false)
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

// ── US-479 B2 (S9/S10, AC-27/22): the lifetime of a PR spans the runs it actually had ──────────
test('B2: a bound predecessor run with persisted metrics is FOLDED into the lifetime totals — a new run directory is not a clean new PR', () => {
  const root = mkdtempSync(join(tmpdir(), 'lifetime-'))
  const legacy = join(root, '.pair', 'working', 'runs', 'v4', '42')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'metrics.json'), JSON.stringify({ schemaVersion: 1, identity: { canonicalRunId: 'v4' }, cycles: { attempted: 2, completed: 1 }, usage: { observedTotalTokens: 1200, inputTokens: 200, outputTokens: 1000, cacheReadTokens: 50, cacheWriteTokens: 25 } }))
  const dir = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'm0-review-phase.json'),
    JSON.stringify({ run: 'v5', story: '42', pr: 7, branch: 'b', phase: 'm0', skill: 'review-phase', inputHead: 'a'.repeat(40), recordType: 'migration', migrationKey: `sha256:${'1'.repeat(64)}`, predecessorRuns: [{ runId: 'v4', dir: legacy, metricsPath: join(legacy, 'metrics.json'), handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] }], schemaVersion: 3, workflowVersion: '4.0.0', seq: 1 }),
  )
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v5', observations: [] })
  assert.deepEqual(view.identity.predecessorRuns, ['v4'])
  assert.deepEqual(view.identity.runIds, ['v5', 'v4'])
  // AMENDED by US-479 F6 residual: coverage is per dimension, so a predecessor that recorded no
  // timing leaves that dimension unknown and the lifetime partial — `unknownDimensions` names it.
  assert.equal(view.lifetime.coverage, 'partial')
  assert.equal(view.lifetime.usage.coverage, 'complete')
  assert.equal(view.lifetime.time.coverage, 'unknown')
  assert.deepEqual(view.lifetime.foldedRuns, ['v4'])
  assert.deepEqual(view.lifetime.missingRuns, [])
  assert.equal(view.lifetime.cycles.completed, 1, 'the completed cycle already measured is not lost')
  assert.equal(view.lifetime.cycles.attempted, 2)
  assert.equal(view.lifetime.usage.outputTokens, 1000)
  assert.equal(view.lifetime.usage.observedTotalTokens, 1200)
  // the CURRENT cycle's own numbers are untouched — the lifetime is additional, never a rewrite
  assert.equal(view.cycles.completed, 0)
  assert.equal(view.usage.observedTotalTokens, null)
  const md = renderMarkdown(view)
  assert.match(md, /Lifetime \(incl\. 1 predecessor run: v4\) — cycles 1 completed \/ 2 attempted · tokens 1200 · agent unknownms · coverage partial \(unknown: agentMs, activeWallMs; tokens \*\*complete\*\*, timing \*\*unknown\*\*\)/)
})

test('B2: a bound predecessor whose metrics were never persisted leaves the lifetime EXPLICITLY partial — never a silently smaller total', () => {
  const root = mkdtempSync(join(tmpdir(), 'lifetime-'))
  const dir = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'm0-review-phase.json'),
    JSON.stringify({ run: 'v5', story: '42', pr: 7, branch: 'b', phase: 'm0', skill: 'review-phase', inputHead: 'a'.repeat(40), recordType: 'migration', migrationKey: `sha256:${'1'.repeat(64)}`, predecessorRuns: [{ runId: 'v3', dir: join(root, 'gone'), metricsPath: null, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] }], schemaVersion: 3, workflowVersion: '4.0.0', seq: 1 }),
  )
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v5', observations: [] })
  assert.equal(view.lifetime.coverage, 'partial')
  assert.deepEqual(view.lifetime.missingRuns, ['v3'])
  assert.ok(view.snapshot.missingSources.includes('legacy-lifetime'))
  assert.equal(view.snapshot.completeness, 'partial')
  assert.match(renderMarkdown(view), /partial/i)
})

test('B2: the PR summary states the lifetime across every bound run — the reader never sees only the current run directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'lifetime-'))
  const legacy = join(root, '.pair', 'working', 'runs', 'v4', '42')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'metrics.json'), JSON.stringify({ schemaVersion: 1, cycles: { attempted: 2, completed: 1 }, usage: { observedTotalTokens: 1200, inputTokens: 200, outputTokens: 1000 } }))
  const dir = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'm0-review-phase.json'),
    JSON.stringify({ run: 'v5', story: '42', pr: 7, branch: 'b', phase: 'm0', skill: 'review-phase', inputHead: 'a'.repeat(40), recordType: 'migration', migrationKey: `sha256:${'1'.repeat(64)}`, predecessorRuns: [{ runId: 'v4', dir: legacy, metricsPath: join(legacy, 'metrics.json'), handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] }], schemaVersion: 3, workflowVersion: '4.0.0', seq: 1 }),
  )
  const body = renderPrSummary(reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v5', observations: [] }))
  assert.match(body, /Lifetime across 2 run\(s\) \(v5, v4\)/)
  assert.match(body, /cycles 1 completed \/ 2 attempted · tokens 1200 · agent unknownms · coverage \*\*partial\*\* \(unknown: cacheReadTokens, cacheWriteTokens, agentMs, activeWallMs; tokens \*\*unknown\*\*, timing \*\*unknown\*\*\)/)
})

// ── US-479 F5/F6 (independent audit of 64e5ddd1) ─────────────────────────────────────────────
const SHA40 = c => c.repeat(40)
const migrationRecord = (dir, phase, runs) =>
  writeFileSync(
    join(dir, `${phase}-review-phase.json`),
    JSON.stringify({ run: 'v9', story: '42', pr: 7, branch: 'b', phase, skill: 'review-phase', inputHead: SHA40('a'), recordType: 'migration', migrationKey: `sha256:${'1'.repeat(64)}`, predecessorRuns: runs, schemaVersion: 3, workflowVersion: '4.0.0', seq: Number(phase.slice(1)) + 1 }),
  )
const reviewRecord = (dir, phase, extra, seq) =>
  writeFileSync(
    join(dir, `${phase}-review-phase.json`),
    JSON.stringify({ run: 'v9', story: '42', pr: 7, branch: 'b', phase, skill: 'review-phase', inputHead: SHA40('a'), reviewedHead: SHA40('c'), verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 'first', schemaVersion: 3, workflowVersion: '4.0.0', seq, ...extra }),
  )
const legacyMetrics = (root, runId, metrics) => {
  const d = join(root, '.pair', 'working', 'runs', runId, '42')
  mkdirSync(d, { recursive: true })
  if (metrics !== undefined) writeFileSync(join(d, 'metrics.json'), typeof metrics === 'string' ? metrics : JSON.stringify(metrics))
  return { dir: d, runId, metricsPath: join(d, 'metrics.json') }
}
const V1 = { schemaVersion: 1, identity: { storyId: '42', prNumber: 7, canonicalRunId: 'v3' }, snapshot: { completeness: 'complete', missingSources: [] }, cycles: { attempted: 2, completed: 1 }, usage: { observedTotalTokens: 100, inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, time: { agentMs: 5000, activeWallMs: 5000 } }
const V2 = { schemaVersion: 1, identity: { storyId: '42', prNumber: 7, canonicalRunId: 'v4' }, snapshot: { completeness: 'complete', missingSources: [] }, cycles: { attempted: 1, completed: 1 }, usage: { observedTotalTokens: 200, inputTokens: 200, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, time: { agentMs: 7000, activeWallMs: 7000 } }

test('F5: a migration record is not a review in the REDUCER either — migration alone is not-evaluated, and a blocking review followed by a migration is still not-converged', () => {
  const { root, dir } = runDir()
  const pred = legacyMetrics(root, 'v3', V1)
  migrationRecord(dir, 'm0', [{ runId: 'v3', dir: pred.dir, metricsPath: pred.metricsPath, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] }])
  const only = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.equal(only.outcome.quality, 'not-evaluated')
  assert.equal(only.outcome.reviewedHead, null)
  assert.equal(only.outcome.qualityConvergedHead, null)
  assert.notEqual(only.outcome.cohortState, 'completed')
  assert.equal(only.execution.reviewExecutions, 0)
  // a real review with a blocking finding, THEN a migration record: the verdict still stands
  reviewRecord(dir, 'r0', { findings: [{ id: 'r0-1', severity: 'Major', location: 'x', description: 'd', recommendation: 'r', blocking: true, transition: 'open', kind: 'defect' }] }, 2)
  migrationRecord(dir, 'm1', [{ runId: 'v3', dir: pred.dir, metricsPath: pred.metricsPath, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] }])
  const after = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.equal(after.outcome.quality, 'not-converged')
  assert.equal(after.outcome.reviewedHead, SHA40('c'))
  assert.equal(after.execution.reviewExecutions, 1)
})

test('F6: overlapping and transitive acknowledgments fold each predecessor EXACTLY once — by verified identity, not by iterating references', () => {
  const { root, dir } = runDir()
  const v3 = legacyMetrics(root, 'v3', V1)
  const v4 = legacyMetrics(root, 'v4', V2)
  const ref = p => ({ runId: p.runId, dir: p.dir, metricsPath: p.metricsPath, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] })
  migrationRecord(dir, 'm0', [ref(v3)])
  migrationRecord(dir, 'm1', [ref(v3), ref(v4)])
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.deepEqual(view.lifetime.foldedRuns, ['v3', 'v4'])
  assert.deepEqual(view.identity.predecessorRuns, ['v3', 'v4'])
  assert.equal(view.lifetime.usage.observedTotalTokens, 300)
  assert.equal(view.lifetime.cycles.completed, 2)
  assert.equal(view.lifetime.cycles.attempted, 3)
  assert.equal(view.lifetime.time.agentMs, 12_000, 'demonstrated predecessor time folds too')
})

test('F6: a predecessor that was itself PARTIAL makes the lifetime partial, and a dimension it never knew stays unknown instead of becoming zero', () => {
  const { root, dir } = runDir()
  const partial = legacyMetrics(root, 'v3', { ...V1, snapshot: { completeness: 'partial', missingSources: ['usage'] }, usage: { observedTotalTokens: 100, inputTokens: 100, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null }, time: {} })
  const complete = legacyMetrics(root, 'v4', V2)
  const ref = p => ({ runId: p.runId, dir: p.dir, metricsPath: p.metricsPath, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] })
  migrationRecord(dir, 'm0', [ref(partial), ref(complete)])
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.equal(view.lifetime.coverage, 'partial')
  assert.deepEqual(view.lifetime.partialRuns, ['v3'])
  // v4 knows a zero and v3 knows nothing: the SUM is unknown, never v4's zero presented as the total
  assert.equal(view.lifetime.usage.outputTokens, null)
  assert.equal(view.lifetime.usage.cacheReadTokens, null)
  assert.ok(view.lifetime.unknownDimensions.includes('outputTokens'), JSON.stringify(view.lifetime.unknownDimensions))
  assert.equal(view.lifetime.usage.observedTotalTokens, 300, 'the dimension both sources DO know still adds up')
  assert.equal(view.lifetime.time.agentMs, null, 'an unknown predecessor time is not zero')
  assert.ok(view.snapshot.missingSources.includes('legacy-lifetime'))
  assert.equal(view.snapshot.completeness, 'partial')
})

test('F6: an imported metrics file that is unreadable, of another schema, or about another PR is refused as evidence — it never counts and never claims to', () => {
  const { root, dir } = runDir()
  const broken = legacyMetrics(root, 'v1', '{ not json')
  const wrongSchema = legacyMetrics(root, 'v2', { ...V1, schemaVersion: 99 })
  const wrongPr = legacyMetrics(root, 'v3', { ...V1, identity: { storyId: '42', prNumber: 999 } })
  const absent = legacyMetrics(root, 'v4', undefined)
  const ref = p => ({ runId: p.runId, dir: p.dir, metricsPath: p.metricsPath, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] })
  migrationRecord(dir, 'm0', [ref(broken), ref(wrongSchema), ref(wrongPr), ref(absent)])
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.deepEqual(view.lifetime.foldedRuns, [])
  assert.deepEqual(view.lifetime.invalidRuns, ['v1', 'v2', 'v3'])
  assert.deepEqual(view.lifetime.missingRuns, ['v4'])
  assert.equal(view.lifetime.coverage, 'partial')
  assert.equal(view.lifetime.usage.observedTotalTokens, null, 'nothing was imported, so nothing is claimed')
})

test('F6: the cohort is computed on the PR`s whole known history — moving to a new run directory cannot improve its cycles or its cost per delivery', () => {
  const { root, dir } = runDir()
  const v3 = legacyMetrics(root, 'v3', { ...V1, cycles: { attempted: 3, completed: 2 } })
  migrationRecord(dir, 'm0', [{ runId: 'v3', dir: v3.dir, metricsPath: v3.metricsPath, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] }])
  reviewRecord(dir, 'r0', { verdict: 'APPROVED', findings: [], readiness: { ready: true, remoteHead: SHA40('c') } }, 2)
  const resumed = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.equal(resumed.outcome.cohortState, 'completed')
  assert.equal(resumed.cycles.completed, 0, 'the CURRENT run directory did one review and no remediation')
  assert.equal(resumed.lifetime.cycles.completed, 2)
  const cohort = aggregateCohort([resumed])
  assert.equal(cohort.meanCompletedCycles, 2, 'the cohort reads the whole history, not the fresh directory')
  // AMENDED by US-479 F6 residual: this run dispatched a review and reported no telemetry at all.
  // That is an UNKNOWN cost, not a zero, so the lifetime total is unavailable and the coverage says
  // so — the cycle history, which is what this test pins, is unaffected.
  assert.equal(resumed.lifetime.usage.observedTotalTokens, null)
  assert.equal(resumed.lifetime.usage.totalBasis, 'lower-bound')
  assert.equal(cohort.allWorkTokens, null)
  assert.equal(cohort.costPerCompletedDelivery, null)
  assert.equal(cohort.lifetimeCoverage, 'partial')
})

test('F6: a cohort entry whose lifetime is partial is labelled, and an unknown total never becomes a zero denominator', () => {
  const { root, dir } = runDir()
  const unknown = legacyMetrics(root, 'v3', { ...V1, snapshot: { completeness: 'partial', missingSources: ['usage'] }, usage: { observedTotalTokens: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null } })
  migrationRecord(dir, 'm0', [{ runId: 'v3', dir: unknown.dir, metricsPath: unknown.metricsPath, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] }])
  reviewRecord(dir, 'r0', { verdict: 'APPROVED', findings: [], readiness: { ready: true, remoteHead: SHA40('c') } }, 2)
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  const cohort = aggregateCohort([view])
  assert.equal(view.lifetime.usage.observedTotalTokens, null)
  assert.equal(cohort.allWorkTokens, null, 'unknown is not zero')
  assert.equal(cohort.costPerCompletedDelivery, null)
  assert.equal(cohort.lifetimeCoverage, 'partial')
})

// ── US-479 F6 residual: the CURRENT run is a contributor like any other ───────────────────────
const obsOf = (executionId, usage) => [
  { eventId: `${executionId}:s`, executionId, runId: 'v9', storyId: '42', phase: 'r0', attempt: 1, kind: 'step-started', sourceRef: 'journal', observedAt: 1000, timeSource: 'record' },
  { eventId: `${executionId}:f`, executionId, runId: 'v9', storyId: '42', phase: 'r0', attempt: 1, kind: 'step-finished', sourceRef: 'journal', observedAt: 2000, timeSource: 'record' },
  ...(usage ? [{ eventId: `${executionId}:u`, executionId, runId: 'v9', storyId: '42', phase: 'r0', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', observedAt: 1500, usage }] : []),
]
const KNOWN_100 = { totalTokens: 100, inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
const predRef = p => ({ runId: p.runId, dir: p.dir, metricsPath: p.metricsPath, handoffs: [{ name: 'r0-review-phase.json', sha256: `sha256:${'2'.repeat(64)}` }] })

function lifetimeCase({ currentPartial, predecessor }) {
  const { root, dir } = runDir()
  const refs = []
  if (predecessor === 'complete') refs.push(predRef(legacyMetrics(root, 'v3', { ...V1, usage: { observedTotalTokens: 200, inputTokens: 200, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } })))
  if (predecessor === 'partial') refs.push(predRef(legacyMetrics(root, 'v3', { ...V1, snapshot: { completeness: 'partial', missingSources: ['usage'] }, usage: { observedTotalTokens: 200, inputTokens: 200, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null } })))
  if (predecessor === 'missing') refs.push(predRef(legacyMetrics(root, 'v3', undefined)))
  migrationRecord(dir, 'm0', refs)
  reviewRecord(dir, 'r0', { verdict: 'APPROVED', findings: [], readiness: { ready: true, remoteHead: SHA40('c') } }, 2)
  // two executions; usage for one of them only when the current run is partial
  const observations = [...obsOf('a', KNOWN_100), ...obsOf('b', currentPartial ? null : KNOWN_100)]
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations })
  return { view, cohort: aggregateCohort([view]) }
}

test('F6 residual: an execution of the CURRENT run whose usage never arrived makes the lifetime and the cohort partial — the known quantity is a lower bound, not a total', () => {
  const { view, cohort } = lifetimeCase({ currentPartial: true, predecessor: 'complete' })
  assert.deepEqual(view.usage.coverage, { known: 1, total: 2 })
  assert.equal(view.snapshot.completeness, 'partial')
  assert.equal(view.lifetime.usage.observedTotalTokens, 300, 'what is known is kept')
  assert.equal(view.lifetime.usage.totalBasis, 'lower-bound', 'and is not presented as complete')
  assert.equal(view.lifetime.coverage, 'partial')
  assert.ok(view.lifetime.partialRuns.includes('v9'), JSON.stringify(view.lifetime.partialRuns))
  assert.equal(cohort.lifetimeCoverage, 'partial')
  assert.equal(cohort.allWorkTokens, 300)
  assert.equal(cohort.costPerCompletedDelivery.lowerBound, true)
  assert.match(renderPrSummary(view), /coverage \*\*partial\*\*/)
})

test('F6 residual: the full matrix — current {complete, partial} x predecessor {complete, partial, missing}', () => {
  // `cost: null` where the total itself is unknown: there is no cost per delivery to qualify.
  const expected = [
    [false, 'complete', { total: 400, basis: 'complete', coverage: 'complete', cost: { value: 400, lowerBound: false } }],
    [false, 'partial', { total: 400, basis: 'lower-bound', coverage: 'partial', cost: { value: 400, lowerBound: true } }],
    [false, 'missing', { total: null, basis: 'lower-bound', coverage: 'partial', cost: null }],
    [true, 'complete', { total: 300, basis: 'lower-bound', coverage: 'partial', cost: { value: 300, lowerBound: true } }],
    [true, 'partial', { total: 300, basis: 'lower-bound', coverage: 'partial', cost: { value: 300, lowerBound: true } }],
    [true, 'missing', { total: null, basis: 'lower-bound', coverage: 'partial', cost: null }],
  ]
  for (const [currentPartial, predecessor, want] of expected) {
    const label = `current ${currentPartial ? 'partial' : 'complete'} x predecessor ${predecessor}`
    const { view, cohort } = lifetimeCase({ currentPartial, predecessor })
    assert.equal(view.lifetime.usage.observedTotalTokens, want.total, label)
    assert.equal(view.lifetime.usage.totalBasis, want.basis, label)
    assert.equal(view.lifetime.coverage, want.coverage, label)
    assert.equal(cohort.lifetimeCoverage, want.coverage, label)
    assert.deepEqual(cohort.costPerCompletedDelivery, want.cost, label)
  }
})

test('F6 residual: a run directory with only a migration record contributes a CERTAIN zero, while a run that dispatched work and reported no usage contributes an UNKNOWN', () => {
  const { root, dir } = runDir()
  const pred = predRef(legacyMetrics(root, 'v3', { ...V1, usage: { observedTotalTokens: 200, inputTokens: 200, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }))
  migrationRecord(dir, 'm0', [pred])
  const onlyMigration = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.equal(onlyMigration.lifetime.usage.observedTotalTokens, 200, 'nothing was dispatched here: a certain zero adds nothing')
  assert.equal(onlyMigration.lifetime.usage.totalBasis, 'complete')
  // the same directory, once a real review handoff proves an execution happened with no telemetry
  reviewRecord(dir, 'r0', { verdict: 'APPROVED', findings: [], readiness: { ready: true, remoteHead: SHA40('c') } }, 2)
  const dispatched = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.equal(dispatched.lifetime.usage.observedTotalTokens, null, 'work happened and its cost is unknown — not zero')
  assert.equal(dispatched.lifetime.usage.totalBasis, 'lower-bound')
  assert.equal(dispatched.lifetime.coverage, 'partial')
})

// ── US-479 F6 residual (verification of dbf6d472): lifetime coverage is PER DIMENSION ─────────
const tRec = (executionId, kind, at) => ({ eventId: `${executionId}:${kind}`, executionId, runId: 'v9', storyId: '42', phase: 'r0', attempt: 1, kind, sourceRef: 'journal', observedAt: at, timeSource: 'record' })
const uRec = (executionId, usage) => ({ eventId: `${executionId}:u`, executionId, runId: 'v9', storyId: '42', phase: 'r0', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', observedAt: 1500, usage })
const U100 = { totalTokens: 100, inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
const PRED_FULL = { ...V1, snapshot: { completeness: 'complete', missingSources: [] }, usage: { observedTotalTokens: 200, inputTokens: 200, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, time: { agentMs: 1000, activeWallMs: 1000, incomplete: false } }
const PRED_PARTIAL = { ...PRED_FULL, snapshot: { completeness: 'partial', missingSources: ['usage'] }, usage: { ...PRED_FULL.usage, totalBasis: 'lower-bound' } }

// current usage: both executions report; current timing: A closed, B never finished.
function dimCase({ usage: usageMode, timing: timingMode, predecessor }) {
  const { root, dir } = runDir()
  const refs = []
  if (predecessor === 'complete') refs.push(predRef(legacyMetrics(root, 'v3', PRED_FULL)))
  if (predecessor === 'partial') refs.push(predRef(legacyMetrics(root, 'v3', PRED_PARTIAL)))
  if (predecessor === 'missing') refs.push(predRef(legacyMetrics(root, 'v3', undefined)))
  migrationRecord(dir, 'm0', refs)
  reviewRecord(dir, 'r0', { verdict: 'APPROVED', findings: [], readiness: { ready: true, remoteHead: SHA40('c') } }, 2)
  const observations = [
    tRec('a', 'step-started', 1000),
    tRec('a', 'step-finished', 2000),
    uRec('a', U100),
    tRec('b', 'step-started', 1000),
    ...(timingMode === 'complete' ? [tRec('b', 'step-finished', 2000)] : []),
    ...(usageMode === 'complete' ? [uRec('b', U100)] : []),
  ]
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations })
  return { view, cohort: aggregateCohort([view]) }
}

test('F6 residual: usage complete and timing partial in the SAME run — the token total stays complete and usable, the duration is a lower bound, and each dimension keeps its own identity', () => {
  const { view, cohort } = dimCase({ usage: 'complete', timing: 'partial', predecessor: 'complete' })
  assert.equal(view.usage.coverage.known, 2)
  assert.equal(view.time.incomplete, true)
  assert.deepEqual(view.snapshot.missingSources, ['legacy-lifetime', 'timing'])
  // the two dimensions are reported apart
  assert.equal(view.lifetime.usage.coverage, 'complete')
  assert.equal(view.lifetime.usage.totalBasis, 'complete')
  assert.equal(view.lifetime.usage.observedTotalTokens, 400)
  assert.equal(view.lifetime.time.coverage, 'partial')
  assert.equal(view.lifetime.time.totalBasis, 'lower-bound')
  assert.equal(view.lifetime.time.agentMs, 2000, 'the known durations are kept, as a lower bound')
  assert.deepEqual(view.lifetime.partialRunsByDimension, { usage: [], timing: ['v9'] })
  assert.deepEqual(view.lifetime.partialRuns, ['v9'])
  assert.equal(view.lifetime.coverage, 'partial')
  // the cohort propagates the incompleteness but the token cost stays usable
  assert.equal(cohort.lifetimeCoverage, 'partial')
  assert.deepEqual(cohort.lifetimeCoverageByDimension, { usage: 'complete', timing: 'partial' })
  assert.equal(cohort.allWorkTokens, 400)
  assert.deepEqual(cohort.costPerCompletedDelivery, { value: 400, lowerBound: false })
  // and both renderings say which basis each number has
  assert.match(renderMarkdown(view), /agent 2000ms \(lower bound\)/)
  assert.match(renderPrSummary(view), /timing \*\*partial\*\*/)
})

test('F6 residual: the full matrix — usage {complete, partial} x timing {complete, partial} x predecessor {complete, partial, missing}', () => {
  const cases = [
    ['complete', 'complete', 'complete', { u: 'complete', t: 'complete', tokens: 400, ms: 3000, cost: { value: 400, lowerBound: false } }],
    ['complete', 'complete', 'partial', { u: 'partial', t: 'complete', tokens: 400, ms: 3000, cost: { value: 400, lowerBound: true } }],
    ['complete', 'complete', 'missing', { u: 'unknown', t: 'unknown', tokens: null, ms: null, cost: null }],
    ['complete', 'partial', 'complete', { u: 'complete', t: 'partial', tokens: 400, ms: 2000, cost: { value: 400, lowerBound: false } }],
    ['complete', 'partial', 'partial', { u: 'partial', t: 'partial', tokens: 400, ms: 2000, cost: { value: 400, lowerBound: true } }],
    ['complete', 'partial', 'missing', { u: 'unknown', t: 'unknown', tokens: null, ms: null, cost: null }],
    ['partial', 'complete', 'complete', { u: 'partial', t: 'complete', tokens: 300, ms: 3000, cost: { value: 300, lowerBound: true } }],
    ['partial', 'complete', 'partial', { u: 'partial', t: 'complete', tokens: 300, ms: 3000, cost: { value: 300, lowerBound: true } }],
    ['partial', 'complete', 'missing', { u: 'unknown', t: 'unknown', tokens: null, ms: null, cost: null }],
    ['partial', 'partial', 'complete', { u: 'partial', t: 'partial', tokens: 300, ms: 2000, cost: { value: 300, lowerBound: true } }],
    ['partial', 'partial', 'partial', { u: 'partial', t: 'partial', tokens: 300, ms: 2000, cost: { value: 300, lowerBound: true } }],
    ['partial', 'partial', 'missing', { u: 'unknown', t: 'unknown', tokens: null, ms: null, cost: null }],
  ]
  for (const [usage, timing, predecessor, want] of cases) {
    const label = `usage ${usage} x timing ${timing} x predecessor ${predecessor}`
    const { view, cohort } = dimCase({ usage, timing, predecessor })
    assert.equal(view.lifetime.usage.coverage, want.u, `${label} usage coverage`)
    assert.equal(view.lifetime.time.coverage, want.t, `${label} timing coverage`)
    assert.equal(view.lifetime.usage.observedTotalTokens, want.tokens, `${label} tokens`)
    assert.equal(view.lifetime.time.agentMs, want.ms, `${label} agentMs`)
    assert.deepEqual(cohort.costPerCompletedDelivery, want.cost, `${label} cost`)
    assert.deepEqual(cohort.lifetimeCoverageByDimension, { usage: want.u, timing: want.t }, label)
  }
})

test('F6 residual: a run with only migration records contributes a certain zero in BOTH dimensions; an execution handoff with no usage and no boundaries makes both unknown', () => {
  const { root, dir } = runDir()
  migrationRecord(dir, 'm0', [predRef(legacyMetrics(root, 'v3', PRED_FULL))])
  const only = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.deepEqual({ u: only.lifetime.usage.coverage, t: only.lifetime.time.coverage }, { u: 'complete', t: 'complete' })
  assert.equal(only.lifetime.usage.observedTotalTokens, 200)
  assert.equal(only.lifetime.time.agentMs, 1000)
  reviewRecord(dir, 'r0', { verdict: 'APPROVED', findings: [], readiness: { ready: true, remoteHead: SHA40('c') } }, 2)
  const dispatched = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.deepEqual({ u: dispatched.lifetime.usage.coverage, t: dispatched.lifetime.time.coverage }, { u: 'unknown', t: 'unknown' })
  assert.equal(dispatched.lifetime.usage.observedTotalTokens, null)
  assert.equal(dispatched.lifetime.time.agentMs, null)
  assert.ok(dispatched.lifetime.unknownDimensions.includes('agentMs'), JSON.stringify(dispatched.lifetime.unknownDimensions))
})

test('F6 residual: an execution that reported usage but never a finish leaves the duration a lower bound — never converted to zero', () => {
  const { root, dir } = runDir()
  migrationRecord(dir, 'm0', [predRef(legacyMetrics(root, 'v3', PRED_FULL))])
  reviewRecord(dir, 'r0', { verdict: 'APPROVED', findings: [], readiness: { ready: true, remoteHead: SHA40('c') } }, 2)
  const view = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [tRec('a', 'step-started', 1000), uRec('a', U100)] })
  // the ONLY execution of this run has no closed boundary, so this run knows no duration at all:
  // the lifetime duration is UNKNOWN, and the predecessor's 1000ms is never passed off as the total
  assert.equal(view.lifetime.time.coverage, 'unknown')
  assert.equal(view.lifetime.time.agentMs, null, 'the predecessor`s known duration is not the total')
  assert.ok(view.lifetime.unknownDimensions.includes('agentMs'))
  assert.equal(view.lifetime.usage.coverage, 'complete')
  assert.equal(view.lifetime.usage.observedTotalTokens, 300)
})

// ── US-479 T-29 / S11: the four regression counters, separated active vs historical ───────────
const T29_GUARD = { reproducerRef: 'pnpm exec vitest run -t AC-7', closureAssertions: [{ id: 'ca-1', command: 'pnpm exec vitest run -t AC-7', expected: 'pass' }], affectedBoundaryRefs: ['installer:copy'] }
const t29Risk = (extra = {}) => ({ riskId: 'risk:aaaaaaaaaaaaaaaa', introducedByRemediationBatchId: 'r1', lastCleanReviewedHead: SHA40('0'), firstFailingHead: SHA40('1'), ...T29_GUARD, state: 'active', ...extra })
const t29Finding = (id, rr) => ({ id, severity: 'Major', location: 'x', description: 'd', recommendation: 'r', blocking: rr.state === 'active', transition: rr.state === 'active' ? 'open' : 'resolved', kind: 'defect', origin: 'introduced-by-remediation', obligationIds: ['AC-7'], regressionRisk: rr })

test('T-29 (DT-38): the four S11 counters reach the metrics view and the PR summary, with the active matrix separated from the historical one', () => {
  const { dir } = runDir()
  // the batch must be one the HISTORY can resolve: an invalidation of a batch that never existed
  // counts nothing (US-479 F-RR-06)
  writeFileSync(
    join(dir, 'r1-g1-green-fix.json'),
    JSON.stringify({ run: 'v9', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'green-fix', inputHead: SHA40('a'), fixed: true, needsHumanDecision: false, outputHead: SHA40('1'), evidenceLedger: [], remediationBatchId: 'r1', schemaVersion: 3, workflowVersion: '4.0.0', seq: 0 }),
  )
  writeFileSync(
    join(dir, 'r1-review-phase.json'),
    JSON.stringify({ run: 'v9', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA40('a'), reviewedHead: SHA40('1'), verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', invalidatedBatchId: 'r1', findings: [t29Finding('r1-9', t29Risk())], schemaVersion: 3, workflowVersion: '4.0.0', seq: 1 }),
  )
  const active = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.equal(active.execution.invalidatedRemediations, 1)
  assert.equal(active.execution.activeRegressionRisks, 1)
  assert.equal(active.execution.dischargedRegressionRisks, 0)
  assert.equal(active.execution.regressionRepairs, 0)
  assert.deepEqual(active.regressions.active.map(r => r.riskId), ['risk:aaaaaaaaaaaaaaaa'])
  assert.deepEqual(active.regressions.historical, [])
  assert.match(renderMarkdown(active), /Regression risks: 1 active, 0 discharged \(1 invalidated remediation\(s\), 0 repair\(s\)\)/)
  assert.match(renderPrSummary(active), /active regression risks \*\*1\*\*/)
  // discharged by a later exact-head review: it leaves the active view and stays in history
  writeFileSync(
    join(dir, 'r2-review-phase.json'),
    JSON.stringify({ run: 'v9', story: '42', pr: 7, branch: 'b', phase: 'r2', skill: 'review-phase', inputHead: SHA40('a'), reviewedHead: SHA40('2'), verdict: 'APPROVED', custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA40('2') }, mode: 're-review', findings: [t29Finding('r1-9', t29Risk({ state: 'discharged', dischargedHead: SHA40('2'), dischargedByReviewId: 'r2-review-phase' }))], schemaVersion: 3, workflowVersion: '4.0.0', seq: 2 }),
  )
  const done = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'b', pr: 7, runId: 'v9', observations: [] })
  assert.equal(done.execution.activeRegressionRisks, 0)
  assert.equal(done.execution.dischargedRegressionRisks, 1)
  assert.equal(done.execution.invalidatedRemediations, 1, 'the invalidation is not erased by the repair')
  assert.deepEqual(done.regressions.active, [])
  assert.deepEqual(done.regressions.historical.map(r => r.riskId), ['risk:aaaaaaaaaaaaaaaa'])
  assert.match(renderMarkdown(done), /Regression risks: 0 active, 1 discharged/)
})

// ── US-479 T-26 / DT-26: one cohort entry per IDENTITY, not per run directory ──────────────────
// `aggregateCohort` documents that its input is already one record per admitted identity. Nothing
// enforced it: the aggregate CLI passed the manifest straight through, so the same PR measured in
// two run directories — a resume, a scope extension, a fresh directory — counted twice and moved
// every rate. Folding happens HERE, before any rate is computed.
const cohortEntry = (identity, extra = {}) => ({
  identity: { repository: 'foomakers/pair', storyId: '42', prNumber: null, branch: 'feature/x', runIds: ['run-1'], predecessorRuns: [], scopeEpoch: 1, ...identity },
  workflow: { name: 'pair-implement-batch', versions: ['4.0.0'], mixedVersions: false },
  outcome: { cohortState: 'completed' },
  cycles: { completed: 2 },
  usage: { observedTotalTokens: 100 },
  snapshot: { completeness: 'complete' },
  ...extra,
})

test('DT-26: the same PR measured in two run directories folds into ONE entry, scope extension included', () => {
  const a = cohortEntry({ prNumber: 7, runIds: ['run-1'] })
  const b = cohortEntry({ prNumber: 7, runIds: ['run-2'], predecessorRuns: ['run-1'], scopeEpoch: 2 }, { cycles: { completed: 3 } })
  const folded = foldCohortIdentities([a, b])
  assert.equal(folded.length, 1, 'one PR is one delivery, however many directories measured it')
  assert.equal(folded[0].identity.prNumber, 7)
  assert.deepEqual([...folded[0].identity.runIds].sort(), ['run-1', 'run-2'], 'the folded entry knows the whole history')
  // and the rates see one delivery, not two
  assert.equal(aggregateCohort(folded).n, 1)
  assert.equal(aggregateCohort([a, b]).n, 2, 'control: unfolded input is exactly the defect')
})

test('DT-26: a pre-PR identity aliases onto the PR that later appeared, and folds once', () => {
  const beforePr = cohortEntry({ prNumber: null, branch: 'feature/US-42', runIds: ['run-1'] })
  const withPr = cohortEntry({ prNumber: 9, branch: 'feature/US-42', runIds: ['run-2'], predecessorRuns: ['run-1'] })
  const folded = foldCohortIdentities([beforePr, withPr])
  assert.equal(folded.length, 1, 'the same delivery before and after its PR existed is one delivery')
  assert.equal(folded[0].identity.prNumber, 9, 'the PR identity wins once it exists')
})

test('DT-26: genuinely different deliveries are never folded', () => {
  const one = cohortEntry({ prNumber: 7, storyId: '42' })
  const two = cohortEntry({ prNumber: 8, storyId: '43', branch: 'feature/y' })
  const three = cohortEntry({ prNumber: null, storyId: '44', branch: 'feature/z' })
  assert.equal(foldCohortIdentities([one, two, three]).length, 3)
  // another repository with the same PR number is another delivery
  assert.equal(foldCohortIdentities([one, cohortEntry({ prNumber: 7, repository: 'other/repo' })]).length, 2)
})

test('DT-26: a mixed-version delivery stays mixed through the fold, and a partial run keeps the cohort partial', () => {
  const v400 = cohortEntry({ prNumber: 7, runIds: ['run-1'] })
  const v311 = cohortEntry({ prNumber: 7, runIds: ['run-2'] }, { workflow: { name: 'pair-implement-batch', versions: ['3.0.11'], mixedVersions: false } })
  const [folded] = foldCohortIdentities([v400, v311])
  assert.equal(folded.workflow.mixedVersions, true, 'two versions measured the same PR: the delivery IS mixed')
  assert.deepEqual([...folded.workflow.versions].sort(), ['3.0.11', '4.0.0'])
  // an archived run that could not be read keeps the folded entry partial
  const partial = cohortEntry({ prNumber: 8, runIds: ['run-3'] }, { snapshot: { completeness: 'partial' } })
  const complete = cohortEntry({ prNumber: 8, runIds: ['run-4'] })
  assert.equal(aggregateCohort(foldCohortIdentities([partial, complete])).lifetimeCoverage, 'partial')
})

test('DT-26: a zero denominator returns null rather than a fabricated rate', () => {
  const cohort = aggregateCohort(foldCohortIdentities([]))
  assert.equal(cohort.n, 0)
  assert.equal(cohort.completedRate, null)
  assert.equal(cohort.settled.completedRate, null)
  assert.equal(cohort.meanCompletedCycles, null)
  assert.equal(cohort.costPerCompletedDelivery, null)
})
