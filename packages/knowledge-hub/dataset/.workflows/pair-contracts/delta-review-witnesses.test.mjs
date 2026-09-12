// Witnesses for three confirmed defects of the delivery-workflow state authority (US-479).
//
// These tests are RED against the current HEAD by construction. Each scenario is derived from what
// the ENGINE actually writes — the handoff sequence `pair-implement-batch.js` dispatches from
// `deriveNext`, published through the same `publish` the phase skills use — never from a shape that
// is merely convenient to assert on. Every fixture below re-reads `resolve().next` before writing
// the next handoff and asserts the dispatch it is about to imitate, so a witness can never stand on
// an ordering the engine never generates.
//
//   F-1  the remediation budget never fires on a loop that stays inside one round
//   F-2  the reconstruction overlap guard cannot see an EARLIER sibling of the same batch
//   F-3  the cohort fold depends on manifest order and can emit an incoherent entry
//
// Controls are marked `(control)` and MUST stay green: they pin the behaviour a fix may not break
// by simply refusing (F-1/F-2) or by discarding evidence (F-3).
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { publish, resolve } from '../../skills/pair-workflow-red-spec/scripts/cycle-state.mjs'
import { reduceCycleMetrics, foldCohortIdentities, aggregateCohort } from '../../skills/pair-workflow-review-phase/scripts/cycle-metrics.mjs'

const V = '3.0.0'
const SHA = c => c.repeat(40)
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
const H0 = SHA('0')
const H1 = SHA('1')
const H2 = SHA('2')

// ── the house fixtures of cycle-state.test.mjs, self-contained here ──────────────────────────
function runDir(run = 'run-1') {
  const root = mkdtempSync(join(tmpdir(), 'witness-'))
  const dir = join(root, '.pair', 'working', 'runs', run, '42')
  mkdirSync(dir, { recursive: true })
  return { root, dir }
}
function handoff(dir, phase, skill, fields, { pr = 7, predecessor, attempt } = {}) {
  const file = join(dir, `tmp-${phase}-${skill}-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr, branch: 'feature/US-42', phase, skill, inputHead: SHA('a'), ...fields }))
  const out = publish({ dir, file, phase, skill, workflowVersion: V, predecessor, attempt })
  assert.equal(out.published, true, JSON.stringify(out))
  return out
}
const redSpec = (dir, phase, extra = {}, opts) =>
  handoff(dir, phase, 'red-spec', { status: 'red', mode: phase === 'a0' ? 'initial' : 'remediation', contractPath: `/abs/${phase}-red-contract.json`, contractHash: `sha256:${'1'.repeat(64)}`, ...extra }, opts)
const redVerify = (dir, phase, extra = {}, opts) =>
  handoff(dir, phase, 'red-verify', { verified: true, findings: [], sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}`, ...extra }, opts)
