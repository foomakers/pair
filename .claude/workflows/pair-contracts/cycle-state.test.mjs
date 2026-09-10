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
if (a[0] === 'api') {
  const m = /issues\\/comments\\/(\\d+)$/.exec(a[1] || '')
  if (m) {
    const comments = JSON.parse(process.env.FAKE_GH_COMMENTS_JSON || '{}')
    const c = comments[m[1]]
    if (!c) { process.stderr.write('HTTP 404'); process.exit(1) }
    process.stdout.write(JSON.stringify(c)); process.exit(0)
  }
}
process.stderr.write('unexpected gh call: ' + a.join(' ')); process.exit(1)
`)
_ch(_join(FAKE_GH_DIR, 'gh'), 0o755)
process.env.PAIR_GH_BIN = _join(FAKE_GH_DIR, 'gh')
const CARD_HASH = n => 'sha256:' + _hash('sha256').update('card body of #' + n).digest('hex')

// A SECOND, stateful fake `gh` for Finding 6 (US-479 T-28, S5 real effects): unlike the fixed-string
// fake above, this one actually persists issue bodies/creations across calls (via a JSON state file),
// so a test can prove a real update+readback happened — not merely that a label was set. It also
// answers the same `api .../comments/<id>` shape the fixed fake does, reading the same env var, so a
// single ghBin serves the whole applyScopeDecisions call (comment read + card write/create).
const newFakeGh2 = () => {
  const dir = _mk(_join(_tmp(), 'fake-gh2-'))
  const ghBin = _join(dir, 'gh')
  const stateFile = _join(dir, 'state.json')
  const logFile = _join(dir, 'calls.log')
  _wf(stateFile, JSON.stringify({ issues: {}, next: 9000 }))
  _wf(logFile, '')
  _wf(ghBin, `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(a) + '\\n')
const stateFile = ${JSON.stringify(stateFile)}
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state))
const idOf = ref => { const m = /\\/issues\\/(\\d+)$/.exec(String(ref)); return m ? m[1] : String(ref) }
const repoIdx = a.indexOf('--repo')
const repo = repoIdx !== -1 ? a[repoIdx + 1] : (process.env.FAKE_GH2_REPO || 'foomakers/pair')
if (a[0] === 'api') {
  const m = /issues\\/comments\\/(\\d+)$/.exec(a[1] || '')
  if (m) {
    const comments = JSON.parse(process.env.FAKE_GH_COMMENTS_JSON || '{}')
    const c = comments[m[1]]
    if (!c) { process.stderr.write('HTTP 404'); process.exit(1) }
    process.stdout.write(JSON.stringify(c)); process.exit(0)
  }
  process.stderr.write('unexpected api call'); process.exit(1)
}
if (a[0] === 'issue' && a[1] === 'view') {
  if (process.env.FAKE_GH2_FAIL_VIEW) { process.stderr.write('HTTP 502 (simulated transient view failure)'); process.exit(1) }
  const failAt = process.env.FAKE_GH2_FAIL_VIEW_CALL_INDEX ? Number(process.env.FAKE_GH2_FAIL_VIEW_CALL_INDEX) : null
  if (failAt) {
    const viewCallsSoFar = fs.readFileSync(${JSON.stringify(logFile)}, 'utf8').trim().split('\\n').filter(Boolean).map(l => JSON.parse(l)).filter(x => x[0] === 'issue' && x[1] === 'view').length
    if (viewCallsSoFar === failAt) { process.stderr.write('HTTP 502 (simulated view failure #' + viewCallsSoFar + ')'); process.exit(1) }
  }
  const id = idOf(a[2])
  const issue = state.issues[id]
  if (!issue) { process.stderr.write('HTTP 404 issue not found: ' + id); process.exit(1) }
  const qIdx = a.indexOf('-q')
  if (qIdx !== -1 && a[qIdx + 1] === '.body') { process.stdout.write(issue.body); process.exit(0) }
  const jsonIdx = a.indexOf('--json')
  const fields = jsonIdx !== -1 ? a[jsonIdx + 1].split(',') : ['number', 'url', 'title', 'body']
  const out = {}
  for (const f of fields) out[f] = f === 'number' ? Number(id) : f === 'url' ? \`https://github.com/\${repo}/issues/\${id}\` : issue[f]
  process.stdout.write(JSON.stringify(out)); process.exit(0)
}
if (a[0] === 'issue' && a[1] === 'edit') {
  const id = idOf(a[2])
  if (!state.issues[id]) { process.stderr.write('HTTP 404 issue not found: ' + id); process.exit(1) }
  const bodyIdx = a.indexOf('--body')
  if (bodyIdx !== -1) state.issues[id].body = a[bodyIdx + 1]
  save()
  process.stdout.write(\`https://github.com/\${repo}/issues/\${id}\`); process.exit(0)
}
if (a[0] === 'issue' && a[1] === 'create') {
  const titleIdx = a.indexOf('--title')
  const bodyIdx = a.indexOf('--body')
  if (process.env.FAKE_GH2_FAIL_CREATE) { process.stderr.write('HTTP 502 (simulated create failure)'); process.exit(1) }
  const id = state.next++
  state.issues[id] = { title: titleIdx !== -1 ? a[titleIdx + 1] : '', body: bodyIdx !== -1 ? a[bodyIdx + 1] : '' }
  save()
  if (process.env.FAKE_GH2_LOSE_CREATE_RESPONSE) { process.stderr.write('connection reset (simulated lost response — the issue WAS created)'); process.exit(1) }
  process.stdout.write(\`https://github.com/\${repo}/issues/\${id}\\n\`); process.exit(0)
}
if (a[0] === 'issue' && a[1] === 'list') {
  const searchIdx = a.indexOf('--search')
  const needle = searchIdx !== -1 ? a[searchIdx + 1] : ''
  const rows = Object.entries(state.issues)
    .filter(([, iss]) => typeof iss.body === 'string' && iss.body.includes(needle))
    .map(([id, iss]) => ({ number: Number(id), url: \`https://github.com/\${repo}/issues/\${id}\`, title: iss.title, body: iss.body }))
  process.stdout.write(JSON.stringify(rows)); process.exit(0)
}
process.stderr.write('unexpected gh call: ' + a.join(' ')); process.exit(1)
`)
  _ch(ghBin, 0o755)
  return {
    ghBin,
    seed: (number, body, title = '') => {
      const s = JSON.parse(readFileSync(stateFile, 'utf8'))
      s.issues[number] = { body, title }
      writeFileSync(stateFile, JSON.stringify(s))
    },
    body: number => JSON.parse(readFileSync(stateFile, 'utf8')).issues[number]?.body,
    issue: number => JSON.parse(readFileSync(stateFile, 'utf8')).issues[number],
    allIssues: () => JSON.parse(readFileSync(stateFile, 'utf8')).issues,
    calls: () => readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)),
  }
}
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { SCHEMA_VERSION, METRICS_SCHEMA_VERSION, FINDING_TRANSITIONS, RECORD_TYPES, SCOPE_CHANGE_TYPES, SCOPE_CHANGE_STATUSES, NEW_PUBLIC_STATUSES, SCOPE_DECISION_ACTIONS, deriveNext, publish, resolve, readHandoffs, contractHash, inputsDigest, testIdentity, compatible, cardHash, migrateInspect, cycleCounters, scopeBaselineHashOf, parseScopeDecisionComment, applyScopeDecisions } from '../../skills/pair-workflow-red-spec/scripts/cycle-state.mjs'

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
function handoff(dir, phase, skill, fields, { pr = 7, predecessor, attempt } = {}) {
  const file = join(dir, `tmp-${phase}-${skill}.json`)
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

test('resolve: a preparation refused for an EXTERNAL cause (dirty worktree, moved head) is retryable once the cause is cleared — the same phase, next attempt — and a second identical refusal is terminal; a refusal the cycle owns (unprovable, split-required) is terminal at once (canary v4 run 17)', () => {
  const { dir } = runDir()
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')] })
  redSpec(dir, 'r1-g1', { status: 'dirty', reason: 'one dirty path this attempt does not own', preserved: ['src/a.test.ts'], contractPath: undefined, contractHash: undefined })
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, phase: r.next.phase, mode: r.next.mode, attempt: r.next.attempt }, { step: 'prepare', phase: 'r1-g1', mode: 'remediation', attempt: 2 })
  assert.match(r.next.detail, /dirty/)
  // still dirty on the retry ⇒ terminal, the cause is not going away by itself
  handoff(dir, 'r1-g1', 'red-spec', { status: 'dirty', mode: 'remediation', reason: 'still dirty', preserved: ['src/a.test.ts'] }, { attempt: 2 })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, reason: r.next.reason, refusal: r.next.refusal }, { step: 'blocked', reason: 'failed-preparation', refusal: 'dirty' })
  // a stale head is the same class
  const { dir: d2 } = runDir()
  redSpec(d2, 'a0', { status: 'stale', reason: 'HEAD moved', contractPath: undefined, contractHash: undefined })
  assert.equal(resolve({ dir: d2, workflowVersion: V, policy: POLICY, entry: 'fresh' }).next.attempt, 2)
  // a refusal the cycle owns is terminal immediately — retrying it would only repeat the judgment
  for (const status of ['unprovable', 'split-required']) {
    const { dir: d3 } = runDir()
    redSpec(d3, 'a0', { status, reason: 'no authority', contractPath: undefined, contractHash: undefined })
    const rr = resolve({ dir: d3, workflowVersion: V, policy: POLICY, entry: 'fresh' })
    assert.deepEqual({ step: rr.next.step, reason: rr.next.reason, refusal: rr.next.refusal }, { step: 'blocked', reason: 'failed-preparation', refusal: status })
  }
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

