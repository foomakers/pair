// Tests for cycle-state.mjs — the durable transition authority of one delivery cycle (US-479 T-11).
// Every scenario runs against a real temporary run directory: the Workflow sandbox has no
// filesystem, so the ONLY place a resume decision can be proven is here, on real handoff files.
// The pre-push hook exports GIT_DIR (and friends) to everything it runs; a test that spawns git in a
// temp directory under that environment acts on the REAL repository (2026-09-09: core.bare flipped,
// fixture commits on a story branch). Scrubbed here at import, and asserted by the decoy test in
// engine-boundaries.test.mjs.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
// A fake `gh` for the card hash: `issue view <n> --json body -q .body` prints a fixed body per story so
// publish stamps a deterministic canonical acHash; PAIR_GH_BIN points the scripts at it.
import { mkdtempSync as _mk, writeFileSync as _wf, chmodSync as _ch } from 'node:fs'
import { tmpdir as _tmp } from 'node:os'
import { join as _join } from 'node:path'
import { createHash as _hash } from 'node:crypto'
const FAKE_GH_DIR = _mk(_join(_tmp(), 'fake-gh-'))
_wf(_join(FAKE_GH_DIR, 'gh'), `#!/usr/bin/env node
const a = process.argv.slice(2)
if (a[0] === 'issue' && a[1] === 'view') { if (process.env.FAKE_GH_FAIL) { process.stderr.write('HTTP 502'); process.exit(1) } process.stdout.write('card body of #' + a[2] + (process.env.FAKE_GH_BODY_SUFFIX || '')); process.exit(0) }
process.stderr.write('unexpected gh call'); process.exit(1)
`)
_ch(_join(FAKE_GH_DIR, 'gh'), 0o755)
process.env.PAIR_GH_BIN = _join(FAKE_GH_DIR, 'gh')
const CARD_HASH = n => 'sha256:' + _hash('sha256').update('card body of #' + n).digest('hex')
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { SCHEMA_VERSION, deriveNext, publish, resolve, readHandoffs, contractHash, inputsDigest, testIdentity, compatible, cardHash } from '../../skills/pair-workflow-red-spec/scripts/cycle-state.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-red-spec/scripts/cycle-state.mjs', import.meta.url))
const V = '3.0.0'
const SHA = c => c.repeat(40)
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }

// The script ships inside EVERY phase skill that publishes a handoff, byte-identical. One source,
// five installed copies (and their dataset sources): this is the guard that keeps them one artifact.
test('cycle-state.mjs ships byte-identical inside every phase skill (installed and dataset)', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const canonical = read('../../skills/pair-workflow-red-spec/scripts/cycle-state.mjs')
  for (const skill of ['red-verify', 'implement-phase', 'green-fix', 'review-phase'])
    assert.equal(read(`../../skills/pair-workflow-${skill}/scripts/cycle-state.mjs`), canonical, `${skill} drifted`)
  for (const skill of ['red-spec', 'red-verify', 'implement-phase', 'green-fix', 'review-phase'])
    assert.equal(
      read(`../../../packages/knowledge-hub/dataset/.skills/workflow/${skill}/scripts/cycle-state.mjs`),
      canonical,
      `dataset ${skill} drifted`,
    )
})

function runDir() {
  const root = mkdtempSync(join(tmpdir(), 'cycle-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  return { root, dir }
}
// A handoff as a phase skill publishes it: envelope + phase fields.
function handoff(dir, phase, skill, fields, { pr = 7, predecessor } = {}) {
  const file = join(dir, `tmp-${phase}-${skill}.json`)
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr, branch: 'feature/US-42', phase, skill, inputHead: SHA('a'), ...fields }))
  const out = publish({ dir, file, phase, skill, workflowVersion: V, predecessor })
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

// ── publish: atomic, sequenced, predecessor-checked, never overwrites a newer handoff ────────
test('publish: writes <phase>-<skill>.json atomically with a monotonic seq and the envelope stamped', () => {
  const { dir } = runDir()
  const a = redSpec(dir, 'a0')
  const b = redVerify(dir, 'a0', {}, { predecessor: 'a0-red-spec' })
  assert.equal(a.seq, 1)
  assert.equal(b.seq, 2)
  const written = JSON.parse(readFileSync(join(dir, 'a0-red-verify.json'), 'utf8'))
  assert.equal(written.schemaVersion, SCHEMA_VERSION)
  assert.equal(written.workflowVersion, V)
  assert.equal(written.predecessor, 'a0-red-spec')
  assert.match(written.createdAt, /^\d{4}-\d{2}-\d{2}T/)
  // no temp file, no lock left behind
  assert.deepEqual(readdirSync(dir).filter(f => f.startsWith('tmp-') || f.startsWith('.')), [])
})

test('publish: a missing predecessor, a malformed file or a missing envelope field is refused before anything is written', () => {
  const { dir } = runDir()
  const file = join(dir, 'draft.json')
  writeFileSync(file, '{not json')
  assert.match(publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: V }).reason, /not-json/)
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', phase: 'a0', skill: 'red-spec' }))
  assert.match(publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: V }).reason, /inputHead/)
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', phase: 'a0', skill: 'red-verify', inputHead: SHA('a'), verified: false, sealed: false }))
  assert.match(publish({ dir, file, phase: 'a0', skill: 'red-verify', workflowVersion: V, predecessor: 'a0-red-spec' }).reason, /predecessor-missing/)
  // phase/skill in the file must match the arguments — a handoff cannot be filed under another name
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', phase: 'r1', skill: 'red-spec', inputHead: SHA('a'), status: 'red' }))
  assert.match(publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: V }).reason, /identity-mismatch/)
  assert.equal(existsSync(join(dir, 'a0-red-spec.json')), false)
})