const review = (dir, phase, extra = {}, opts) =>
  handoff(dir, phase, 'review-phase', { reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') }, mode: 'first', ...extra }, opts)
const finding = (id, extra = {}) => ({ id, severity: 'Major', location: 'src/a.ts:1', description: 'wrong', recommendation: 'fix', blocking: true, transition: 'open', kind: 'defect', ...extra })
const closed = (id, evidence = 'closed') => finding(id, { transition: 'resolved', blocking: false, evidence })

const GUARD = {
  reproducerRef: 'pnpm exec vitest run src/a.test.ts -t AC-7-boundary',
  closureAssertions: [{ id: 'ca-1', command: 'pnpm exec vitest run src/a.test.ts -t AC-7-boundary', expected: 'pass' }],
  affectedBoundaryRefs: ['installer:copyDirectoryWithTransforms', 'gate:checkSkillLocalScripts'],
}
const risk = (extra = {}) => ({ introducedByRemediationBatchId: 'r1', lastCleanReviewedHead: H0, firstFailingHead: H1, ...GUARD, state: 'active', ...extra })
const regressionFinding = (id = 'r1-9', extra = {}) => {
  const rr = extra.regressionRisk ?? risk()
  return finding(id, { origin: 'introduced-by-remediation', obligationIds: ['AC-7'], ...extra, regressionRisk: rr, originEvidence: extra.originEvidence ?? { baselineHead: rr.lastCleanReviewedHead, failingHead: rr.firstFailingHead, reproducer: rr.reproducerRef } })
}
const nextOf = (dir, policy = POLICY) => resolve({ dir, workflowVersion: V, policy, entry: 'pr', pr: 7 }).next
const stateOf = (dir, policy = POLICY) => resolve({ dir, workflowVersion: V, policy, entry: 'pr', pr: 7 })
// A budget high enough to take the budget OUT of the question, for tests about something else.
const NO_BUDGET = { ...POLICY, maxFixRounds: 99 }
// Every fixture writes ONLY what the engine would dispatch next: this is the assertion that keeps
// the witnesses on the real dispatch path (pair-implement-batch.js drives `res.next` verbatim).
function expectDispatch(dir, expected, label, policy = POLICY) {
  const n = nextOf(dir)
  assert.deepEqual(
    { step: n.step, phase: n.phase, ...(expected.attempt !== undefined ? { attempt: n.attempt } : {}) },
    expected,
    `${label}: the engine would not dispatch this — next was ${JSON.stringify({ step: n.step, phase: n.phase, attempt: n.attempt, reason: n.reason, refusal: n.refusal, detail: n.detail })}`,
  )
  return n
}

// H0 reviewed dirty (r0-1 open), remediation batch r1 fixes r0-1 and produces H1.
function cleanThenRemediated(dir) {
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: H0 })
  review(dir, 'r0', { reviewedHead: H0, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')] })
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H1, evidenceLedger: [], remediationBatchId: 'r1' })
}
// The review that proves the regression r1 introduced — the entry point of the rewind.
function provenRisk(dir) {
  cleanThenRemediated(dir)
  expectDispatch(dir, { step: 'verify', phase: 'r1' }, 'the batch is complete, the round is reviewed')
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [closed('r0-1'), regressionFinding()] })
  return JSON.parse(readFileSync(join(dir, 'r1-review-phase.json'), 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk.riskId
}

// ══ F-1 ══════════════════════════════════════════════════════════════════════════════════════
// `cycleCounters().spentCycles` (cycle-state.mjs ~1621) counts distinct ROUND NUMBERS that hold a
// green-fix followed by a non-partial review, and that number is what both budget sites read
// (~1392 for the rewind, ~1502 for the ordinary remediation).
//
// What the engine really produces in a regression rewind (deriveNext, review-phase branch, ~1457):
// the repair is dispatched at the PRODUCING GROUP's own phase — `phase: producers[0]`, e.g.
// `r1-g1`, with `round: phaseParts(phase).round` — so every repair of batch r1 publishes its
// red-spec / red-verify / green-fix at `r1-g1` again (attempt n+1), and its review at
// `r${round + 1}` (~1355, `repaired ? parts.round + 1 : parts.round`). No green-fix ever lands on a
// round other than 1, so `roundsWithFix` stays `{1}` and `spentCycles` stays 1 forever, whatever
// the number of concluded repairs. The engine's `seen` key includes the attempt
// (pair-implement-batch.js ~1661), so nothing stops the loop except MAX_DISPATCHES_PER_STORY.
function rewindRepairCycle(dir, { riskId, attempt, head }) {
  expectDispatch(dir, { step: 'prepare', phase: 'r1-g1', attempt }, `repair ${attempt}: prepare`)
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', regressionGuards: [riskId] }, { attempt })
  expectDispatch(dir, { step: 'validate', phase: 'r1-g1' }, `repair ${attempt}: validate`)
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt })
  expectDispatch(dir, { step: 'green', phase: 'r1-g1', attempt }, `repair ${attempt}: green`)
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: head, evidenceLedger: [], remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt })
  // the repair produced a new head, so the verification is the NEXT review round (r2), attempt n
  expectDispatch(dir, { step: 'verify', phase: 'r2' }, `repair ${attempt}: verify`)
  review(dir, 'r2', { mode: 're-review', reviewedHead: head, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [closed('r0-1'), regressionFinding()] }, { attempt: attempt - 1 })
}