// ── US-479 T-19: schema 3 / workflow 4.0.0 / metrics schema 1 (DT-11/12/17/33) ─────────────
test('T-19: schema is pinned at 3, metrics view at 1, and the new non-ready statuses are exactly the four ADR-024-amendment ones', () => {
  assert.equal(SCHEMA_VERSION, 3)
  assert.equal(METRICS_SCHEMA_VERSION, 1)
  assert.deepEqual([...NEW_PUBLIC_STATUSES].sort(), ['abandoned', 'awaiting-scope-decision', 'failed-publication', 'interrupted'])
})

test('T-19 (DT-11/12): a handoff whose scope/finding/record-type fields disagree with the schema-3 taxonomy is refused BEFORE the write — never accepted and reconciled later', () => {
  const { dir } = runDir()
  const base = { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', contractPath: '/x', contractHash: `sha256:${'1'.repeat(64)}` }
  const bad = (extra, match) => {
    const f = writeDraft(dir, { ...base, ...extra })
    const out = publish({ dir, file: f, phase: 'a0', skill: 'red-spec', workflowVersion: V })
    assert.equal(out.published, false, JSON.stringify(extra))
    assert.match(out.reason, match, JSON.stringify(extra))
    assert.equal(existsSync(join(dir, 'a0-red-spec.json')), false)
  }
  bad({ scopeEpoch: 0 }, /scopeEpoch-invalid/)
  bad({ scopeEpoch: 1.5 }, /scopeEpoch-invalid/)
  bad({ scopeBaselineHash: 'not-a-hash' }, /scopeBaselineHash-invalid/)
  bad({ firstReviewHead: 'zzz' }, /firstReviewHead-invalid/)
  bad({ remediationBatchId: '' }, /remediationBatchId-invalid/)
  bad({ recordType: 'planning' }, /recordType-invalid:planning/)
  bad({ findings: [{ id: 'r0-1', transition: 'discarded' }] }, /finding-transition-invalid:r0-1/)
  bad({ scopeChanges: [{ id: 'sc-1', type: 'defect' }] }, /scopeChange-type-invalid:sc-1/)
  bad({ scopeChanges: [{ id: 'sc-1', type: 'new-requirement', status: 'accepted' }] }, /scopeChange-status-invalid:sc-1/)
  // A new-scope proposal can NEVER carry severity or nonActionable — that vocabulary is findings-only (S2)
  bad({ scopeChanges: [{ id: 'sc-1', type: 'new-requirement', severity: 'Minor' }] }, /scopeChange-severity-forbidden:sc-1/)
  bad({ scopeChanges: [{ id: 'sc-1', type: 'new-requirement', nonActionable: true }] }, /scopeChange-nonActionable-forbidden:sc-1/)
  // Valid schema-3 fields publish cleanly
  const ok = writeDraft(dir, { ...base, scopeEpoch: 1, scopeBaselineHash: `sha256:${'2'.repeat(64)}`, recordType: 'judgment', findings: [{ id: 'r0-1', transition: 'open' }], scopeChanges: [{ id: 'sc-1', type: 'new-requirement', status: 'pending' }] })
  assert.equal(publish({ dir, file: ok, phase: 'a0', skill: 'red-spec', workflowVersion: V }).published, true)
})

test('T-19 (DT-33): migrate-inspect reads schema-2 evidence read-only — it never rewrites, and reports compatible/legacy/ambiguous evidence without inventing counters', () => {
  const { dir } = runDir()
  assert.deepEqual(migrateInspect({ dir: join(dir, 'missing') }), { compatibleEvidenceRefs: [], missingDimensions: ['no-run-directory'], ambiguity: [], next: 'fresh-cycle' })
  // an empty existing directory has nothing to resume and nothing to migrate
  assert.deepEqual(migrateInspect({ dir }), { compatibleEvidenceRefs: [], missingDimensions: [], ambiguity: [], next: 'fresh-cycle' })
  // legacy schema-2 evidence only: migration acknowledgment required, missing dimensions named, nothing rewritten
  writeFileSync(join(dir, 'r0-review-phase.json'), JSON.stringify({ run: 'run-1', story: '42', phase: 'r0', skill: 'review-phase', schemaVersion: 2, workflowVersion: '3.0.13', reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [] }))
  const before = readFileSync(join(dir, 'r0-review-phase.json'), 'utf8')
  const legacy = migrateInspect({ dir })
  assert.deepEqual(legacy, { compatibleEvidenceRefs: [], missingDimensions: ['scopeEpoch', 'scopeBaselineHash', 'findings-origin'], ambiguity: [], next: 'migration-acknowledgment-required' })
  assert.equal(readFileSync(join(dir, 'r0-review-phase.json'), 'utf8'), before, 'migrate-inspect never rewrites the evidence it reads')
  // current-schema evidence resumes normally
  const { dir: d2 } = runDir()
  redSpec(d2, 'a0')
  assert.deepEqual(migrateInspect({ dir: d2 }).next, 'resume')
  // a malformed handoff is reported as ambiguity, not silently skipped or coerced
  const { dir: d3 } = runDir()
  writeFileSync(join(d3, 'a0-red-spec.json'), '{not json')
  assert.equal(migrateInspect({ dir: d3 }).next, 'blocked')
  assert.match(migrateInspect({ dir: d3 }).ambiguity[0], /not-json/)
  // the CLI spelling
  const r = spawnSync('node', [CLI, 'migrate-inspect', '--dir', d2], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(JSON.parse(r.stdout).next, 'resume')
})

// ── US-479 T-22: separate scope queue, developer decision gate (DT-12..17/27) ─────────────
const scopeChange = (id, extra = {}) => ({ id, type: 'new-requirement', proposal: `proposal text for ${id}`, status: 'pending', discoveredAtReviewId: 'r0', baselineEvidenceRefs: [], ...extra })
const setComments = map => {
  process.env.FAKE_GH_COMMENTS_JSON = JSON.stringify(map)
}
const decisionBody = (decisions, hash) => '```json\n' + JSON.stringify({ schemaVersion: 1, scopeBaselineHash: hash, decisions }) + '\n```'
const comment = (login, body, { type = 'User', issue = 7 } = {}) => ({ user: { login, type }, issue_url: `https://api.github.com/repos/foomakers/pair/issues/${issue}`, body })

test('T-22 (DT-12/13): a technically converged review with pending scope proposals returns awaiting-scope-decision, never `done` and never a fix plan/severity count for the proposals', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1'), scopeChange('sc-2')] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.status, 'blocked')
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.reason, 'awaiting-scope-decision')
  assert.equal(r.next.qualityState, 'converged')
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1', 'sc-2'])
  // a real Major defect present too: the proposals never enter the fix plan and the round still
  // remediates the defect first — quality convergence gates scope, not the reverse
  const { dir: d2 } = runDir()
  review(d2, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')], scopeChanges: [scopeChange('sc-1')] })
  const r2 = resolve({ dir: d2, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r2.next.step, 'prepare')
  assert.equal(r2.next.mode, 'remediation')
  assert.equal(r2.next.findings.every(f => !f.id.startsWith('sc-')), true, 'no scope proposal id ever enters a fix plan')
})

test('T-22 (DT-14): an authenticated ignore decision preserves quality evidence, records the rationale, never touches source/severity — readiness follows once every proposal is dispositioned', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const pending = [scopeChange('sc-1')]
  const hash = scopeBaselineHashOf(pending)
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-501'
  setComments({ 501: comment('rucka', decisionBody([{ id: 'sc-1', action: 'ignore', rationale: 'already covered by AC-3' }], hash)) })
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V })
  assert.equal(out.applied, true, JSON.stringify(out))
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.status, 'completed')
  assert.equal(r.next.step, 'done')
  const written = JSON.parse(readFileSync(join(dir, 'r0-review-phase.attempt-2.json'), 'utf8'))
  assert.equal(written.recordType, 'decision')
  assert.deepEqual({ status: written.scopeChanges[0].status, rationale: written.scopeChanges[0].decisionRationale }, { status: 'ignored', rationale: 'already covered by AC-3' })
  // idempotent: the SAME decisionRef replayed is a no-op, never a second handoff
  const again = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V })
  assert.deepEqual(again, { applied: true, reason: 'already-applied' })
  assert.equal(existsSync(join(dir, 'r0-review-phase.attempt-3.json')), false)
})