test('publish: a second writer for the same step is a stale write — the first published handoff stays', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { contractHash: `sha256:${'1'.repeat(64)}` })
  const file = join(dir, 'draft.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', contractHash: `sha256:${'2'.repeat(64)}` }))
  const out = publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: V })
  assert.equal(out.published, false)
  assert.equal(out.reason, 'stale-write')
  assert.equal(JSON.parse(readFileSync(join(dir, 'a0-red-spec.json'), 'utf8')).contractHash, `sha256:${'1'.repeat(64)}`)
  // an explicit new ATTEMPT of the same step is legal and keeps both
  const again = publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: V, attempt: 2 })
  assert.equal(again.published, true)
  assert.ok(existsSync(join(dir, 'a0-red-spec.attempt-2.json')))
})

test('publish: a held lock is respected, never broken', () => {
  const { dir } = runDir()
  mkdirSync(join(dir, '.lock'))
  const file = join(dir, 'draft.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red' }))
  const out = publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: V, lockWaitMs: 50 })
  assert.equal(out.published, false)
  assert.equal(out.reason, 'locked')
  assert.ok(existsSync(join(dir, '.lock')), 'the lock of another writer is not removed')
})

// ── resolve: the executable transitions ────────────────────────────────────────────────────
test('resolve: an empty run directory is `empty`, and the entry step depends on whether a PR exists', () => {
  const { dir } = runDir()
  const fresh = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.equal(fresh.status, 'empty')
  assert.deepEqual(fresh.next, { step: 'prepare', mode: 'initial', phase: 'a0', round: 0, attempt: 1 })
  const resumed = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr' })
  assert.deepEqual(resumed.next, { step: 'verify', mode: 'first', phase: 'r0', round: 0, attempt: 1 })
})