test('F-1 (witness): an un-repairable regression rewound over and over must exhaust maxFixRounds — the repairs all land on round 1, so the budget never fires', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  // four concluded repair cycles on top of the r1 batch that already concluded: five corrective
  // cycles under a budget of three. Whatever a correct counter counts, the budget is long spent.
  // Build repair cycles while the engine still asks for one, up to a ceiling well past the budget.
  // A correct budget stops this loop; the defect let it run to the ceiling.
  const heads = [H2, SHA('3'), SHA('4'), SHA('5')]
  for (let i = 0; i < heads.length; i++) {
    if (nextOf(dir).step !== 'prepare') break
    rewindRepairCycle(dir, { riskId, attempt: i + 2, head: heads[i] })
  }
  const r = stateOf(dir)
  assert.deepEqual(
    { step: r.next.step, reason: r.next.reason, budget: r.next.budget },
    { step: 'blocked', reason: 'escalate', budget: 'maxFixRounds' },
    `after 5 concluded corrective cycles under maxFixRounds=3 the cycle must ask a human; it asked for ${JSON.stringify({ step: r.next.step, phase: r.next.phase, attempt: r.next.attempt })} with counters ${JSON.stringify(r.counters)}`,
  )
})

test('F-1 (control): a rewind still inside the budget keeps repairing — the fix may not escalate on the first failure', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  rewindRepairCycle(dir, { riskId, attempt: 2, head: H2 })
  const r = stateOf(dir)
  assert.equal(r.next.step, 'prepare', `two concluded corrective cycles under maxFixRounds=3 must keep going: ${JSON.stringify({ step: r.next.step, reason: r.next.reason, budget: r.next.budget })}`)
  assert.equal(r.next.phase, 'r1-g1')
  assert.equal(r.next.regressionRepairOf, 'r1')
})

test('F-1 (control): a dispatched repair that has not been reviewed yet has concluded nothing — it is verified, never escalated', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  const n = nextOf(dir)
  assert.deepEqual({ step: n.step, phase: n.phase }, { step: 'verify', phase: 'r2' }, 'an unreviewed fix has concluded no cycle')
})

// The SECOND engine shape of the same defect: the contract-gap revision loop. A review whose only
// blocking finding is a `contract-gap` routes `prepare` to `<groupId>-rev<n+1>` (deriveNext ~1513)
// at the SAME round, its green-fix publishes at that revision phase, and — no regression repair
// being involved — its review goes back to `r${parts.round}` (~1355). Round 1 again, every time.
// Nothing but `spentCycles` bounds this path: `contractRevisions` is a counter, never a budget.
function gapRevisionCycle(dir, { revision, head, reviewAttempt }) {
  const phase = `r1-g1-rev${revision}`
  expectDispatch(dir, { step: 'prepare', phase }, `gap revision ${revision}: prepare`)
  redSpec(dir, phase, { mode: 'revision', groupId: 'r1-g1', remediationBatchId: 'r1' })
  expectDispatch(dir, { step: 'validate', phase }, `gap revision ${revision}: validate`)
  redVerify(dir, phase, { remediationBatchId: 'r1' })
  expectDispatch(dir, { step: 'green', phase }, `gap revision ${revision}: green`)
  handoff(dir, phase, 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: head, evidenceLedger: [], remediationBatchId: 'r1' })
  expectDispatch(dir, { step: 'verify', phase: 'r1' }, `gap revision ${revision}: verify`)
  review(dir, 'r1', { mode: 're-review', reviewedHead: head, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [closed('r0-1'), finding('r1-gap', { kind: 'contract-gap', groupId: 'r1-g1', description: 'the sealed contract still does not cover AC-7' })] }, { attempt: reviewAttempt })
}
function gapLoop(dir) {
  cleanThenRemediated(dir)
  expectDispatch(dir, { step: 'verify', phase: 'r1' }, 'the r1 batch is reviewed')
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [closed('r0-1'), finding('r1-gap', { kind: 'contract-gap', groupId: 'r1-g1', description: 'the sealed contract does not cover AC-7' })] })
}

test('F-1 (witness): a contract-gap that keeps reappearing revises the same group forever — every revision stays on round 1, so maxFixRounds never fires', () => {
  const { dir } = runDir()
  gapLoop(dir)
  const heads = [H2, SHA('3'), SHA('4'), SHA('5')]
  for (let i = 0; i < heads.length; i++) {
    if (nextOf(dir).step !== 'prepare') break
    gapRevisionCycle(dir, { revision: i + 2, head: heads[i], reviewAttempt: i + 2 })
  }
  const r = stateOf(dir)
  assert.deepEqual(
    { step: r.next.step, reason: r.next.reason, budget: r.next.budget },
    { step: 'blocked', reason: 'escalate', budget: 'maxFixRounds' },
    `five concluded corrective cycles under maxFixRounds=3 must stop; it asked for ${JSON.stringify({ step: r.next.step, phase: r.next.phase })} with counters ${JSON.stringify(r.counters)}`,
  )
})