test('T-22 (DT-16 / Finding 6 fix): extend-current-card names exact new AC, bumps scopeEpoch exactly once and opens a targeted remediation round on the SAME cycle — resolved AC are not re-litigated', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-502'
  setComments({ 502: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-99', description: 'the new requirement' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'original card body for #42')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  // Finding 6 (reported reproduction): the prior implementation marked 'extended' and bumped
  // scopeEpoch WITHOUT ever touching the real card. Here the card body is a real, separately
  // seeded artifact behind a stateful fake `gh` — proving the AC was actually written, read back,
  // and confirmed, not merely labeled.
  const updatedBody = gh2.body('42')
  assert.match(updatedBody, /AC-99/)
  assert.match(updatedBody, /the new requirement/)
  assert.match(updatedBody, /original card body for #42/, 'the update extends the card, it does not replace it')
  const editCalls = gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit')
  assert.equal(editCalls.length, 1, 'exactly one real gh issue edit call, not a simulated one')
  let r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, round: r.next.round }, { step: 'prepare', mode: 'remediation', phase: 'r1-g1', round: 1 })
  assert.deepEqual(r.next.findings.map(f => f.id), ['AC-99'])
  assert.equal(r.next.scopeEpoch, 2)
  // a repeated resolve before red-spec responds is idempotent — same next, no duplicate dispatch
  const r2 = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r2.next, r.next)
  // once red-spec starts the round, resolve stops re-offering the extension trigger
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['AC-99'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1' }, { predecessor: 'r0-review-phase.attempt-2' })
  r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'validate')
})

