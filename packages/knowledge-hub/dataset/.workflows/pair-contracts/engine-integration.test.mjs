// US-479 T-27 — end-to-end regression replay: one composed lifecycle through the ACTUAL script
// entrypoints (cycle-state.mjs, cycle-metrics.mjs, cycle-runtime.mjs, pr-comment.mjs), never an
// isolated prompt-regex stand-in. Proves the T-19..T-26 delta coheres as one mechanism: initial
// implementation -> first review (a real defect + a scope proposal) -> remediation round 1 ->
// re-review (converged, scope still pending) -> an authenticated extend-current-card decision ->
// remediation round 2 for the approved delta -> final review -> done, with metrics/publication
// correct at every step. This is the deterministic replay T-27 asks for; the PAID live canary
// (T-8) is a separate, not-yet-executed step this test does not claim to be.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { mkdtempSync as _mk, writeFileSync as _wf, chmodSync as _ch } from 'node:fs'
import { tmpdir as _tmp } from 'node:os'
import { join as _join } from 'node:path'
const FAKE_GH_DIR = _mk(_join(_tmp(), 'fake-gh-int-'))
_wf(
  _join(FAKE_GH_DIR, 'gh'),
  `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
const store = ${JSON.stringify(_join(FAKE_GH_DIR, 'comments.json'))}
if (!fs.existsSync(store)) fs.writeFileSync(store, '[]')
const list = () => JSON.parse(fs.readFileSync(store, 'utf8'))
const save = l => fs.writeFileSync(store, JSON.stringify(l))
const body = () => { const i = args.indexOf('-f'); return args[i + 1].replace(/^body=/, '') }
if (args[0] === 'issue' && args[1] === 'view') { process.stdout.write('card body of #' + args[2]); process.exit(0) }
if (args[0] === 'api' && args.includes('--paginate')) { process.stdout.write(JSON.stringify(list())); process.exit(0) }
if (args[0] === 'api' && args.includes('POST') && args.some(a => /issues\\/\\d+\\/comments$/.test(a))) {
  const l = list(); const c = { id: l.reduce((m, x) => Math.max(m, x.id), 0) + 1, body: body(), html_url: 'https://x/c/' + (l.length + 1) }
  l.push(c); save(l); process.stdout.write(JSON.stringify({ id: c.id, html_url: c.html_url })); process.exit(0)
}
if (args[0] === 'api' && args.includes('PATCH')) {
  const id = Number(args.find(a => /comments\\/\\d+$/.test(a)).split('/').pop())
  const l = list(); const c = l.find(x => x.id === id); c.body = body(); save(l)
  process.stdout.write(JSON.stringify({ id, html_url: c.html_url })); process.exit(0)
}
if (args[0] === 'api' && /issues\\/comments\\/\\d+$/.test(args[1] || '')) {
  const id = Number(args[1].split('/').pop())
  const c = list().find(x => x.id === id)
  if (!c) { process.stderr.write('404'); process.exit(1) }
  process.stdout.write(JSON.stringify({ user: { login: 'rucka', type: 'User' }, issue_url: 'https://api.github.com/repos/foomakers/pair/issues/480', body: c.body }))
  process.exit(0)
}
process.stderr.write('unexpected gh call: ' + args.join(' ')); process.exit(1)
`,
)
_ch(_join(FAKE_GH_DIR, 'gh'), 0o755)
process.env.PAIR_GH_BIN = _join(FAKE_GH_DIR, 'gh')
process.env.PATH = `${FAKE_GH_DIR}:${process.env.PATH}`

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { publish, resolve, applyScopeDecisions, scopeBaselineHashOf } from '../../skills/pair-workflow-red-spec/scripts/cycle-state.mjs'
import { reduceCycleMetrics } from '../../skills/pair-workflow-review-phase/scripts/cycle-metrics.mjs'
import { finalizeMetrics } from '../../skills/pair-workflow-review-phase/scripts/cycle-runtime.mjs'
import { listComments, findByMarker, upsert } from '../../skills/pair-workflow-review-phase/scripts/pr-comment.mjs'

const SHA = c => c.repeat(40)
const V = '4.0.0'
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
const CARD_HASH = n => 'sha256:' + createHash('sha256').update('card body of #' + n).digest('hex')

function runDir() {
  const root = mkdtempSync(join(tmpdir(), 'e2e-'))
  const dir = join(root, '.pair', 'working', 'runs', 'canary-479-replay', '479')
  mkdirSync(dir, { recursive: true })
  return dir
}
let seq = 0
function step(dir, phase, skill, fields, opts = {}) {
  const file = join(dir, `draft-${seq++}.json`)
  writeFileSync(file, JSON.stringify({ run: 'canary-479-replay', story: '479', pr: 480, branch: 'feature/US-479-delivery-workflow-to-be', phase, skill, inputHead: SHA('a'), ...fields }))
  const out = publish({ dir, file, phase, skill, workflowVersion: V, ...opts })
  assert.equal(out.published, true, `${phase}-${skill}: ${JSON.stringify(out)}`)
  return out
}