test('F-1 (control): the FIRST contract-gap revision is legitimate — a fix may not refuse the first correction', () => {
  const { dir } = runDir()
  gapLoop(dir)
  const n = nextOf(dir)
  assert.deepEqual({ step: n.step, phase: n.phase, mode: n.mode }, { step: 'prepare', phase: 'r1-g1-rev2', mode: 'revision' }, JSON.stringify(n))
})

// ══ F-2 ══════════════════════════════════════════════════════════════════════════════════════
// The reconstruction overlap guard (cycle-state.mjs ~1433-1446) asks whether other work landed
// AFTER the producing group's own fix (`list.indexOf(x) > producerFix`).
//

// group is left does the round get its ONE review (~1359). The review therefore reads the head the
// LAST group produced, and `regressionTransitionErrors` requires a first observation's
// `firstFailingHead` to be exactly `data.reviewedHead` (~1095) and to be a head the batch produced
// (~1083). So the derived producer (~1399-1410) is the LAST group of the batch — here r1-g2.
// Every EARLIER sibling's fix has a LOWER publication index than the producer's, so the guard never
// sees it — although that sibling's work landed after `lastCleanReviewedHead` (H0) and restoring
// the producer's `src/shared/` would delete it.
function sequentialBatch(dir, { g1Paths, g2Paths, headA = H1, headB = H2 }) {
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: H0 })
  review(dir, 'r0', { reviewedHead: H0, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2', { location: 'src/shared/other.ts:1' })] })
  const plan = {
    groups: [
      { groupId: 'r1-g1', findings: ['r0-1'], owner: 'installer', mode: 'behavioral', allowedPaths: g1Paths },
      { groupId: 'r1-g2', findings: ['r0-2'], owner: 'gate', mode: 'behavioral', allowedPaths: g2Paths },
    ],
    carried: [],
  }
  expectDispatch(dir, { step: 'prepare', phase: 'r1-g1' }, 'the round opens on its first group')
  redSpec(dir, 'r1-g1', { plan, groupId: 'r1-g1', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: headA, evidenceLedger: [], remediationBatchId: 'r1' })
  // the plan order, not an invented dependency: g2 follows g1 inside the SAME batch
  expectDispatch(dir, { step: 'prepare', phase: 'r1-g2' }, 'the second group of the batch follows')
  redSpec(dir, 'r1-g2', { groupId: 'r1-g2', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g2', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g2', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: headB, evidenceLedger: [], remediationBatchId: 'r1' })
  // only now is the round reviewed — on the head the LAST group produced
  expectDispatch(dir, { step: 'verify', phase: 'r1' }, 'the batch is complete; the round is reviewed once')
  const rr = risk({ firstFailingHead: headB })
  review(dir, 'r1', {
    mode: 're-review',
    reviewedHead: headB,
    verdict: 'CHANGES-REQUESTED',
    readiness: { ready: false },
    invalidatedBatchId: 'r1',
    findings: [closed('r0-1'), closed('r0-2'), regressionFinding('r1-9', { regressionRisk: rr })],
  })
  return JSON.parse(readFileSync(join(dir, 'r1-review-phase.json'), 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk.riskId
}

function firstRepairOf(dir, { phase, riskId, head, reviewPhase, reviewedHead, firstFailingHead }) {
  expectDispatch(dir, { step: 'prepare', phase }, 'the rewind targets the group that produced the failing head')
  redSpec(dir, phase, { groupId: phase, remediationBatchId: phase.split('-')[0], regressionRepairOf: phase.split('-')[0], regressionGuards: [riskId] }, { attempt: 2 })
  redVerify(dir, phase, { remediationBatchId: phase.split('-')[0], regressionGuards: [riskId] }, { attempt: 2 })
  handoff(dir, phase, 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: head, evidenceLedger: [], remediationBatchId: phase.split('-')[0], regressionGuards: [riskId] }, { attempt: 2 })
  expectDispatch(dir, { step: 'verify', phase: reviewPhase }, 'the repair produced a head; it is reviewed')
  review(dir, reviewPhase, {
    mode: 're-review',
    reviewedHead: head,
    verdict: 'CHANGES-REQUESTED',
    readiness: { ready: false },
    invalidatedBatchId: phase.split('-')[0],
    findings: [closed('r0-1'), closed('r0-2'), regressionFinding('r1-9', { regressionRisk: risk({ introducedByRemediationBatchId: phase.split('-')[0], lastCleanReviewedHead: reviewedHead, firstFailingHead }) })],
  })
}

// ══ F-3 ══════════════════════════════════════════════════════════════════════════════════════
// `foldCohortIdentities` (cycle-metrics.mjs ~712-780) combines exactly three things across a group
// — `usage.observedTotalTokens`, `cycles.completed`, `snapshot.completeness`. Everything else comes
// from the single `main` entry, whose tie-break (`runsKnown(e) >= runsKnown(best)`) is LAST-WINS, so
// it is decided by the manifest order. Two views with IDENTICAL run sets both satisfy the
// `covering` test and `find` returns whichever came first. And `cycles.completed` is raised to the
// group maximum while `cycles.attempted` stays `main`'s, which can state more completed cycles
// than were ever attempted.
//
// The entries here are what the engine really feeds the fold: `reduceCycleMetrics` outputs over
// real run directories. The aggregate CLI (`cycle-metrics.mjs` ~864-869) reads each manifest row's
// `metricsPath` and passes the parsed views straight into `foldCohortIdentities`, so the input is
// exactly a list of these views in manifest order.
const obs = (executionId, tokens, { start, end }) => [
  { eventId: `${executionId}:s`, executionId, runId: 'run', storyId: '42', phase: 'r0', attempt: 1, kind: 'step-started', sourceRef: 'journal', observedAt: start, timeSource: 'record' },
  { eventId: `${executionId}:f`, executionId, runId: 'run', storyId: '42', phase: 'r0', attempt: 1, kind: 'step-finished', sourceRef: 'journal', observedAt: end, timeSource: 'record' },
  { eventId: `${executionId}:u`, executionId, runId: 'run', storyId: '42', phase: 'r0', attempt: 1, kind: 'usage-observed', sourceRef: 'usage', observedAt: start + 1, usage: { totalTokens: tokens, inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } },
]
const viewOf = (dir, runId, observations) => reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '42', branch: 'feature/US-42', pr: 7, runId, observations, revision: 1, asOf: '2026-09-10T00:00:00.000Z' })