test('T-22 (DT-17): bot comments, an unauthorized login, a stale baseline, a duplicate id and an unknown action are all refused — a partial decision leaves the undecided proposal pending', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1'), scopeChange('sc-2')] })
  const pending = [scopeChange('sc-1'), scopeChange('sc-2')]
  const hash = scopeBaselineHashOf(pending)
  const attempt = (id, c, extra = {}) => applyScopeDecisions({ dir, decisionRef: `https://github.com/foomakers/pair/pull/7#issuecomment-${id}`, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ...extra })
  setComments({
    601: comment('some-bot[bot]', decisionBody([{ id: 'sc-1', action: 'ignore', rationale: 'x' }], hash), { type: 'Bot' }),
    602: comment('random-user', decisionBody([{ id: 'sc-1', action: 'ignore', rationale: 'x' }], hash)),
    603: comment('rucka', decisionBody([{ id: 'sc-1', action: 'ignore', rationale: 'x' }], 'sha256:' + '0'.repeat(64))),
    604: comment('rucka', decisionBody([{ id: 'sc-1', action: 'ignore', rationale: 'a' }, { id: 'sc-1', action: 'ignore', rationale: 'b' }], hash)),
    605: comment('rucka', decisionBody([{ id: 'sc-1', action: 'waive' }], hash)),
    606: comment('rucka', decisionBody([{ id: 'sc-1', action: 'ignore', rationale: 'only this one, sc-2 stays pending' }], hash)),
  })
  assert.equal(attempt(601).applied, false)
  assert.equal(attempt(601).reason, 'author-not-a-user')
  assert.equal(attempt(602).applied, false)
  assert.match(attempt(602).reason, /author-not-authorized/)
  assert.equal(attempt(603).applied, false)
  assert.equal(attempt(603).reason, 'stale-baseline')
  assert.equal(attempt(604).applied, false)
  assert.match(attempt(604).reason, /duplicate-id/)
  assert.equal(attempt(605).applied, false)
  assert.match(attempt(605).reason, /unknown-action/)
  // none of the rejected attempts wrote anything
  assert.equal(readHandoffs(dir).filter(h => h.skill === 'review-phase').length, 1)
  const partial = attempt(606)
  assert.equal(partial.applied, true, JSON.stringify(partial))
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.reason, 'awaiting-scope-decision')
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-2'])
})

test('Finding 6 RED->GREEN (reported reproduction): new-card must NOT defer from approvedDelta alone — an approvedDelta with no title is not an explicit authorization to create, and stays pending', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-701'
  // No targetIssueUrl, no title — exactly the previously-accepted shape that used to mark 'deferred'.
  setComments({ 701: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'x' }] } }], hash)) })
  const gh2 = newFakeGh2()
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.equal(out.reason, 'no-decision-applied')
  assert.equal(out.results[0].reason, 'payload-insufficient')
  assert.deepEqual(gh2.allIssues(), {}, 'no card was created or verified for an insufficient payload')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'], 'sc-1 stays pending — never silently deferred')
})