test('T-27: one composed lifecycle — initial build, a real defect + a scope proposal, remediation, an authenticated scope extension, a second remediation for the approved AC, final done — with metrics correct at every observed step', () => {
  const dir = runDir()

  // ── initial contract + implementation (a0) ──────────────────────────────────────────────
  step(dir, 'a0', 'red-spec', { status: 'red', mode: 'initial', contractPath: '/abs/a0-red-contract.json', contractHash: `sha256:${'1'.repeat(64)}` })
  step(dir, 'a0', 'red-verify', { verified: true, findings: [], sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}` }, { predecessor: 'a0-red-spec' })
  step(dir, 'a0', 'implement-phase', { status: 'ok', prNumber: 480, outputHead: SHA('c'), gatesPassed: true }, { predecessor: 'a0-red-verify' })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.equal(r.next.step, 'verify')
  assert.equal(r.next.mode, 'first')

  // ── first review: one real Major defect + one new-scope proposal (never conflated, S2) ──
  step(
    dir,
    'r0',
    'review-phase',
    {
      reviewedHead: SHA('c'),
      verdict: 'CHANGES-REQUESTED',
      findings: [{ id: 'r0-1', severity: 'Major', location: 'src/a.ts:1', description: 'wrong', recommendation: 'fix', blocking: true, transition: 'open', kind: 'defect' }],
      scopeChanges: [{ id: 'sc-1', type: 'new-requirement', proposal: 'add a related capability', status: 'pending', discoveredAtReviewId: 'r0' }],
      custody: { verified: true, contractBreach: false },
      readiness: { ready: false },
    },
    { predecessor: 'a0-implement-phase' },
  )
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 480 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase }, { step: 'prepare', mode: 'remediation', phase: 'r1-g1' })
  assert.deepEqual(r.next.findings.map(f => f.id), ['r0-1'], 'the scope proposal never enters the fix plan')

  // ── remediation round 1: real-authority contract, mechanism named and closed in one answer ─
  step(dir, 'r1-g1', 'red-spec', { status: 'red', mode: 'remediation', contractPath: '/abs/r1-g1-red-contract.json', contractHash: `sha256:${'2'.repeat(64)}`, plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] } }, { predecessor: 'r0-review-phase' })
  step(dir, 'r1-g1', 'red-verify', { verified: true, findings: [], sealed: true, snapshot: SHA('d'), contractHash: `sha256:${'2'.repeat(64)}` }, { predecessor: 'r1-g1-red-spec' })
  step(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('e'), evidenceLedger: [], remediationBatchId: 'r1' }, { predecessor: 'r1-g1-red-verify' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 480 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase }, { step: 'verify', mode: 're-review', phase: 'r1' })

  // ── re-review: the defect resolved, quality converged — but the scope proposal is STILL
  // pending, so the cycle must stop at awaiting-scope-decision, never `done` ──────────────────
  step(
    dir,
    'r1',
    'review-phase',
    {
      mode: 're-review',
      reviewedHead: SHA('e'),
      verdict: 'APPROVED',
      findings: [{ id: 'r0-1', severity: 'Major', location: 'src/a.ts:1', description: 'wrong', recommendation: 'fix', blocking: false, transition: 'resolved', kind: 'defect' }],
      scopeChanges: [{ id: 'sc-1', type: 'new-requirement', proposal: 'add a related capability', status: 'pending', discoveredAtReviewId: 'r0' }],
      custody: { verified: true, contractBreach: false },
      readiness: { ready: true, remoteHead: SHA('e') },
    },
    { predecessor: 'r1-g1-green-fix' },
  )
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 480 })
  assert.equal(r.status, 'blocked')
  assert.equal(r.next.reason, 'awaiting-scope-decision')
  assert.equal(r.next.qualityState, 'converged')

  const metricsAtGate = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '479', branch: 'feature/US-479-delivery-workflow-to-be', pr: 480, runId: 'canary-479-replay' })
  assert.equal(metricsAtGate.outcome.quality, 'converged')
  assert.equal(metricsAtGate.outcome.delivery, 'awaiting-scope-decision')
  assert.equal(metricsAtGate.cycles.completed, 1)
  assert.equal(metricsAtGate.scopeChanges.pending, 1)

  // ── the maintainer's authenticated extend-current-card decision, applied mechanically ──────
  const pendingScope = [{ id: 'sc-1', proposal: 'add a related capability', status: 'pending' }]
  const decisionRef = 'https://github.com/foomakers/pair/pull/480#issuecomment-9001'
  const hash = scopeBaselineHashOf(pendingScope)
  writeFileSync(
    join(FAKE_GH_DIR, 'comments.json'),
    JSON.stringify([{ id: 9001, body: '```json\n' + JSON.stringify({ schemaVersion: 1, scopeBaselineHash: hash, decisions: [{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-99', description: 'the approved new requirement' }] } }] }) + '\n```' }]),
  )
  const decisionOut = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 480, maintainer: 'rucka', workflowVersion: V })
  assert.equal(decisionOut.applied, true, JSON.stringify(decisionOut))
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 480 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, scopeEpoch: r.next.scopeEpoch }, { step: 'prepare', mode: 'remediation', phase: 'r2-g1', scopeEpoch: 2 })
  assert.deepEqual(r.next.findings.map(f => f.id), ['AC-99'])

  // ── remediation round 2, for the APPROVED delta only — same pipeline, no parallel path ──────
  step(dir, 'r2-g1', 'red-spec', { status: 'red', mode: 'remediation', contractPath: '/abs/r2-g1-red-contract.json', contractHash: `sha256:${'3'.repeat(64)}`, plan: { groups: [{ groupId: 'r2-g1', findings: ['AC-99'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/b.ts'] }], carried: [] } }, { predecessor: 'r1-review-phase.attempt-2' })
  step(dir, 'r2-g1', 'red-verify', { verified: true, findings: [], sealed: true, snapshot: SHA('f'), contractHash: `sha256:${'3'.repeat(64)}` }, { predecessor: 'r2-g1-red-spec' })
  step(dir, 'r2-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('9'), evidenceLedger: [], remediationBatchId: 'r2' }, { predecessor: 'r2-g1-red-verify' })

  // ── final review: everything resolved, scope extended (not pending) — ready at last ─────────
  step(
    dir,
    'r2',
    'review-phase',
    {
      mode: 're-review',
      reviewedHead: SHA('9'),
      verdict: 'APPROVED',
      findings: [
        { id: 'r0-1', severity: 'Major', location: 'src/a.ts:1', description: 'wrong', recommendation: 'fix', blocking: false, transition: 'resolved', kind: 'defect' },
        { id: 'AC-99', severity: 'Major', location: 'src/b.ts:1', description: 'the approved new requirement', recommendation: 'fix', blocking: false, transition: 'resolved', kind: 'defect' },
      ],
      scopeChanges: [{ id: 'sc-1', type: 'new-requirement', proposal: 'add a related capability', status: 'extended', discoveredAtReviewId: 'r0' }],
      custody: { verified: true, contractBreach: false },
      readiness: { ready: true, remoteHead: SHA('9') },
    },
    { predecessor: 'r2-g1-green-fix' },
  )
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 480, acHash: CARD_HASH(479) })
  assert.equal(r.status, 'completed')
  assert.equal(r.next.step, 'done')
  assert.equal(r.next.reviewedHead, SHA('9'))

  // ── final metrics: two completed cycles, both scope epochs, zero pending proposals ──────────
  const finalMetrics = reduceCycleMetrics({ dir, repository: 'foomakers/pair', story: '479', branch: 'feature/US-479-delivery-workflow-to-be', pr: 480, runId: 'canary-479-replay' })
  assert.equal(finalMetrics.outcome.quality, 'converged')
  assert.equal(finalMetrics.outcome.delivery, 'ready-for-merge')
  assert.equal(finalMetrics.cycles.completed, 2)
  assert.equal(finalMetrics.scopeChanges.pending, 0)
  assert.equal(finalMetrics.scopeChanges.extended, 1)

  // ── RUNTIME finalize: the deterministic PR summary, read back and confirmed ──────────────────
  const finalized = finalizeMetrics({ dir, repository: 'foomakers/pair', story: '479', branch: 'feature/US-479-delivery-workflow-to-be', pr: 480, runId: 'canary-479-replay', publish: { listComments, findByMarker, upsert } })
  assert.equal(finalized.writeResult.written, true)
  assert.equal(finalized.view.publication.state, 'confirmed', JSON.stringify(finalized.view.publication))
  assert.equal(finalized.view.outcome.delivery, 'ready-for-merge')
  const posted = JSON.parse(readFileSync(join(FAKE_GH_DIR, 'comments.json'), 'utf8')).find(c => c.id === finalized.view.publication.commentId)
  assert.match(posted.body, /pair:synthesis #479 PR#480/)
  assert.match(posted.body, /machine-readable summary/i)
  assert.match(posted.body, /sc-1/)

  // ── a duplicate re-application of the SAME decisionRef is idempotent, never a second epoch ──
  const replay = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 480, maintainer: 'rucka', workflowVersion: V })
  assert.deepEqual(replay, { applied: true, reason: 'already-applied' })
})