// run-1: the first attempt at PR #7 — one remediation round fixed, then the run was interrupted
// before its review ever ran (attempted 1, completed 0).
function interruptedRun() {
  const { dir } = runDir('run-1')
  cleanThenRemediated(dir)
  return viewOf(dir, 'run-1', obs('a', 1000, { start: 1000, end: 3000 }))
}
// run-2: a FRESH directory on the same PR (no migration acknowledgment binds it to run-1 — the
// "fresh directory" case DT-26 names) which converged after two remediation rounds.
function convergedRun() {
  const { dir } = runDir('run-2')
  cleanThenRemediated(dir)
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [closed('r0-1'), finding('r1-1')] })
  expectDispatch(dir, { step: 'prepare', phase: 'r2-g1' }, 'the second round opens', NO_BUDGET)
  redSpec(dir, 'r2-g1', { plan: { groups: [{ groupId: 'r2-g1', findings: ['r1-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r2-g1', remediationBatchId: 'r2' })
  redVerify(dir, 'r2-g1', { remediationBatchId: 'r2' })
  handoff(dir, 'r2-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r2' })
  expectDispatch(dir, { step: 'verify', phase: 'r2' }, 'the second round is reviewed', NO_BUDGET)
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'APPROVED', readiness: { ready: true, remoteHead: H2 }, findings: [closed('r0-1'), closed('r1-1')] })
  return viewOf(dir, 'run-2', [...obs('b', 2000, { start: 1000, end: 5000 }), ...obs('c', 2000, { start: 5000, end: 9000 })])
}

test('F-3 (witness): the fold of two unlinked views of one PR must not depend on the manifest order — every field, not only the three it combines', () => {
  const a = interruptedRun()
  const b = convergedRun()
  const [ab] = foldCohortIdentities([a, b])
  const [ba] = foldCohortIdentities([b, a])
  const view = e => ({
    cohortState: e.outcome.cohortState,
    quality: e.outcome.quality,
    delivery: e.outcome.delivery,
    attempted: e.cycles.attempted,
    spent: e.cycles.spent,
    completed: e.cycles.completed,
    reviewExecutions: e.execution.reviewExecutions,
    inputTokens: e.usage.inputTokens,
    agentMs: e.time.agentMs,
    lifetimeAttempted: e.lifetime?.cycles?.attempted,
  })
  assert.deepEqual(view(ab), view(ba), 'the same two measurements of one delivery, in two manifest orders, are two different deliveries')
  assert.deepEqual(ab, ba, 'nothing in a folded entry may be decided by input order')
})