test('Finding 6: new-card with an existing targetIssueUrl is VERIFIED through a real gh issue view before deferring — an unverifiable or cross-repo url is refused, a verified one is trusted', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1'), scopeChange('sc-2')] })
  const gh2 = newFakeGh2()
  gh2.seed('480', 'a pre-existing follow-up card')
  // sc-1: points at a real, verified issue in the same repo → deferred with the read-back url
  {
    const hash = scopeBaselineHashOf([scopeChange('sc-1'), scopeChange('sc-2')])
    setComments({ 702: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', targetIssueUrl: 'https://github.com/foomakers/pair/issues/480' }], hash)) })
    const out = applyScopeDecisions({ dir, decisionRef: 'https://github.com/foomakers/pair/pull/7#issuecomment-702', repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
    assert.equal(out.applied, true, JSON.stringify(out))
    assert.equal(out.results[0].status, 'deferred')
    assert.equal(out.results[0].targetIssueUrl, 'https://github.com/foomakers/pair/issues/480')
    const viewCalls = gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'view' && c[2] === 'https://github.com/foomakers/pair/issues/480')
    assert.equal(viewCalls.length, 1, 'a real gh issue view verified the target, it was not merely copied from the comment')
  }
  // sc-2: points at an issue that does not exist → refused, sc-2 stays pending
  {
    const stillPending = [scopeChange('sc-2')]
    const hash2 = scopeBaselineHashOf(stillPending)
    setComments({ 703: comment('rucka', decisionBody([{ id: 'sc-2', action: 'new-card', targetIssueUrl: 'https://github.com/foomakers/pair/issues/999999' }], hash2)) })
    const out2 = applyScopeDecisions({ dir, decisionRef: 'https://github.com/foomakers/pair/pull/7#issuecomment-703', repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
    assert.equal(out2.applied, false, JSON.stringify(out2))
    assert.match(out2.results[0].reason, /gh-issue-view-failed/)
    const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
    assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-2'])
  }
})

test('Finding 6: new-card with explicit authorization (an approved title + AC, no existing targetIssueUrl) creates the destination card for real and reads it back before deferring', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-704'
  const approvedDelta = { title: 'Follow-up: sc-1 out-of-scope requirement', ac: [{ id: 'AC-1', description: 'the deferred requirement' }] }
  setComments({ 704: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  assert.equal(out.results[0].status, 'deferred')
  assert.match(out.results[0].targetIssueUrl, /^https:\/\/github\.com\/foomakers\/pair\/issues\/\d+$/)
  const created = Object.values(gh2.allIssues())[0]
  assert.equal(created.title, approvedDelta.title, 'the real created issue carries the approved title, not an agent-chosen one')
  assert.match(created.body, /AC-1/)
  assert.match(created.body, /the deferred requirement/)
  const createCalls = gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'create')
  assert.equal(createCalls.length, 1, 'exactly one real gh issue create call')
})

// ── Finding 6 residual: extend-current-card must match AC by EXACT id, never independent substring ──
test('Finding 6 residual RED->GREEN (reported reproduction): a description already sitting under a DIFFERENT id must not be mistaken for the approved AC — the targeted id is replaced, the other id is untouched', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-801'
  setComments({ 801: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'comportamento nuovo' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: comportamento vecchio\nAC-2: comportamento nuovo')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.match(body, /AC-1\*\*: comportamento nuovo|AC-1: comportamento nuovo/, 'AC-1 now carries the approved description')
  assert.doesNotMatch(body, /vecchio/, 'the old AC-1 definition is REPLACED, not left dangling alongside the new one')
  assert.match(body, /AC-2.*comportamento nuovo|comportamento nuovo.*\n.*AC-2/s)
  const ac2Lines = body.split('\n').filter(l => l.includes('AC-2'))
  assert.equal(ac2Lines.length, 1)
  assert.match(ac2Lines[0], /comportamento nuovo/, 'AC-2 is untouched — it always said this')
})

test('Finding 6 residual: an id sharing a common prefix (AC-1 vs AC-10) is never conflated — only the exact targeted id is replaced', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-802'
  setComments({ 802: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'updated' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: old\nAC-10: something else entirely')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.match(body, /AC-10: something else entirely/, 'AC-10 must survive completely untouched')
  const ac1Line = body.split('\n').find(l => /^AC-1[:*\s-]/.test(l) || l.includes('**AC-1**'))
  assert.match(ac1Line, /updated/)
  assert.doesNotMatch(ac1Line ?? '', /AC-10/)
})

test('Finding 6 residual: one decision that both REPLACES an existing AC and ADDS a genuinely new one applies both correctly, in one real edit, leaving an unrelated third AC byte-identical', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-803'
  setComments({ 803: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'replaced text' }, { id: 'AC-99', description: 'brand new requirement' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: original text\nAC-5: never touched by this decision')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.doesNotMatch(body, /original text/)
  assert.match(body, /replaced text/)
  assert.match(body, /AC-99.*brand new requirement/)
  assert.match(body, /AC-5: never touched by this decision/, 'a THIRD, uninvolved AC survives byte-identical')
})

test('Finding 6 residual: retry — a second decision approving the SAME (id, description) the card already carries is applied without a second real edit call', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1'), scopeChange('sc-2')] })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: old')
  const hash1 = scopeBaselineHashOf([scopeChange('sc-1'), scopeChange('sc-2')])
  setComments({ 804: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'new text' }] } }], hash1)) })
  const out1 = applyScopeDecisions({ dir, decisionRef: 'https://github.com/foomakers/pair/pull/7#issuecomment-804', repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out1.applied, true, JSON.stringify(out1))
  const editCallsAfterFirst = gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length
  assert.equal(editCallsAfterFirst, 1)
  // sc-2, a DIFFERENT decision, approves the exact same (id, description) — already satisfied
  const stillPending = [scopeChange('sc-2')]
  const hash2 = scopeBaselineHashOf(stillPending)
  setComments({ 805: comment('rucka', decisionBody([{ id: 'sc-2', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'new text' }] } }], hash2)) })
  const out2 = applyScopeDecisions({ dir, decisionRef: 'https://github.com/foomakers/pair/pull/7#issuecomment-805', repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out2.applied, true, JSON.stringify(out2))
  const editCallsAfterSecond = gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length
  assert.equal(editCallsAfterSecond, 1, 'the card already satisfied AC-1 — no second real edit was issued')
})

test('Finding 6 residual: an id the card carries MORE THAN ONCE is ambiguous — refused outright, never guessed, never marked extended', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-806'
  setComments({ 806: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'resolved' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: first definition\nAC-1: second, conflicting definition')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /ambiguous-ac-id:AC-1/)
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0, 'an ambiguous card is never edited')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'], 'stays pending — never silently marked extended')
})