test('resolve: initial chain — prepare → validate → implement → verify(first) → done', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0')
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.equal(r.status, 'in-progress')
  assert.equal(r.next.step, 'validate')
  assert.equal(r.next.phase, 'a0')
  assert.equal(r.next.contract.path, '/abs/a0-red-contract.json')
  assert.equal(r.next.contract.hash, `sha256:${'1'.repeat(64)}`)
  redVerify(dir, 'a0', {}, { predecessor: 'a0-red-spec' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.equal(r.next.step, 'implement')
  assert.equal(r.next.contract.snapshot, SHA('b'))
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', prNumber: 7, outputHead: SHA('c'), gatesPassed: true }, { predecessor: 'a0-red-verify' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, base: r.next.base }, { step: 'verify', mode: 'first', phase: 'r0', base: SHA('c') })
  review(dir, 'r0', {}, { predecessor: 'a0-implement-phase' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.equal(r.status, 'completed')
  assert.equal(r.next.step, 'done')
  assert.equal(r.next.reviewedHead, SHA('c'))
})

test('resolve: an implementation whose gate is red (or that failed) returns to implement on the SAME seal once, then is failed-implement — never `verify` on a red gate', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0')
  redVerify(dir, 'a0', {}, { predecessor: 'a0-red-spec' })
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', prNumber: 7, outputHead: SHA('c'), gatesPassed: false }, { predecessor: 'a0-red-verify' })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, attempt: r.next.attempt, snapshot: r.next.contract.snapshot, pr: r.next.pr }, { step: 'implement', mode: 'retry', attempt: 2, snapshot: SHA('b'), pr: 7 })
  publish({ dir, file: writeDraft(dir, { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'implement-phase', inputHead: SHA('a'), status: 'ok', prNumber: 7, outputHead: SHA('d'), gatesPassed: false }), phase: 'a0', skill: 'implement-phase', workflowVersion: V, attempt: 2 })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.deepEqual([r.next.step, r.next.reason, r.next.budget], ['blocked', 'failed-implement', 'greenRetries'])
})

test('resolve: same-input resume executes the first incomplete step only — a repeated resolve is idempotent and never asks for a fresh review', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0')
  redVerify(dir, 'a0', {}, { predecessor: 'a0-red-spec' })
  const first = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  const second = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.deepEqual(first.next, second.next)
  assert.equal(first.next.step, 'implement')
  // the same evidence read under the PR entry (a different invocation id, same cycle) yields the same step
  const underPr = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(underPr.next.step, 'implement')
})

test('resolve: a rejected contract goes back to preparation as a REPAIR carrying the rejection; the second rejection exhausts the unchanged budget', () => {
  const { dir } = runDir()
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'x', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] } })
  const rejection = [{ location: 'test/a.test.ts:3', severity: 'Major', description: 'missing the empty form', recommendation: 'add row' }]
  redVerify(dir, 'r1-g1', { verified: false, findings: rejection, sealed: false, snapshot: undefined }, { predecessor: 'r1-g1-red-spec' })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'prepare')
  assert.equal(r.next.mode, 'repair')
  assert.equal(r.next.attempt, 2)
  assert.deepEqual(r.next.rejection, rejection)
  // repair published as attempt 2, rejected again
  handoff(dir, 'r1-g1', 'red-spec', { status: 'red', mode: 'remediation', contractPath: '/abs/r1-g1-red-contract.json', contractHash: `sha256:${'3'.repeat(64)}`, attempt: 2 }, { predecessor: 'r1-g1-red-verify' })
  publish({ dir, file: writeDraft(dir, { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-verify', inputHead: SHA('a'), verified: false, findings: rejection, sealed: false }), phase: 'r1-g1', skill: 'red-verify', workflowVersion: V, attempt: 2 })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.status, 'blocked')
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.reason, 'failed-contract')
  assert.equal(r.next.budget, 'redRepairs')
})
function writeDraft(dir, obj) {
  const f = join(dir, `draft-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(f, JSON.stringify(obj))
  return f
}

test('resolve: remediation round — prepare(g1) → validate+seal → green → prepare(g2) → … → verify(re-review) with the prior head as base', () => {
  const { dir } = runDir()
  review(dir, 'r0', { readiness: { ready: false, remoteHead: SHA('c') }, verdict: 'CHANGES-REQUESTED', findings: [finding('r0-1'), finding('r0-2', { location: 'src/b.ts:4' })] })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, round: r.next.round, base: r.next.base }, { step: 'prepare', mode: 'remediation', phase: 'r1-g1', round: 1, base: SHA('c') })
  assert.deepEqual(r.next.findings.map(f => f.id), ['r0-1', 'r0-2'])
  const plan = { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }, { groupId: 'r1-g2', findings: ['r0-2'], owner: 'b', mode: 'behavioral', allowedPaths: ['src/b.ts'], dependsOn: ['r1-g1'] }], carried: [] }
  redSpec(dir, 'r1-g1', { plan, groupId: 'r1-g1' }, { predecessor: 'r0-review-phase' })
  redVerify(dir, 'r1-g1', {}, { predecessor: 'r1-g1-red-spec' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'green')
  assert.equal(r.next.contract.snapshot, SHA('b'))
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [] }, { predecessor: 'r1-g1-red-verify' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, phase: r.next.phase, base: r.next.base }, { step: 'prepare', phase: 'r1-g2', base: SHA('d') })
  assert.equal(r.next.group.groupId, 'r1-g2')
  assert.deepEqual(r.next.findings.map(f => f.id), ['r0-2'])
  redSpec(dir, 'r1-g2', { groupId: 'r1-g2' }, { predecessor: 'r1-g1-green-fix' })
  redVerify(dir, 'r1-g2', { snapshot: SHA('e') }, { predecessor: 'r1-g2-red-spec' })
  handoff(dir, 'r1-g2', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('f'), evidenceLedger: [] }, { predecessor: 'r1-g2-red-verify' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, base: r.next.base, round: r.next.round }, { step: 'verify', mode: 're-review', phase: 'r1', base: SHA('c'), round: 1 })
  assert.deepEqual(r.next.openIds, ['r0-1', 'r0-2'])
  assert.equal(r.next.prior, 'r0-review-phase')
})

test('resolve: an approved test failing on production returns to GREEN on the SAME seal (no new RED, no new plan); a second time exhausts the budget', () => {
  const { dir } = runDir()
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')] })
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1' })
  redVerify(dir, 'r1-g1', {})
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [] })
  review(dir, 'r1', { mode: 're-review', readiness: { ready: false }, findings: [finding('r0-1', { transition: 'open', kind: 'approved-test-failing', groupId: 'r1-g1', rowId: 'row-3' })] })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, phase: r.next.phase, attempt: r.next.attempt, snapshot: r.next.contract.snapshot }, { step: 'green', phase: 'r1-g1', attempt: 2, snapshot: SHA('b') })
  publish({ dir, file: writeDraft(dir, { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'green-fix', inputHead: SHA('a'), fixed: true, needsHumanDecision: false, outputHead: SHA('e'), evidenceLedger: [] }), phase: 'r1-g1', skill: 'green-fix', workflowVersion: V, attempt: 2 })
  publish({ dir, file: writeDraft(dir, { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('e'), verdict: 'CHANGES-REQUESTED', mode: 're-review', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, findings: [finding('r0-1', { kind: 'approved-test-failing', groupId: 'r1-g1' })] }), phase: 'r1', skill: 'review-phase', workflowVersion: V, attempt: 2 })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.reason, 'failed-fix')
  assert.equal(r.next.budget, 'greenRetries')
})

test('resolve: a genuine contract gap revises ONLY the affected group as a new revision — validate, green and verify follow; a plain new defect opens the next round', () => {
  const { dir } = runDir()
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')] })
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1' })
  redVerify(dir, 'r1-g1', {})
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [] })
  review(dir, 'r1', { mode: 're-review', readiness: { ready: false }, reviewedHead: SHA('d'), findings: [finding('r0-1', { transition: 'resolved', blocking: false }), finding('r1-1', { kind: 'contract-gap', groupId: 'r1-g1', description: 'the empty form is unspecified' })] })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, revision: r.next.revision, base: r.next.base }, { step: 'prepare', mode: 'revision', phase: 'r1-g1-rev2', revision: 2, base: SHA('d') })
  assert.deepEqual(r.next.findings.map(f => f.id), ['r1-1'])
  assert.equal(r.next.contract.path, '/abs/r1-g1-red-contract.json', 'the revision starts from the sealed contract it extends')
  // the other shape: a defect that is neither an approved-test failure nor a gap opens round 2
  const { dir: dir2 } = runDir()
  review(dir2, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')] })
  redSpec(dir2, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1' })
  redVerify(dir2, 'r1-g1', {})
  handoff(dir2, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [] })
  review(dir2, 'r1', { mode: 're-review', readiness: { ready: false }, reviewedHead: SHA('d'), findings: [finding('r0-1', { transition: 'resolved', blocking: false }), finding('r1-1', { kind: 'defect', missedUpstream: true })] })
  r = resolve({ dir: dir2, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, round: r.next.round }, { step: 'prepare', mode: 'remediation', phase: 'r2-g1', round: 2 })
  assert.deepEqual(r.next.findings.map(f => f.id), ['r1-1'])
})

test('resolve: a genuine gap in the INITIAL acceptance contract revises a0 as a0-rev2 — validate + successor seal, implement again on the same branch, then a re-review of the prior findings + delta (canary run 11)', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0')
  redVerify(dir, 'a0', {}, { predecessor: 'a0-red-spec' })
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', prNumber: 7, outputHead: SHA('c'), gatesPassed: true }, { predecessor: 'a0-red-verify' })
  review(dir, 'r0', { readiness: { ready: false }, verdict: 'CHANGES-REQUESTED', findings: [finding('r0-1', { kind: 'contract-gap', groupId: 'a0', severity: 'Minor' })] })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, revision: r.next.revision, base: r.next.base }, { step: 'prepare', mode: 'revision', phase: 'a0-rev2', revision: 2, base: SHA('c') })
  assert.equal(r.next.contract.path, '/abs/a0-red-contract.json')
  redSpec(dir, 'a0-rev2', { mode: 'revision', revision: 2 }, { predecessor: 'r0-review-phase' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'validate')
  redVerify(dir, 'a0-rev2', { snapshot: SHA('e') }, { predecessor: 'a0-rev2-red-spec' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, attempt: r.next.attempt, snapshot: r.next.contract.snapshot, pr: r.next.pr }, { step: 'implement', mode: 'revision', phase: 'a0-rev2', attempt: 1, snapshot: SHA('e'), pr: 7 })
  handoff(dir, 'a0-rev2', 'implement-phase', { status: 'ok', prNumber: 7, outputHead: SHA('f'), gatesPassed: true }, { predecessor: 'a0-rev2-red-verify' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, base: r.next.base, openIds: r.next.openIds }, { step: 'verify', mode: 're-review', phase: 'r1', base: SHA('c'), openIds: ['r0-1'] })
})

test('resolve: every `next` carries the PR the cycle is bound to once a handoff names it — including the inputs-changed and moved-head re-verifications', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { inputsDigest: 'd1' })
  redVerify(dir, 'a0', { inputsDigest: 'd1' })
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', prNumber: 7, outputHead: SHA('c'), gatesPassed: true, inputsDigest: 'd1' })
  review(dir, 'r0', { inputsDigest: 'd1', readiness: { ready: false }, findings: [finding('r0-1')] })
  for (const opts of [{ entry: 'fresh' }, { entry: 'fresh', inputs: 'd2' }, { entry: 'pr', pr: 7, head: SHA('9') }]) {
    const r = resolve({ dir, workflowVersion: V, policy: POLICY, ...opts })
    assert.equal(r.next.pr, 7, JSON.stringify(opts))
    assert.equal(r.pr, 7)
  }
  // nothing names a PR yet: no pr on next, and a fresh cycle stays fresh
  const { dir: d2 } = runDir()
  redSpec(d2, 'a0', {}, { pr: null })
  assert.equal(resolve({ dir: d2, workflowVersion: V, policy: POLICY, entry: 'fresh' }).next.pr, undefined)
})

test('resolve: every verify `next` carries priorFindings — every id the cycle has seen with its latest severity — so a resumed coordinator can judge transitions and severity changes', () => {
  const { dir } = runDir()
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2', { severity: 'Minor' })] })
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1', 'r0-2'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1' })
  redVerify(dir, 'r1-g1', {})
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [] })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'verify')
  assert.deepEqual(r.next.priorFindings, [{ id: 'r0-1', severity: 'Major' }, { id: 'r0-2', severity: 'Minor' }])
  review(dir, 'r1', { mode: 're-review', readiness: { ready: false }, inputsDigest: 'd1', findings: [finding('r0-1', { transition: 'resolved', blocking: false }), finding('r0-2', { severity: 'Major', severityEvidence: 'new failure case' }), finding('r1-3', { kind: 'question', severity: 'Questions', blocking: false })] })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, inputs: 'd2' })
  assert.equal(r.next.inputsChanged, true)
  assert.deepEqual(r.next.priorFindings, [{ id: 'r0-1', severity: 'Major' }, { id: 'r0-2', severity: 'Major' }, { id: 'r1-3', severity: 'Questions' }], 'latest severity wins, questions included')
})

test('resolve: budgets, escalations and breaches are blocked outcomes — never a clean review', () => {
  const { dir } = runDir()
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')], custody: { verified: false, contractBreach: true } })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual([r.status, r.next.step, r.next.reason], ['blocked', 'blocked', 'failed-custody'])
  const { dir: d2 } = runDir()
  review(d2, 'r0', { readiness: { ready: false }, findings: [finding('r0-1', { external: true, disposition: 'card rule 3 contradicts the gate — maintainer edits the card' })] })
  r = resolve({ dir: d2, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual([r.next.step, r.next.reason], ['blocked', 'escalate'], 'an external blocker carried is not accepted')
  const { dir: d3 } = runDir()
  review(d3, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')], needsHumanDecision: true, humanDecisionKind: 'history-rewrite' })
  r = resolve({ dir: d3, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual([r.next.step, r.next.reason], ['blocked', 'escalate'])
  const { dir: d4 } = runDir()
  review(d4, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')] })
  for (let n = 1; n <= 3; n++) {
    redSpec(d4, `r${n}-g1`, { plan: { groups: [{ groupId: `r${n}-g1`, findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: `r${n}-g1` })
    redVerify(d4, `r${n}-g1`, {})
    handoff(d4, `r${n}-g1`, 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [] })
    review(d4, `r${n}`, { mode: 're-review', readiness: { ready: false }, findings: [finding('r0-1', { transition: 'resolved', blocking: false }), finding(`r${n}-1`, { kind: 'defect' })] })
  }
  r = resolve({ dir: d4, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual([r.next.step, r.next.reason, r.next.budget], ['blocked', 'escalate', 'maxFixRounds'])
  const { dir: d5 } = runDir()
  redSpec(d5, 'a0', { status: 'unprovable', reason: 'AC-3 names no producer' })
  r = resolve({ dir: d5, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.deepEqual([r.next.step, r.next.reason, r.next.refusal], ['blocked', 'failed-preparation', 'unprovable'])
})

test('resolve: a completed cycle is `completed`; a moved remote head makes it a delta verification, never a fresh review and never ready', () => {
  const { dir } = runDir()
  review(dir, 'r0', {})
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, head: SHA('c') })
  assert.equal(r.status, 'completed')
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, head: SHA('9') })
  assert.equal(r.status, 'in-progress')
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, base: r.next.base, phase: r.next.phase }, { step: 'verify', mode: 're-review', base: SHA('c'), phase: 'r1' })
  assert.equal(r.next.headMoved, true)
})

test('resolve: identity — a different workflow major, another PR, another story or a pre-envelope handoff is `incompatible`; malformed JSON is `invalid`', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0')
  assert.equal(resolve({ dir, workflowVersion: '4.0.0', policy: POLICY, entry: 'fresh' }).status, 'incompatible')
  assert.equal(resolve({ dir, workflowVersion: '3.4.1', policy: POLICY, entry: 'fresh' }).status, 'in-progress', 'same major is compatible')
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 8 }).status, 'incompatible')
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 8 }).reason, 'pr-mismatch')
  writeFileSync(join(dir, 'r0-review-phase.json'), JSON.stringify({ run: 'run-1', story: '42', phase: 'r0', skill: 'review-phase', reviewedHead: SHA('c') }))
  const pre = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' })
  assert.equal(pre.status, 'incompatible')
  assert.match(pre.reason, /schemaVersion/)
  writeFileSync(join(dir, 'r0-review-phase.json'), '{')
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh' }).status, 'invalid')
  const { dir: d2 } = runDir()
  const f = writeDraft(d2, { run: 'run-1', story: '43', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', contractPath: '/x', contractHash: 'sha256:' + '1'.repeat(64) })
  publish({ dir: d2, file: f, phase: 'a0', skill: 'red-spec', workflowVersion: V })
  assert.equal(resolve({ dir: d2, workflowVersion: V, policy: POLICY, entry: 'fresh', story: '42' }).status, 'incompatible')
})

test('resolve: changed effective inputs invalidate the review evidence only — the sealed contract survives an unrelated card edit', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { inputsDigest: 'd1', acHash: 'ac1' })
  redVerify(dir, 'a0', { inputsDigest: 'd1' })
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', prNumber: 7, outputHead: SHA('c'), gatesPassed: true, inputsDigest: 'd1' })
  review(dir, 'r0', { inputsDigest: 'd1', acHash: 'ac1' })
  // unrelated card prose: acHash unchanged, digest unchanged → completed
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, inputs: 'd1', acHash: CARD_HASH(42) }).status, 'completed')
  // the agent's spelling never matters: publish REPLACED 'ac1' with the canonical card hash and marked its source
  const stamped = JSON.parse(readFileSync(join(dir, 'r0-review-phase.json'), 'utf8'))
  assert.deepEqual({ acHash: stamped.acHash, source: stamped.acHashSource }, { acHash: CARD_HASH(42), source: 'publish' })
  // a non-canonical value on the CALLER side is ignored, never read as a change
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, inputs: 'd1', acHash: 'story #42 AC-1..AC-3 summary' }).status, 'completed')
  // a different canonical card hash IS a change (the card was edited)
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, inputs: 'd1', acHash: `sha256:${'b'.repeat(64)}` }).next.inputsChanged, true, 'two script-stamped canonical hashes that differ ARE a change')
  // a handoff whose acHash was NOT stamped by the script (an agent-spelled canonical-looking value, pre-3.0.12)
  // is history, never evidence of a change — canary v4 run 15 ping-ponged prepare ↔ verify on exactly this
  const { dir: d3 } = runDir()
  const legacy = join(d3, 'r0-review-phase.json')
  writeFileSync(legacy, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), schemaVersion: SCHEMA_VERSION, workflowVersion: V, seq: 1, attempt: 1, createdAt: 'x', reviewedHead: SHA('c'), verdict: 'CHANGES-REQUESTED', mode: 'first', custody: { verified: true, contractBreach: false }, readiness: { ready: false, remoteHead: SHA('c') }, findings: [finding('r0-1')], inputsDigest: 'd1', acHash: `sha256:${'a'.repeat(64)}` }))
  const r3 = resolve({ dir: d3, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, inputs: 'd1', acHash: CARD_HASH(42) })
  assert.deepEqual({ step: r3.next.step, phase: r3.next.phase, inputsChanged: r3.next.inputsChanged }, { step: 'prepare', phase: 'r1-g1', inputsChanged: undefined })
  // a relevant input changed (policy/AC): prior findings + delta must be re-validated, the seal stays trusted
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, inputs: 'd2', acHash: 'ac1' })
  assert.equal(r.status, 'in-progress')
  assert.deepEqual({ step: r.next.step, mode: r.next.mode }, { step: 'verify', mode: 're-review' })
  assert.deepEqual(r.next.invalidated, ['r0-review-phase'])
  assert.equal(r.next.inputsChanged, true)
})

test('resolve: with an empty run directory and a PR, other run directories of the same story are searched — one match is adopted, several are ambiguous', () => {
  const { root, dir } = runDir()
  const runs = join(root, '.pair', 'working', 'runs')
  const other = join(runs, 'run-0', '42')
  mkdirSync(other, { recursive: true })
  redSpec(other, 'a0')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, runsRoot: runs, story: '42' })
  assert.equal(r.status, 'other-run')
  assert.equal(r.runId, 'run-0')
  const third = join(runs, 'run-9', '42')
  mkdirSync(third, { recursive: true })
  redSpec(third, 'a0')
  const amb = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, runsRoot: runs, story: '42' })
  assert.equal(amb.status, 'incompatible')
  assert.equal(amb.reason, 'ambiguous-runs')
  assert.deepEqual(amb.candidates.sort(), ['run-0', 'run-9'])
  // a run directory written by another engine major (or a pre-envelope schema) is LEGACY: it is never
  // adopted nor overwritten — a fresh cycle starts in the named run dir and the legacy one is reported
  const { root: r2, dir: d2 } = runDir()
  const runs2 = join(r2, '.pair', 'working', 'runs')
  const legacy = join(runs2, 'canary-5', '42')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'r0-review-phase.json'), JSON.stringify({ run: 'canary-5', story: '42', pr: 7, phase: 'r0', skill: 'review-phase', reviewedHead: SHA('c'), verdict: 'x', findings: [], schemaVersion: 1, workflowVersion: '2.0.0' }))
  const fresh = resolve({ dir: d2, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, runsRoot: runs2, story: '42' })
  assert.equal(fresh.status, 'empty')
  assert.deepEqual(fresh.legacyRuns, ['canary-5'])
  assert.equal(fresh.next.step, 'verify')
})

// ── identities ────────────────────────────────────────────────────────────────────────────
test('contractHash is canonical: key order and the volatile fields do not change it, a row does', () => {
  const a = { fixScope: { owner: 'x', mode: 'behavioral', allowedPaths: ['s'] }, matrix: [{ id: 'row-1', condition: 'c', oracle: 'o', expected: 'e' }], redTests: [], contractPath: '/a', createdAt: 't1' }
  const b = { createdAt: 't2', contractPath: '/b', redTests: [], matrix: [{ expected: 'e', oracle: 'o', condition: 'c', id: 'row-1' }], fixScope: { allowedPaths: ['s'], mode: 'behavioral', owner: 'x' } }
  assert.equal(contractHash(a), contractHash(b))
  assert.match(contractHash(a), /^sha256:[0-9a-f]{64}$/)
  assert.notEqual(contractHash(a), contractHash({ ...a, matrix: [...a.matrix, { id: 'row-2', condition: 'c2', oracle: 'o', expected: 'e' }] }))
})

test('inputsDigest: every effective input dimension changes the digest independently', () => {
  const base = { workflowVersion: V, base: 'origin/main', severityFloor: 'Minor', skills: { a: '/x' }, notes: '', title: 'T', reviewers: 1 }
  const d0 = inputsDigest(base)
  for (const [k, v] of Object.entries({ workflowVersion: '3.1.0', base: 'origin/dev', severityFloor: 'Major', skills: { a: '/y' }, notes: 'scope', title: 'U', reviewers: 2 }))
    assert.notEqual(inputsDigest({ ...base, [k]: v }), d0, `${k} did not change the digest`)
  assert.equal(inputsDigest({ ...base }), d0)
})

test('testIdentity: code, tests, config, dependencies, toolchain, environment and the command each invalidate a cached result; an unknown dimension disables reuse', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ti-'))
  const g = (...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim() }
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@e.com'); g('config', 'user.name', 'T'); g('config', 'commit.gpgsign', 'false')
  writeFileSync(join(cwd, 'src.js'), '1'); writeFileSync(join(cwd, 'a.test.js'), 't'); writeFileSync(join(cwd, 'vitest.config.js'), 'c'); writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'l')
  g('add', '-A'); g('commit', '-q', '--no-verify', '-m', 'base')
  const env = { NODE_ENV: 'test', TZ: 'UTC' }
  const id0 = testIdentity({ cwd, command: 'pnpm test', env, toolchain: 'node v22' })
  assert.match(id0.identity, /^sha256:[0-9a-f]{64}$/)
  assert.equal(id0.reusable, true)
  assert.deepEqual(testIdentity({ cwd, command: 'pnpm test', env, toolchain: 'node v22' }).identity, id0.identity, 'stable when nothing changed')
  const variants = {
    code: () => writeFileSync(join(cwd, 'src.js'), '2'),
    tests: () => writeFileSync(join(cwd, 'a.test.js'), 'u'),
    config: () => writeFileSync(join(cwd, 'vitest.config.js'), 'd'),
    dependencies: () => writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'm'),
  }
  for (const [what, mutate] of Object.entries(variants)) {
    mutate()
    assert.notEqual(testIdentity({ cwd, command: 'pnpm test', env, toolchain: 'node v22' }).identity, id0.identity, `${what} did not invalidate`)
    g('checkout', '--', '.')
  }
  assert.notEqual(testIdentity({ cwd, command: 'pnpm test -t x', env, toolchain: 'node v22' }).identity, id0.identity, 'command')
  assert.notEqual(testIdentity({ cwd, command: 'pnpm test', env: { ...env, TZ: 'Europe/Rome' }, toolchain: 'node v22' }).identity, id0.identity, 'environment')
  assert.notEqual(testIdentity({ cwd, command: 'pnpm test', env, toolchain: 'node v20' }).identity, id0.identity, 'toolchain')
  // an incomplete identity (toolchain unknown) is computed but flagged NOT reusable
  const partial = testIdentity({ cwd, command: 'pnpm test', env, toolchain: null })
  assert.equal(partial.reusable, false)
  assert.match(partial.missing.join(), /toolchain/)
})

test('compatible: same major is compatible, a different major or an unparsable version is not', () => {
  assert.equal(compatible('3.0.0', '3.9.2'), true)
  assert.equal(compatible('3.0.0', '2.9.9'), false)
  assert.equal(compatible('3.0.0', 'x'), false)
  assert.equal(compatible('3.0.0', undefined), false)
})

// ── CLI ──────────────────────────────────────────────────────────────────────────────────
test('CLI: resolve/publish/hash print JSON; a bad command exits 2 with an error object; a blocked resolve still exits 0 (it is an answer)', () => {
  const { dir } = runDir()
  const run = (...a) => spawnSync('node', [CLI, ...a], { encoding: 'utf8' })
  let r = run('resolve', '--dir', dir, '--workflowVersion', V, '--policy', JSON.stringify(POLICY), '--entry', 'fresh')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(JSON.parse(r.stdout).status, 'empty')
  const draft = writeDraft(dir, { run: 'run-1', story: '42', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', contractPath: '/x', contractHash: 'sha256:' + '1'.repeat(64) })
  r = run('publish', '--dir', dir, '--file', draft, '--phase', 'a0', '--skill', 'red-spec', '--workflowVersion', V)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(JSON.parse(r.stdout).published, true)
  const contract = writeDraft(dir, { fixScope: { owner: 'x', mode: 'behavioral', allowedPaths: ['s'] }, matrix: [], redTests: [] })
  r = run('hash', '--file', contract)
  assert.match(JSON.parse(r.stdout).contractHash, /^sha256:/)
  r = run('frobnicate')
  assert.equal(r.status, 2)
  assert.match(JSON.parse(r.stdout).error, /unknown command/)
  r = run('resolve', '--dir', dir, '--workflowVersion', '9.0.0', '--policy', JSON.stringify(POLICY), '--entry', 'fresh')
  assert.equal(r.status, 0)
  assert.equal(JSON.parse(r.stdout).status, 'incompatible')
  rmSync(dir, { recursive: true, force: true })
})

test('publish --pr: the PR the cycle is bound to is stamped into the envelope; a PR that contradicts the draft or an earlier handoff, or is not a positive integer, is refused (canary run 11: a revision implement handoff carried pr=null)', () => {
  const { dir } = runDir()
  // the draft omits pr (as implement-phase did in revision mode) — the flag supplies it
  let file = join(dir, 'd1.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', branch: 'feature/US-42', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', contractPath: '/abs/a0-red-contract.json', contractHash: `sha256:${'1'.repeat(64)}` }))
  let out = publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: V, pr: 483 })
  assert.equal(out.published, true, JSON.stringify(out))
  assert.equal(JSON.parse(readFileSync(join(dir, 'a0-red-spec.json'), 'utf8')).pr, 483)
  // a contradicting draft is refused
  file = join(dir, 'd2.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 484, branch: 'feature/US-42', phase: 'a0', skill: 'red-verify', inputHead: SHA('a'), verified: true, findings: [], sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}` }))
  assert.deepEqual(publish({ dir, file, phase: 'a0', skill: 'red-verify', workflowVersion: V, pr: 483 }), { published: false, reason: 'pr-mismatch', stated: 484, pr: 483 })
  // a flag contradicting the run's earlier handoff is refused too
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', branch: 'feature/US-42', phase: 'a0', skill: 'red-verify', inputHead: SHA('a'), verified: true, findings: [], sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}` }))
  out = publish({ dir, file, phase: 'a0', skill: 'red-verify', workflowVersion: V, pr: 484 })
  assert.deepEqual(out, { published: false, reason: 'pr-mismatch', stated: 483, pr: 484, source: 'earlier-handoff' })
  assert.equal(publish({ dir, file, phase: 'a0', skill: 'red-verify', workflowVersion: V, pr: 0 }).reason, 'pr-invalid')
  assert.equal(existsSync(join(dir, 'a0-red-verify.json')), false)
  // the CLI spelling
  const r = spawnSync('node', [CLI, 'publish', '--dir', dir, '--file', file, '--phase', 'a0', '--skill', 'red-verify', '--workflowVersion', V, '--predecessor', 'a0-red-spec', '--pr', '483'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(JSON.parse(readFileSync(join(dir, 'a0-red-verify.json'), 'utf8')).pr, 483)
  // and resolve now knows the PR from the envelope alone
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr' }).next.pr, 483)
  rmSync(dir, { recursive: true, force: true })
})