test('F-3 (witness): a folded entry can never claim more completed cycles than it attempted', () => {
  const a = interruptedRun()
  const b = convergedRun()
  for (const [order, entries] of [['a,b', [a, b]], ['b,a', [b, a]]]) {
    const [folded] = foldCohortIdentities(entries)
    assert.ok(
      folded.cycles.completed <= folded.cycles.attempted,
      `${order}: ${folded.cycles.completed} completed of ${folded.cycles.attempted} attempted is not a measurement`,
    )
    if (folded.lifetime) assert.ok(folded.lifetime.cycles.completed <= folded.lifetime.cycles.attempted, `${order}: the same incoherence in lifetime.cycles`)
  }
})

test('F-3 (witness): the cohort rates built on the fold are the same whichever order the manifest lists the two views in', () => {
  const a = interruptedRun()
  const b = convergedRun()
  assert.deepEqual(aggregateCohort(foldCohortIdentities([a, b])), aggregateCohort(foldCohortIdentities([b, a])), 'completedRate must not move with the manifest order')
})

test('F-3 (witness): two measurements of the SAME run — a stale revision and the one that saw the late usage tail — must fold to the spend that was actually observed', () => {
  // Both views know exactly run-2, so each "covers" the other and `find` keeps whichever came
  // first. The engine produces this pair whenever a metrics view is reduced again after the usage
  // tail lands (DT-22) and the manifest still names the earlier revision.
  const { dir } = runDir('run-2')
  cleanThenRemediated(dir)
  const stale = viewOf(dir, 'run-2', obs('a', 1000, { start: 1000, end: 3000 }))
  const fresh = viewOf(dir, 'run-2', [...obs('a', 1000, { start: 1000, end: 3000 }), ...obs('b', 400, { start: 3000, end: 4000 })])
  assert.deepEqual([stale.identity.runIds, fresh.identity.runIds], [['run-2'], ['run-2']], 'identical run sets: both satisfy the covering test')
  const [first] = foldCohortIdentities([stale, fresh])
  const [second] = foldCohortIdentities([fresh, stale])
  assert.equal(first.usage.observedTotalTokens, 1400, 'the observed spend may not vanish because the stale row was listed first')
  assert.equal(second.usage.observedTotalTokens, 1400)
  assert.deepEqual(first, second, 'and the fold of two views of one run does not depend on their order')
})

test('F-3 (control): two UNLINKED disjoint views still add their spends, and say the fold saw only part of the history', () => {
  const a = interruptedRun()
  const b = convergedRun()
  const [folded] = foldCohortIdentities([a, b])
  assert.equal(folded.usage.observedTotalTokens, 5000, 'disjoint runs are distinct executions: 1000 + 4000')
  assert.equal(folded.cycles.completed, 2, 'the most completed cycles any view could prove')
  assert.equal(folded.snapshot.completeness, 'partial', 'no view covered the whole delivery')
  assert.deepEqual(folded.identity.runIds, ['run-1', 'run-2'])
  assert.equal(folded.identity.prNumber, 7)
})

test('F-3 (control): a single view, and two genuinely different deliveries, pass through the fold untouched', () => {
  const a = interruptedRun()
  assert.deepEqual(foldCohortIdentities([a]), [a], 'a group of one is returned exactly as it came')
  const other = { ...a, identity: { ...a.identity, prNumber: 9, storyId: '43', branch: 'feature/US-43' } }
  assert.equal(foldCohortIdentities([a, other]).length, 2, 'two PRs are two deliveries')
})

test('F-3 (control): a view that CONTAINS the other is the whole history — its own numbers stand, in either order', () => {
  const linked = e => ({ ...e, identity: { ...e.identity, runIds: ['run-1', 'run-2'], predecessorRuns: ['run-1'] } })
  const a = interruptedRun()
  const whole = linked(convergedRun())
  for (const order of [[a, whole], [whole, a]]) {
    const [folded] = foldCohortIdentities(order)
    assert.equal(folded.usage.observedTotalTokens, whole.usage.observedTotalTokens, 'the linked view already folded its predecessor: adding again would double count')
    assert.equal(folded.snapshot.completeness, whole.snapshot.completeness)
  }
})