test('Finding 6 residual: a readback that does not confirm the approved id/description is refused — the decision is never marked extended on an edit that did not really take', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-807'
  setComments({ 807: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'the approved text' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: old text')
  // view #1 reads the current body (succeeds); view #2 is the CONFIRMING readback after the edit —
  // that one fails, never the initial read and never the edit itself.
  process.env.FAKE_GH2_FAIL_VIEW_CALL_INDEX = '2'
  let out
  try {
    out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_FAIL_VIEW_CALL_INDEX
  }
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /gh-issue-view-readback-failed/)
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 1, 'the edit itself DID happen — only its confirmation failed')
})

// ── Finding 6 residual: new-card creation is idempotent across a lost response / failed publish ──
test('Finding 6 residual RED->GREEN (reported reproduction): a create whose LOCAL response is lost (the issue really was created remotely) reconciles onto that SAME issue — never a second card', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-810'
  const approvedDelta = { title: 'Follow-up for sc-1', ac: [{ id: 'AC-1', description: 'deferred requirement' }] }
  setComments({ 810: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  process.env.FAKE_GH2_LOSE_CREATE_RESPONSE = '1'
  let out
  try {
    out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_LOSE_CREATE_RESPONSE
  }
  assert.equal(out.applied, true, JSON.stringify(out), 'the create actually landed remotely — reconciliation recovers it within this same attempt')
  assert.equal(Object.keys(gh2.allIssues()).length, 1, 'exactly ONE issue exists — the lost response never caused a second create')
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'create').length, 1)
})

test('Finding 6 residual: a transient readback failure right after a real create recovers on retry onto the SAME issue — never a second create call', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-811'
  const approvedDelta = { title: 'Follow-up for sc-1 (readback flake)', ac: [{ id: 'AC-1', description: 'x' }] }
  setComments({ 811: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  process.env.FAKE_GH2_FAIL_VIEW = '1'
  let first
  try {
    first = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_FAIL_VIEW
  }
  assert.equal(first.applied, false, JSON.stringify(first), 'the confirming readback failed — not applied yet')
  assert.equal(Object.keys(gh2.allIssues()).length, 1, 'the create itself DID land')
  const second = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(second.applied, true, JSON.stringify(second))
  assert.equal(Object.keys(gh2.allIssues()).length, 1, 'still exactly one issue — the retry reconciled, it did not create another')
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'create').length, 1)
})

test('Finding 6 residual RED->GREEN (reported reproduction): the remote effect succeeds but the ENCLOSING publish fails (a held lock) — a real restart-and-retry reuses the SAME created issue, never a second one, and the decision completes on retry', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-812'
  const approvedDelta = { title: 'Follow-up for sc-1 (publish flake)', ac: [{ id: 'AC-1', description: 'x' }] }
  setComments({ 812: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  const lockDir = join(dir, '.lock')
  mkdirSync(lockDir)
  try {
    const first = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin, lockWaitMs: 50 })
    assert.equal(first.applied, false, JSON.stringify(first))
    assert.equal(Object.keys(gh2.allIssues()).length, 1, 'the card WAS created for real before the publish lock was even hit')
  } finally {
    rmdirSync(lockDir)
  }
  // a genuine SECOND call — restart and retry of the SAME decision, lock now released
  const second = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(second.applied, true, JSON.stringify(second))
  assert.equal(Object.keys(gh2.allIssues()).length, 1, 'the retry reused the already-created issue, never creating a second one')
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'create').length, 1)
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges?.filter(c => (c.status ?? 'pending') === 'pending').map(c => c.id) ?? [], [], 'sc-1 was resolved to deferred — nothing is left pending')
})

test('Finding 6 residual RED->GREEN (reported reproduction): a foreign issue that merely SHARES the approved title is never adopted as this decision\'s effect — reconciliation matches only the hidden decision marker', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-813'
  const approvedDelta = { title: 'Duplicate-looking title', ac: [{ id: 'AC-1', description: 'x' }] }
  setComments({ 813: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('9500', 'an unrelated issue that happens to share the title, filed by someone else', approvedDelta.title)
  process.env.FAKE_GH2_FAIL_CREATE = '1' // the create call itself fails cleanly — nothing new was created
  let out
  try {
    out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_FAIL_CREATE
  }
  assert.equal(out.applied, false, JSON.stringify(out), 'nothing was ever created, and the foreign same-titled issue must never be adopted')
  assert.match(out.results[0].reason, /gh-issue-create-uncertain:new-card-remote-outcome-uncertain/)
  assert.equal(Object.keys(gh2.allIssues()).length, 1, 'only the pre-existing foreign issue exists — nothing was created or adopted')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'], 'sc-1 stays pending — the foreign issue was never mistaken for this decision\'s effect')
})

test('parseScopeDecisionComment / scopeBaselineHashOf: canonical, order-independent, and every malformed shape is a typed rejection', () => {
  assert.deepEqual([...SCOPE_DECISION_ACTIONS].sort(), ['extend-current-card', 'ignore', 'new-card'])
  const a = scopeBaselineHashOf([scopeChange('sc-2'), scopeChange('sc-1'), { id: 'sc-3', status: 'ignored' }])
  const b = scopeBaselineHashOf([scopeChange('sc-1'), scopeChange('sc-2')])
  assert.equal(a, b, 'already-resolved proposals and row order never change the pending baseline')
  assert.match(parseScopeDecisionComment('no fences here').error, /no-fenced-json/)
  assert.match(parseScopeDecisionComment('```json\nnot json\n```').error, /invalid-json/)
  assert.match(parseScopeDecisionComment('```json\n{"schemaVersion":2,"scopeBaselineHash":"x","decisions":[]}\n```').error, /schemaVersion-invalid/)
  assert.match(parseScopeDecisionComment('```json\n{"schemaVersion":1,"decisions":[]}\n```').error, /scopeBaselineHash-missing/)
  assert.match(parseScopeDecisionComment('```json\n{"schemaVersion":1,"scopeBaselineHash":"x","decisions":[{"id":"sc-1","action":"ignore","extraKey":true}]}\n```').error, /unknown-key:extraKey/)
})