test('resolve (t9-2): the tier reviewer count is honoured by the transition authority — a partial or first-of-two review dispatches reviewer 2 on the same phase; only the last reviewer can complete the cycle', () => {
  const { dir } = runDir()
  const two = { ...POLICY, reviewers: 2 }
  review(dir, 'r0', { partial: true, reviewer: 1, readiness: { ready: true, remoteHead: SHA('c') } })
  let r = resolve({ dir, workflowVersion: V, policy: two, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, phase: r.next.phase, reviewer: r.next.reviewer, attempt: r.next.attempt, mode: r.next.mode }, { step: 'verify', phase: 'r0', reviewer: 2, attempt: 2, mode: 'first' })
  // a lone review that forgot `partial` is still one of two — the count is the policy's, not the reviewer's word
  const { dir: d2 } = runDir()
  review(d2, 'r0', { readiness: { ready: true, remoteHead: SHA('c') } })
  r = resolve({ dir: d2, workflowVersion: V, policy: two, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, reviewer: r.next.reviewer }, { step: 'verify', reviewer: 2 })
  // reviewer 2 (attempt 2, not partial) completes it
  handoff(dir, 'r0', 'review-phase', { attempt: 2, reviewer: 2, partial: false, reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') }, mode: 'first' })
  r = resolve({ dir, workflowVersion: V, policy: two, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'done')
  // with one reviewer a partial review can never complete either
  const { dir: d3 } = runDir()
  review(d3, 'r0', { partial: true, readiness: { ready: true, remoteHead: SHA('c') } })
  assert.notEqual(resolve({ dir: d3, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).next.step, 'done')
})

test('resolve (t9-3): readiness is proven only by a 40-hex remoteHead equal to the reviewed head — an omitted or different remoteHead is a re-verification, never `done`', () => {
  const { dir } = runDir()
  review(dir, 'r0', { readiness: { ready: true } })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'verify')
  assert.equal(r.next.mode, 're-review')
  const { dir: d2 } = runDir()
  review(d2, 'r0', { readiness: { ready: true, remoteHead: SHA('d') } })
  r = resolve({ dir: d2, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, headMoved: r.next.headMoved }, { step: 'verify', headMoved: true })
  const { dir: d3 } = runDir()
  review(d3, 'r0', { readiness: { ready: true, remoteHead: SHA('c') } })
  assert.equal(resolve({ dir: d3, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).next.step, 'done')
})

test('resolve (t9-4): two groups each with an approved test failing return to GREEN group by group on their own seals — never a fresh remediation contract — then one re-review of both', () => {
  const { dir } = runDir()
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2', { location: 'src/b.ts:1' })] })
  const plan = { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }, { groupId: 'r1-g2', findings: ['r0-2'], owner: 'b', mode: 'behavioral', allowedPaths: ['src/b.ts'] }], carried: [] }
  redSpec(dir, 'r1-g1', { plan, groupId: 'r1-g1' })
  redVerify(dir, 'r1-g1', { snapshot: SHA('1') })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [] })
  redSpec(dir, 'r1-g2', { groupId: 'r1-g2' })
  redVerify(dir, 'r1-g2', { snapshot: SHA('2') })
  handoff(dir, 'r1-g2', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('e'), evidenceLedger: [] })
  review(dir, 'r1', { mode: 're-review', readiness: { ready: false }, reviewedHead: SHA('e'), findings: [finding('r0-1', { kind: 'approved-test-failing', groupId: 'r1-g1', rowId: 'row-1' }), finding('r0-2', { kind: 'approved-test-failing', groupId: 'r1-g2', rowId: 'row-1', location: 'src/b.ts:1' })] })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, phase: r.next.phase, attempt: r.next.attempt, snapshot: r.next.contract.snapshot, ids: r.next.findings.map(f => f.id) }, { step: 'green', phase: 'r1-g1', attempt: 2, snapshot: SHA('1'), ids: ['r0-1'] })
  handoff(dir, 'r1-g1', 'green-fix', { attempt: 2, fixed: true, needsHumanDecision: false, outputHead: SHA('f'), evidenceLedger: [] })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, phase: r.next.phase, attempt: r.next.attempt, snapshot: r.next.contract.snapshot, ids: r.next.findings.map(f => f.id) }, { step: 'green', phase: 'r1-g2', attempt: 2, snapshot: SHA('2'), ids: ['r0-2'] })
  handoff(dir, 'r1-g2', 'green-fix', { attempt: 2, fixed: true, needsHumanDecision: false, outputHead: SHA('9'), evidenceLedger: [] })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, phase: r.next.phase, attempt: r.next.attempt, openIds: r.next.openIds }, { step: 'verify', phase: 'r1', attempt: 2, openIds: ['r0-1', 'r0-2'] })
})