// ── DR2-03 / DR2-04 (third delta review): what a "concluded corrective cycle" actually is ───────
// Counting green-fix handoffs was the third wrong key in a row. A contract gap on the INITIAL
// contract revises `a0-rev<n>` and its work is dispatched to implement-phase, not green-fix, so that
// loop was uncounted; and a greenRetries retry on the SAME seal was counted, silently spending a
// budget the story says is separate. The invariant is neither the phase nor the skill: a corrective
// cycle is a NEWLY SEALED contract that produced work and was judged by a non-partial review.
// Two groups of one round share that review and spend one; a retry reuses the seal and spends none.
const budget3 = { ...POLICY, maxFixRounds: 3 }

test('DR2-03 (witness): a contract gap that keeps revising the INITIAL contract must exhaust the budget too', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: H0 })
  review(dir, 'r0', { reviewedHead: H0, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1', { kind: 'contract-gap', groupId: 'a0' })] })
  // each iteration: a NEW sealed a0-rev<n>, implemented, then judged — a concluded corrective cycle
  const heads = [H1, H2, SHA('3'), SHA('4'), SHA('5')]
  for (let i = 0; i < heads.length; i++) {
    const n = resolve({ dir, workflowVersion: V, policy: budget3, entry: 'pr', pr: 7 }).next
    if (n.step !== 'prepare') break
    const phase = n.phase
    redSpec(dir, phase, { mode: 'revision', status: 'red', groupId: 'a0' })
    redVerify(dir, phase)
    handoff(dir, phase, 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: heads[i] })
    review(dir, `r${i + 1}`, { mode: 're-review', reviewedHead: heads[i], verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1', { kind: 'contract-gap', groupId: 'a0' })] })
  }
  const r = resolve({ dir, workflowVersion: V, policy: budget3, entry: 'pr', pr: 7 })
  assert.deepEqual(
    { step: r.next.step, reason: r.next.reason, budget: r.next.budget },
    { step: 'blocked', reason: 'escalate', budget: 'maxFixRounds' },
    `the a0 revision loop must spend the budget like any other; counters ${JSON.stringify(r.counters)}`,
  )
})

test('DR2-04 (witness): a greenRetries retry on the SAME seal spends no maxFixRounds unit', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: H0 })
  review(dir, 'r0', { reviewedHead: H0, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')] })
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H1, evidenceLedger: [], remediationBatchId: 'r1' })
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1', { kind: 'approved-test-failing', groupId: 'r1-g1' })] })
  const afterFirst = resolve({ dir, workflowVersion: V, policy: budget3, entry: 'pr', pr: 7 })
  assert.equal(afterFirst.counters.spentCycles, 1, 'one sealed contract, judged once')
  // the retry the engine now dispatches is on the SAME seal — greenRetries bounds it, not maxFixRounds
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r1' }, { attempt: 2 })
  review(dir, 'r1', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')] }, { attempt: 2 })
  const afterRetry = resolve({ dir, workflowVersion: V, policy: budget3, entry: 'pr', pr: 7 })
  assert.equal(afterRetry.counters.spentCycles, 1, 'the same seal retried is the same corrective cycle — greenRetries owns that bound')
})

test('DR2-03/04 (control): two groups of ONE round still spend exactly one', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: H0 })
  review(dir, 'r0', { reviewedHead: H0, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2')] })
  const plan = { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }, { groupId: 'r1-g2', findings: ['r0-2'], owner: 'b', mode: 'behavioral', allowedPaths: ['src/b.ts'] }], carried: [] }
  for (const [g, head] of [['r1-g1', H1], ['r1-g2', H2]]) {
    redSpec(dir, g, { plan, groupId: g, remediationBatchId: 'r1' })
    redVerify(dir, g, { remediationBatchId: 'r1' })
    handoff(dir, g, 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: head, evidenceLedger: [], remediationBatchId: 'r1' })
  }
  review(dir, 'r1', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2')] })
  const r = resolve({ dir, workflowVersion: V, policy: budget3, entry: 'pr', pr: 7 })
  assert.equal(r.counters.spentCycles, 1, 'two sealed groups, ONE review: one corrective cycle (T-21)')
})