// ── US-479 T-21: same-cycle revision, effective remediation counters (DT-04..08) ──────────
test('T-21 (DT-06/07): cycleCounters — a round is ATTEMPTED as soon as a green-fix starts (fixed or not), COMPLETED only once it has a successful correction AND a non-partial review since; two groups and two tier reviewers of the same round count once', () => {
  const { dir } = runDir()
  redSpec(dir, 'r1-g1')
  redVerify(dir, 'r1-g1')
  // an interrupted/failed attempt: attempted, never completed, replay stays the same
  handoff(dir, 'r1-g1', 'green-fix', { fixed: false, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [], reason: 'crashed mid-fix' })
  let c = cycleCounters(readHandoffs(dir))
  assert.deepEqual([c.attemptedCycles, c.completedCycles], [1, 0])
  const c2 = cycleCounters(readHandoffs(dir))
  assert.deepEqual(c2, c, 'identical replay is idempotent')
  // a real fix: still attempted=1 (same round), still not completed until a review lands
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('e'), evidenceLedger: [] }, { attempt: 2 })
  handoff(dir, 'r1-g2', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('f'), evidenceLedger: [] })
  c = cycleCounters(readHandoffs(dir))
  assert.deepEqual([c.attemptedCycles, c.completedCycles], [1, 0], 'still round 1 only — two groups, one round')
  // two tier reviewers of round 1: reviewExecutions=2, reviewBatches=1, completedCycles=1
  handoff(dir, 'r1', 'review-phase', { reviewer: 1, partial: true, reviewedHead: SHA('f'), verdict: 'x', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: false } })
  handoff(dir, 'r1', 'review-phase', { reviewer: 2, partial: false, reviewedHead: SHA('f'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('f') } }, { attempt: 2 })
  c = cycleCounters(readHandoffs(dir))
  assert.deepEqual(c, { attemptedCycles: 1, completedCycles: 1, reviewExecutions: 2, reviewBatches: 1, contractRevisions: 0, preparationRepairs: 0, implementationRetries: 0 })
  // a genuine second remediation round (a NEW green-fix after the completed review) becomes 2
  handoff(dir, 'r2-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('g'), evidenceLedger: [] })
  c = cycleCounters(readHandoffs(dir))
  assert.equal(c.attemptedCycles, 2)
})

test('T-21 (DT-08): the escalation budget bounds COMPLETED corrective cycles, never the raw round counter — a head-moved re-review that bumps `round` without any green-fix does not spend the budget a real remediation earns', () => {
  const { dir } = runDir()
  // round 1: a real, completed remediation cycle
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')] })
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1' })
  redVerify(dir, 'r1-g1', {})
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('d'), evidenceLedger: [] })
  review(dir, 'r1', { mode: 're-review', readiness: { ready: true, remoteHead: SHA('d') }, reviewedHead: SHA('d'), findings: [finding('r0-1', { transition: 'resolved', blocking: false })] })
  // the remote head moves before the coordinator reads readiness back: a metadata-only re-review,
  // round bumps to 2, but NO green-fix ever runs for it — a NEW real defect is then found there
  review(dir, 'r2', { mode: 're-review', readiness: { ready: false }, reviewedHead: SHA('d'), findings: [finding('r2-1')] })
  const r = resolve({ dir, workflowVersion: V, policy: { ...POLICY, maxFixRounds: 2 }, entry: 'pr', pr: 7 })
  // old (round-based) behaviour would escalate here (round 2 >= maxFixRounds 2); completedCycles is
  // only 1 (round 1), so this routes to remediation instead
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase }, { step: 'prepare', mode: 'remediation', phase: 'r3-g1' })
})