test('publish stamps the canonical card hash itself (cardHash via gh): the agent value is replaced and the source marked; when gh fails the agent value is kept aside as unverified and nothing is comparable', () => {
  assert.deepEqual(cardHash({ story: '42' }), { acHash: CARD_HASH(42) })
  assert.match(cardHash({ story: '' }).error, /story-missing/)
  const { dir } = runDir()
  const file = join(dir, 'd.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', contractPath: '/x', contractHash: `sha256:${'1'.repeat(64)}`, acHash: 'whatever the agent typed' }))
  assert.equal(publish({ dir, file, phase: 'a0', skill: 'red-spec', workflowVersion: V }).published, true)
  const w = JSON.parse(readFileSync(join(dir, 'a0-red-spec.json'), 'utf8'))
  assert.deepEqual({ acHash: w.acHash, source: w.acHashSource }, { acHash: CARD_HASH(42), source: 'publish' })
  // gh down: the value is not comparable evidence
  process.env.FAKE_GH_FAIL = '1'
  try {
    writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'red-verify', inputHead: SHA('a'), verified: true, findings: [], sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}`, acHash: `sha256:${'a'.repeat(64)}` }))
    assert.equal(publish({ dir, file, phase: 'a0', skill: 'red-verify', workflowVersion: V, predecessor: 'a0-red-spec' }).published, true)
    const v = JSON.parse(readFileSync(join(dir, 'a0-red-verify.json'), 'utf8'))
    assert.deepEqual({ acHash: v.acHash, source: v.acHashSource, unverified: v.acHashUnverified }, { acHash: undefined, source: undefined, unverified: `sha256:${'a'.repeat(64)}` })
  } finally {
    delete process.env.FAKE_GH_FAIL
  }
  // a handoff without any acHash never calls gh
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'implement-phase', inputHead: SHA('a'), status: 'ok', prNumber: 7, outputHead: SHA('c'), gatesPassed: true }))
  assert.equal(publish({ dir, file, phase: 'a0', skill: 'implement-phase', workflowVersion: V, ghBin: '/nonexistent/gh' }).published, true)
})

test('readHandoffs ignores contracts, drafts, locks and the attempt suffix is parsed back', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0')
  writeFileSync(join(dir, 'a0-red-contract.json'), '{}')
  writeFileSync(join(dir, 'draft.json'), '{}')
  mkdirSync(join(dir, '.lock'))
  const list = readHandoffs(dir)
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'a0-red-spec')
  assert.equal(list[0].attempt, 1)
  rmSync(join(dir, '.lock'), { recursive: true })
  publish({ dir, file: writeDraft(dir, { run: 'run-1', story: '42', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', contractPath: '/x', contractHash: 'sha256:' + '1'.repeat(64) }), phase: 'a0', skill: 'red-spec', workflowVersion: V, attempt: 2 })
  const two = readHandoffs(dir)
  assert.deepEqual(two.map(h => h.attempt), [1, 2])
})