// ── US-479 T-20: real-authority preparation, closed repair feedback (DT-01/02/03) ──────────
test('T-20 (DT-02): a red-verify rejection that declares TWO identified mechanisms must close both in ONE answer — one closed and the other only named is refused before the write (canary run 3: two Markdown rewriters split across successive rejections)', () => {
  const { dir } = runDir()
  const base = { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-verify', inputHead: SHA('a'), verified: false, sealed: false, contractHash: `sha256:${'1'.repeat(64)}` }
  const gap = (mechanismId, rowId, extra = {}) => ({ rowId, mechanismId, location: 'src/a.ts:1', severity: 'Major', description: 'drift', recommendation: 'fix', closureAssertions: [{ id: `${rowId}-ca1`, command: `pnpm test -t ${rowId}`, expected: 'pass' }], ...extra })
  // only ONE of the two declared mechanisms is actually closed by a finding
  let f = writeDraft(dir, { ...base, mechanismsIdentified: ['link-rewriter', 'skill-reference-rewriter'], findings: [gap('link-rewriter', 'r-1')] })
  let out = publish({ dir, file: f, phase: 'r1-g1', skill: 'red-verify', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /mechanism-not-enumerated:skill-reference-rewriter/)
  assert.equal(existsSync(join(dir, 'r1-g1-red-verify.json')), false)
  // a finding for a mechanism NOT declared is refused the other way
  f = writeDraft(dir, { ...base, mechanismsIdentified: ['link-rewriter'], findings: [gap('link-rewriter', 'r-1'), gap('skill-reference-rewriter', 'r-2')] })
  out = publish({ dir, file: f, phase: 'r1-g1', skill: 'red-verify', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /mechanism-undeclared:skill-reference-rewriter/)
  // both declared, both closed — one answer, published
  f = writeDraft(dir, { ...base, mechanismsIdentified: ['link-rewriter', 'skill-reference-rewriter'], findings: [gap('link-rewriter', 'r-1'), gap('skill-reference-rewriter', 'r-2')] })
  out = publish({ dir, file: f, phase: 'r1-g1', skill: 'red-verify', workflowVersion: V })
  assert.equal(out.published, true, JSON.stringify(out))
})

test('T-20 (DT-01): a gap naming a mechanism is closed only by executable closure assertions or an explicitly approved non-applicability — a prose-only claim, an empty assertion list, or a reproducer command carrying shell syntax are all refused before the write', () => {
  const { dir } = runDir()
  const base = { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'red-verify', inputHead: SHA('a'), verified: false, sealed: false, contractHash: `sha256:${'1'.repeat(64)}` }
  const bad = (finding, match) => {
    const f = writeDraft(dir, { ...base, findings: [finding] })
    const out = publish({ dir, file: f, phase: 'a0', skill: 'red-verify', workflowVersion: V })
    assert.equal(out.published, false, JSON.stringify(finding))
    assert.match(out.reason, match, JSON.stringify(finding))
  }
  // prose-only: a mechanism named but no closure assertion at all (the hand-built-twin failure mode)
  bad({ rowId: 'r-1', mechanismId: 'installer-symlink', location: 'x', severity: 'Major', description: 'a hand-built alias twin, never run through the real installer', recommendation: 'reproduce it for real' }, /mechanism-incompletely-closed:installer-symlink/)
  bad({ rowId: 'r-1', mechanismId: 'installer-symlink', closureAssertions: [] }, /mechanism-incompletely-closed:installer-symlink/)
  bad({ rowId: 'r-1', mechanismId: 'installer-symlink', closureAssertions: [{ id: 'ca1', expected: 'pass' }] }, /closureAssertion-invalid:installer-symlink/, 'missing command/testRef')
  const CA = { closureAssertions: [{ id: 'ca1', command: 'pnpm test -t r-1', expected: 'pass' }] }
  bad({ rowId: 'r-1', mechanismId: 'installer-symlink', ...CA, reproducer: { command: 'pnpm test; rm -rf /' } }, /reproducer-command-unsafe:installer-symlink/)
  bad({ rowId: 'r-1', mechanismId: 'installer-symlink', ...CA, reproducer: { command: '' } }, /reproducer-invalid:installer-symlink/)
  // an explicitly approved non-applicability closes it WITHOUT an assertion
  const ok = writeDraft(dir, { ...base, findings: [{ rowId: 'r-1', mechanismId: 'installer-symlink', location: 'x', severity: 'Minor', description: 'cannot occur on this producer', recommendation: 'n/a', applicability: 'not-applicable', applicabilityRationale: 'the producer only ever receives absolute paths here' }] })
  assert.equal(publish({ dir, file: ok, phase: 'a0', skill: 'red-verify', workflowVersion: V }).published, true)
})

test('T-20 (DT-03): a repair must verify every PRIOR closure assertion first — a repair naming only one of two rejected rows is refused; naming both publishes; stable rowIds replay identically', () => {
  const { dir } = runDir()
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] } })
  const rejection = [
    { rowId: 'row-1', mechanismId: 'link-rewriter', location: 'a', severity: 'Major', description: 'gap A', recommendation: 'x', closureAssertions: [{ id: 'row-1-ca', command: 'pnpm test -t row-1', expected: 'pass' }] },
    { rowId: 'row-2', mechanismId: 'skill-reference-rewriter', location: 'b', severity: 'Major', description: 'gap B', recommendation: 'y', closureAssertions: [{ id: 'row-2-ca', command: 'pnpm test -t row-2', expected: 'pass' }] },
  ]
  redVerify(dir, 'r1-g1', { verified: false, findings: rejection, sealed: false, snapshot: undefined }, { predecessor: 'r1-g1-red-spec' })
  // repair naming only row-1 in changedRows: refused before the write
  let f = writeDraft(dir, { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('a'), status: 'red', mode: 'repair', contractPath: '/abs/r1-g1-red-contract.json', contractHash: `sha256:${'3'.repeat(64)}`, changedRows: ['row-1'] })
  let out = publish({ dir, file: f, phase: 'r1-g1', skill: 'red-spec', workflowVersion: V, attempt: 2, predecessor: 'r1-g1-red-verify' })
  assert.equal(out.published, false)
  assert.equal(out.reason, 'repair-incomplete:row-2')
  assert.equal(existsSync(join(dir, 'r1-g1-red-spec.attempt-2.json')), false)
  // both rows named: publishes
  f = writeDraft(dir, { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('a'), status: 'red', mode: 'repair', contractPath: '/abs/r1-g1-red-contract.json', contractHash: `sha256:${'3'.repeat(64)}`, changedRows: ['row-1', 'row-2'] })
  out = publish({ dir, file: f, phase: 'r1-g1', skill: 'red-spec', workflowVersion: V, attempt: 2, predecessor: 'r1-g1-red-verify' })
  assert.equal(out.published, true, JSON.stringify(out))
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'r1-g1-red-spec.attempt-2.json'), 'utf8')).changedRows, ['row-1', 'row-2'])
  // a rejection with no rowId/mechanismId (legacy shape) never triggers the completeness gate
  const { dir: d2 } = runDir()
  redSpec(d2, 'a0')
  redVerify(d2, 'a0', { verified: false, findings: [{ location: 'x', severity: 'Minor', description: 'd', recommendation: 'r' }], sealed: false, snapshot: undefined }, { predecessor: 'a0-red-spec' })
  const f2 = writeDraft(d2, { run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'red-spec', inputHead: SHA('a'), status: 'red', mode: 'repair', contractPath: '/abs/a0-red-contract.json', contractHash: `sha256:${'4'.repeat(64)}` })
  assert.equal(publish({ dir: d2, file: f2, phase: 'a0', skill: 'red-spec', workflowVersion: V, attempt: 2, predecessor: 'a0-red-verify' }).published, true)
})

test('T-19: the schema-3 taxonomy is exactly the enums S2/S5 name — no extra or missing value slips in unnoticed', () => {
  assert.deepEqual([...FINDING_TRANSITIONS].sort(), ['human', 'open', 'resolved', 'superseded'])
  assert.deepEqual([...RECORD_TYPES].sort(), ['decision', 'judgment', 'migration'])
  assert.deepEqual([...SCOPE_CHANGE_TYPES].sort(), ['new-requirement', 'scope-extension'])
  assert.deepEqual([...SCOPE_CHANGE_STATUSES].sort(), ['deferred', 'extended', 'ignored', 'pending'])
})
