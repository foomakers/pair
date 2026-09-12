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
  let storedBody = bodyIdx !== -1 ? a[bodyIdx + 1] : ''
  // Fault injection modeling a REMOTE content divergence despite a correct local request (a
  // template/webhook rewrite, a truncated body, manual edit before readback) — never something
  // this repo's own code path would produce, but exactly what content-verification must catch.
  if (process.env.FAKE_GH2_STRIP_AC_ON_CREATE) storedBody = storedBody.split('\\n').filter(l => !/^- \\[/.test(l)).join('\\n')
  if (process.env.FAKE_GH2_CORRUPT_AC_DESCRIPTION) storedBody = storedBody.replace(/(\\*\\*AC-[\\w.-]+\\.\\*\\*[ \\t]*)(.*)$/m, '$1WRONG DESCRIPTION')
  if (process.env.FAKE_GH2_SHIFT_AC_ID) storedBody = storedBody.replace(/AC-([\\w.-]+)/, 'AC-SHIFTED-$1')
  if (process.env.FAKE_GH2_DUPLICATE_AC) {
    const line = storedBody.split('\\n').find(l => /^- \\[/.test(l))
    if (line) storedBody = storedBody + '\\n' + line.replace(/\\.\\*\\*.*/, '.** a conflicting alternate description')
  }
  state.issues[id] = { title: titleIdx !== -1 ? a[titleIdx + 1] : '', body: storedBody }
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

import { SCHEMA_VERSION, METRICS_SCHEMA_VERSION, FINDING_TRANSITIONS, RECORD_TYPES, SCOPE_CHANGE_TYPES, SCOPE_CHANGE_STATUSES, NEW_PUBLIC_STATUSES, SCOPE_DECISION_ACTIONS, deriveNext, publish, resolve, readHandoffs, contractHash, inputsDigest, testIdentity, compatible, cardHash, migrateInspect, migrateAcknowledge, predecessorEvidence, cycleCounters, scopeBaselineHashOf, parseScopeDecisionComment, applyScopeDecisions } from '../../skills/pair-workflow-red-spec/scripts/cycle-state.mjs'

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
  // The card speaks a SUPPORTED AC dialect (2026-09-10 fail-closed ADL: a card in no recognized
  // dialect is refused, never appended to — covered by its own negative tests below). What this
  // test proves is unchanged: a genuinely new AC is really written, read back and confirmed.
  gh2.seed('42', '## Acceptance Criteria\n\n- **AC-1**: the original requirement\n')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  // Finding 6 (reported reproduction): the prior implementation marked 'extended' and bumped
  // scopeEpoch WITHOUT ever touching the real card. Here the card body is a real, separately
  // seeded artifact behind a stateful fake `gh` — proving the AC was actually written, read back,
  // and confirmed, not merely labeled.
  const updatedBody = gh2.body('42')
  assert.match(updatedBody, /AC-99/)
  assert.match(updatedBody, /the new requirement/)
  assert.equal(updatedBody.split('\n').filter(l => l.includes('AC-99')).length, 1, 'the genuinely new AC is added exactly once')
  assert.ok(updatedBody.includes('- **AC-1**: the original requirement'), 'the pre-existing AC is untouched — the update extends the card, it does not replace it')
  assert.ok(updatedBody.startsWith('## Acceptance Criteria\n\n'), 'the human heading survives untouched')
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

// ── Finding 6 residual (Caso A): the ADOPTED AC formats, not a fictional simplified one ──────
// A verbatim excerpt of #479's REAL body: `- [ ] **AC-01 — Title.** Description.`, one per line,
// blank-line separated (fetched 2026-09-10, unchanged by this remediation).
const CARD_479_EXCERPT =
  '## Acceptance Criteria\n\n' +
  'Every criterion includes its mandatory S1–S10 technical rules and DT test cases below. Check only with current-head evidence.\n\n' +
  '- [ ] **AC-01 — Independent contract before code.** Independent executable acceptance approval precedes source fixes, for fresh stories and PRs without a compatible baseline; template-schema approval cannot substitute.\n\n' +
  '- [ ] **AC-02 — Real, discriminating upstream oracles.** Real producer output defines expected artifacts; supported domains, controls and interaction witnesses discriminate good/bad behavior before sealing.\n\n' +
  '- [ ] **AC-03 — Complete operational repair feedback.** One rejection specifies executable closure assertions for every identified mechanism; stable feedback and bounded repairs prevent serial partial closure.\n'
// A verbatim excerpt of the delivery template's (and #482's) Given/When/Then acceptance format.
const CARD_482_EXCERPT =
  '### Functional Requirements\n\n**Given-When-Then Format:**\n\n' +
  '1. **Given** a dataset `SKILL.md` whose body links a script as `[…](./scripts/<file>)` or `[…](scripts/<file>)`\n' +
  "   **When** `skills:conformance` runs and that file does not exist in the skill's `scripts/` directory\n" +
  "   **Then** the report carries an error naming the skill's relative path and the missing script path, and the check exits non-zero.\n\n" +
  '2. **Given** a dataset skill-local script `dataset/.skills/<category>/<name>/scripts/<file>`\n' +
  '   **When** the installed twin `.claude/skills/pair-<category>-<name>/scripts/<file>` is missing or differs by one byte\n' +
  '   **Then** the report carries an error naming both paths (`missing` vs `drifted`), and the check exits non-zero.\n'

test('Finding 6 residual RED->GREEN (Caso A, fixture from the REAL #479 body): AC-01 is updated in place, no second definition, AC-02/AC-03 survive byte-identical', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-820'
  const newDescription = 'Independent executable acceptance approval precedes source fixes for EVERY story and PR, no exception.'
  setComments({ 820: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: newDescription }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_479_EXCERPT)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  const ac01Lines = body.split('\n').filter(l => l.includes('**AC-01'))
  assert.equal(ac01Lines.length, 1, 'AC-01 has exactly one active definition — no second one appended')
  assert.match(ac01Lines[0], new RegExp(newDescription.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(body, /template-schema approval cannot substitute/, 'the OLD AC-01 description is gone, not left dangling')
  // AC-02/AC-03, and the surrounding section prose, are byte-identical to the original excerpt
  const ac02Line = '- [ ] **AC-02 — Real, discriminating upstream oracles.** Real producer output defines expected artifacts; supported domains, controls and interaction witnesses discriminate good/bad behavior before sealing.'
  const ac03Line = '- [ ] **AC-03 — Complete operational repair feedback.** One rejection specifies executable closure assertions for every identified mechanism; stable feedback and bounded repairs prevent serial partial closure.'
  assert.ok(body.includes(ac02Line), 'AC-02 survives byte-identical')
  assert.ok(body.includes(ac03Line), 'AC-03 survives byte-identical')
  assert.ok(body.includes('Every criterion includes its mandatory S1–S10 technical rules'), 'surrounding human prose survives untouched')
})

test('Finding 6 residual (Caso A): a description already sitting under a DIFFERENT real AC id is never mistaken for the approved one — the targeted id is replaced, the other id untouched', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-821'
  // AC-02's own real description is the text approved FOR AC-01 — an independent substring match
  // would wrongly consider AC-01 already satisfied by AC-02's line.
  const sharedText = 'Real producer output defines expected artifacts; supported domains, controls and interaction witnesses discriminate good/bad behavior before sealing.'
  setComments({ 821: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: sharedText }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_479_EXCERPT)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  const ac01Lines = body.split('\n').filter(l => l.includes('**AC-01'))
  const ac02Lines = body.split('\n').filter(l => l.includes('**AC-02'))
  assert.equal(ac01Lines.length, 1)
  assert.match(ac01Lines[0], /Real producer output defines expected artifacts/)
  assert.equal(ac02Lines.length, 1, 'AC-02 is not duplicated or removed')
  assert.match(ac02Lines[0], /Real producer output defines expected artifacts/, 'AC-02 keeps its own original text')
})

test('Finding 6 residual (Caso A): an id sharing a common prefix (AC-1 vs AC-10) is never conflated — the real checkbox parser matches the FULL id token', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-822'
  setComments({ 822: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'updated' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', '- [ ] **AC-1 — Short one.** old\n\n- [ ] **AC-10 — Unrelated.** something else entirely')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.match(body, /AC-10 — Unrelated\.\*\* something else entirely/, 'AC-10 must survive completely untouched')
  const ac1Line = body.split('\n').find(l => l.includes('**AC-1') && !l.includes('AC-10'))
  assert.match(ac1Line, /updated/)
})

test('Finding 6 residual (Caso A): one decision that both REPLACES an existing AC and ADDS a genuinely new one applies both correctly, in one real edit, leaving an unrelated third AC byte-identical', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-823'
  setComments({ 823: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: 'replaced text' }, { id: 'AC-99', description: 'brand new requirement' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_479_EXCERPT)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.doesNotMatch(body, /Independent executable acceptance approval precedes source fixes, for fresh/)
  assert.match(body, /replaced text/)
  assert.match(body, /AC-99.*brand new requirement/)
  const ac03Line = '- [ ] **AC-03 — Complete operational repair feedback.** One rejection specifies executable closure assertions for every identified mechanism; stable feedback and bounded repairs prevent serial partial closure.'
  assert.ok(body.includes(ac03Line), 'a THIRD, uninvolved AC survives byte-identical')
})

test('Finding 6 residual (Caso A): retry — a second decision approving the SAME (id, description) the card already carries is applied without a second real edit call', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1'), scopeChange('sc-2')] })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_479_EXCERPT)
  const hash1 = scopeBaselineHashOf([scopeChange('sc-1'), scopeChange('sc-2')])
  setComments({ 824: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: 'new text' }] } }], hash1)) })
  const out1 = applyScopeDecisions({ dir, decisionRef: 'https://github.com/foomakers/pair/pull/7#issuecomment-824', repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out1.applied, true, JSON.stringify(out1))
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 1)
  // sc-2, a DIFFERENT decision, approves the exact same (id, description) — already satisfied
  const stillPending = [scopeChange('sc-2')]
  const hash2 = scopeBaselineHashOf(stillPending)
  setComments({ 825: comment('rucka', decisionBody([{ id: 'sc-2', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: 'new text' }] } }], hash2)) })
  const out2 = applyScopeDecisions({ dir, decisionRef: 'https://github.com/foomakers/pair/pull/7#issuecomment-825', repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out2.applied, true, JSON.stringify(out2))
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 1, 'the card already satisfied AC-01 — no second real edit was issued')
})

test('Finding 6 residual (Caso A): a real id the card carries MORE THAN ONCE is ambiguous — refused outright, never guessed, never marked extended', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-826'
  setComments({ 826: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: 'resolved' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', '- [ ] **AC-01 — First.** first definition\n\n- [ ] **AC-01 — Second.** second, conflicting definition')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /ambiguous-ac-id:AC-01/)
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0, 'an ambiguous card is never edited')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'], 'stays pending — never silently marked extended')
})

test('Finding 6 residual (Caso A): a readback that does not confirm the approved id/description is refused — never extended, scopeEpoch never bumped', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-827'
  setComments({ 827: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: 'the approved text' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_479_EXCERPT)
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
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.scopeEpoch ?? 1, 1, 'scopeEpoch never bumped on an unconfirmed extension')
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'])
})

// ── Finding 6 residual (Caso A): the Given/When/Then template dialect (#482) ─────────────────
test('Finding 6 residual RED->GREEN (Caso A, Given/When/Then dialect): the identified obligation is modified per the adopted contract shape; block 2 survives untouched', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-828'
  const approvedGwt = '**Given** a dataset `SKILL.md` with no script link at all\n**When** `skills:conformance` runs\n**Then** nothing is reported for that skill — absence of a link is not absence of a script.'
  setComments({ 828: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: '1', description: approvedGwt }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_482_EXCERPT)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.match(body, /1\. \*\*Given\*\* a dataset `SKILL\.md` with no script link at all/)
  assert.match(body, /\*\*When\*\* `skills:conformance` runs\n\s*\*\*Then\*\* nothing is reported/)
  assert.doesNotMatch(body, /whose body links a script as/, 'the OLD Given/When/Then text for item 1 is gone')
  // item 2 is completely untouched
  const item2Given = '2. **Given** a dataset skill-local script `dataset/.skills/<category>/<name>/scripts/<file>`'
  assert.ok(body.includes(item2Given), 'item 2 survives byte-identical')
})

test('Finding 6 residual (Caso A, Given/When/Then dialect): an unidentifiable reference is refused WITHOUT append — a parser miss is never treated as proof the obligation is new', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-829'
  // "99" resolves to nothing in a 2-item GWT card — in the checkbox dialect this would be treated
  // as a genuinely new AC and appended; in the GWT dialect it must be refused instead.
  setComments({ 829: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: '99', description: '**Given** x\n**When** y\n**Then** z' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_482_EXCERPT)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /ac-id-unresolvable:99/)
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0, 'never appended — a miss is not proof of a new obligation')
  assert.equal(gh2.body('42'), CARD_482_EXCERPT, 'the card is byte-identical to before the attempt')
})

test('Finding 6 residual (Caso A, Given/When/Then dialect): an approved description NOT itself in Given/When/Then shape is refused as a contract-shape mismatch, never coerced', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-830'
  setComments({ 830: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: '1', description: 'just replace it with this plain sentence' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_482_EXCERPT)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /approvedDelta-shape-mismatch:1/)
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0)
  assert.equal(gh2.body('42'), CARD_482_EXCERPT)
})

// ── Finding 6 residual (Caso A): the PREVIOUSLY SUPPORTED colon dialect, alongside the new ones ──
// `AC-1: text` and `- **AC-1**: text` are the shape a human writes on a card and the shape this
// script itself emitted before 4.0.0 — the reported reproduction in #479's own verification comment
// is written in it. Support is CUMULATIVE with the checkbox and Given/When/Then dialects: a card in
// any adopted shape resolves, and a card in none of them is refused rather than appended to.
const CARD_COLON_EXCERPT =
  '## Acceptance Criteria\n\n' +
  '- **AC-1**: old requirement\n'

test('Finding 6 residual RED->GREEN (Caso A, colon dialect — reported regression): `- **AC-1**: old requirement` is REPLACED in place — the old requirement is gone and no second definition is appended', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-840'
  setComments({ 840: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'new requirement' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', CARD_COLON_EXCERPT)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.doesNotMatch(body, /old requirement/, 'the old requirement is REPLACED, not left standing')
  const ac1Lines = body.split('\n').filter(l => /AC-1(?![\w.-])/.test(l))
  assert.equal(ac1Lines.length, 1, 'exactly one AC-1 definition — no second one appended alongside the old')
  assert.match(ac1Lines[0], /new requirement/)
  assert.doesNotMatch(body, /Scope extension/, 'an existing obligation is edited, never appended as if new')
  assert.ok(body.startsWith('## Acceptance Criteria\n\n'), 'the human heading survives untouched')
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 1)
})

test('Finding 6 residual (Caso A, colon dialect — issue-comment reproduction): a description already sitting under AC-2 never satisfies AC-1 — AC-1 is replaced, AC-2 untouched', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-841'
  setComments({ 841: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'comportamento nuovo' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: comportamento vecchio\nAC-2: comportamento nuovo')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.doesNotMatch(body, /vecchio/, 'the old AC-1 definition is REPLACED, not left dangling alongside the new one')
  const ac1Lines = body.split('\n').filter(l => /AC-1(?![\w.-])/.test(l))
  assert.equal(ac1Lines.length, 1)
  assert.match(ac1Lines[0], /comportamento nuovo/, 'AC-1 now carries the approved description')
  const ac2Lines = body.split('\n').filter(l => l.includes('AC-2'))
  assert.equal(ac2Lines.length, 1)
  assert.equal(ac2Lines[0], 'AC-2: comportamento nuovo', 'AC-2 is untouched — it always said this')
})

test('Finding 6 residual (Caso A, colon dialect): an id sharing a common prefix (AC-1 vs AC-10) is never conflated — only the exact targeted id is replaced', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-842'
  setComments({ 842: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'updated' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: old\nAC-10: something else entirely')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.ok(body.includes('AC-10: something else entirely'), 'AC-10 must survive completely byte-identical')
  const ac1Line = body.split('\n').find(l => /AC-1(?![\w.-])/.test(l))
  assert.equal(ac1Line, 'AC-1: updated')
  assert.doesNotMatch(body, /AC-1: old/)
})

test('Finding 6 residual (Caso A, colon dialect): one decision that both REPLACES an existing AC and ADDS a genuinely new one applies both in one real edit, leaving an unrelated third AC byte-identical', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-843'
  setComments({ 843: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'replaced text' }, { id: 'AC-99', description: 'brand new requirement' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: original text\nAC-5: never touched by this decision')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.doesNotMatch(body, /original text/)
  assert.match(body, /replaced text/)
  assert.match(body, /AC-99.*brand new requirement/)
  assert.equal(body.split('\n').filter(l => l.includes('AC-99')).length, 1, 'the genuinely new AC is added exactly once')
  assert.ok(body.includes('AC-5: never touched by this decision'), 'a THIRD, uninvolved AC survives byte-identical')
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 1, 'one real edit, not two')
})

test('Finding 6 residual (Caso A, colon dialect): retry — the SAME decisionRef replayed is a no-op: no second edit, no duplicate definition, no second handoff and no further scopeEpoch bump', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-844'
  setComments({ 844: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'new text' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: old')
  const out1 = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out1.applied, true, JSON.stringify(out1))
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 1)
  assert.equal(gh2.body('42'), 'AC-1: new text', 'the colon-format AC really was rewritten in place')
  const first = JSON.parse(readFileSync(join(dir, 'r0-review-phase.attempt-2.json'), 'utf8'))
  assert.equal(first.scopeEpoch, 2)
  assert.equal(first.scopeChanges[0].status, 'extended')
  const out2 = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.deepEqual(out2, { applied: true, reason: 'already-applied' })
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 1, 'no second real edit on the replay')
  assert.equal(gh2.body('42'), 'AC-1: new text', 'no duplicate definition appended on the replay')
  assert.equal(existsSync(join(dir, 'r0-review-phase.attempt-3.json')), false, 'no second handoff, no further scopeEpoch bump')
})

test('Finding 6 residual (Caso A, colon dialect): an id the card carries MORE THAN ONCE in the same format is ambiguous — refused outright, never guessed, never marked extended', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-846'
  setComments({ 846: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'resolved' }] } }], hash)) })
  const gh2 = newFakeGh2()
  const seeded = 'AC-1: first definition\nAC-1: second, conflicting definition'
  gh2.seed('42', seeded)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /ambiguous-ac-id:AC-1/)
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0, 'an ambiguous card is never edited')
  assert.equal(gh2.body('42'), seeded, 'the card is byte-identical to before the attempt')
  assert.equal(existsSync(join(dir, 'r0-review-phase.attempt-2.json')), false, 'no decision handoff written — no extended status, no scopeEpoch bump')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'], 'stays pending — never silently marked extended')
})

test('Finding 6 residual (Caso A): the SAME id defined in TWO different adopted formats is ambiguous — refused, no edit, card byte-identical', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-847'
  setComments({ 847: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'resolved' }] } }], hash)) })
  const gh2 = newFakeGh2()
  const seeded = 'AC-1: the colon-format definition\n\n- [ ] **AC-1 — Checkbox.** the checkbox-format definition'
  gh2.seed('42', seeded)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /ambiguous-ac-id:AC-1/)
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0)
  assert.equal(gh2.body('42'), seeded)
  assert.equal(existsSync(join(dir, 'r0-review-phase.attempt-2.json')), false, 'no decision handoff written — no extended status, no scopeEpoch bump')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'])
})

test('Finding 6 residual (Caso A, fail-closed policy): a card whose AC live in an UNRECOGNIZED shape — the targeted id among them — is refused: no edit, no extended, no scopeEpoch bump', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-848'
  setComments({ 848: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'new requirement' }] } }], hash)) })
  const gh2 = newFakeGh2()
  // The obligation IS on the card — in a shape none of the adopted dialects covers (no colon, no
  // checkbox, no Given/When/Then). Resolution fails; a failed resolution is refused, never used as
  // evidence that AC-1 is genuinely new.
  const seeded = '## Acceptance Criteria\n\n| AC-1 | old requirement |\n'
  gh2.seed('42', seeded)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /unsupported-card-format/)
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0, 'nothing is written')
  assert.equal(gh2.body('42'), seeded, 'the card is byte-identical to before the attempt')
  assert.equal(existsSync(join(dir, 'r0-review-phase.attempt-2.json')), false, 'no decision handoff written — no extended status, no scopeEpoch bump')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'], 'never marked extended')
})

test('Finding 6 residual RED->GREEN (Caso A, fail-closed policy): a card in NO recognized AC dialect is refused even when the requested id appears NOWHERE in it — an absent id token is not proof the card carries no obligations', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-852'
  setComments({ 852: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-99', description: 'the new requirement' }] } }], hash)) })
  const gh2 = newFakeGh2()
  const seeded = 'original card body for #42'
  gh2.seed('42', seeded)
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /unsupported-card-format/, 'a typed refusal naming the unsupported card format, not a silent append')
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0, 'nothing is written')
  assert.equal(gh2.body('42'), seeded, 'the card is byte-identical to before the attempt')
  assert.equal(existsSync(join(dir, 'r0-review-phase.attempt-2.json')), false, 'no decision handoff written — no extended status, no scopeEpoch bump')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.reason, 'awaiting-scope-decision')
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'], 'the proposal stays pending — never marked extended')
})

test('Finding 6 residual (Caso A, fail-closed policy): the refusal is scoped to a card with NO recognized dialect — a card that DOES speak one still resolves an id it cannot match as `ac-id-unresolvable`, and a genuinely new id is still added', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1'), scopeChange('sc-2')] })
  const gh2 = newFakeGh2()
  // AC-2 is in a supported dialect (so the card is not fail-closed), AC-1 only in an unsupported one.
  const seeded = '## Acceptance Criteria\n\n- **AC-2**: a recognized requirement\n\n| AC-1 | old requirement |\n'
  gh2.seed('42', seeded)
  const hash = scopeBaselineHashOf([scopeChange('sc-1'), scopeChange('sc-2')])
  setComments({ 853: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'new requirement' }] } }], hash)) })
  const refused = applyScopeDecisions({ dir, decisionRef: 'https://github.com/foomakers/pair/pull/7#issuecomment-853', repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(refused.applied, false, JSON.stringify(refused))
  assert.match(refused.results[0].reason, /ac-id-unresolvable:AC-1/, 'a recognized card refuses the unmatchable id, not the whole card')
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0)
  assert.equal(gh2.body('42'), seeded)
  // the same card DOES accept a genuinely new id — the fail-closed rule never blocks a real addition
  const hash2 = scopeBaselineHashOf([scopeChange('sc-1'), scopeChange('sc-2')])
  setComments({ 854: comment('rucka', decisionBody([{ id: 'sc-2', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-99', description: 'brand new requirement' }] } }], hash2)) })
  const added = applyScopeDecisions({ dir, decisionRef: 'https://github.com/foomakers/pair/pull/7#issuecomment-854', repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(added.applied, true, JSON.stringify(added))
  const body = gh2.body('42')
  assert.equal(body.split('\n').filter(l => l.includes('AC-99')).length, 1)
  assert.ok(body.includes('- **AC-2**: a recognized requirement'), 'the recognized AC is untouched')
  assert.ok(body.includes('| AC-1 | old requirement |'), 'the unsupported-shape line is left exactly as the human wrote it')
})

test('Finding 6 residual (Caso A, colon dialect): a readback that does not confirm the approved id/description is refused — the edit really happened, only its confirmation failed', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-849'
  setComments({ 849: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-1', description: 'the approved text' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', 'AC-1: old text')
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
  assert.equal(gh2.body('42'), 'AC-1: the approved text', 'the colon-format line was rewritten in place, not appended to')
  assert.equal(existsSync(join(dir, 'r0-review-phase.attempt-2.json')), false, 'no decision handoff written — scopeEpoch never bumped on an unconfirmed extension')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.next.scopeChanges.map(c => c.id), ['sc-1'])
})

test('Finding 6 residual (Caso A, the checkbox shape this script emits itself): `- [ ] **AC-01.** description` with no title is replaced in place', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-850'
  setComments({ 850: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: 'the approved requirement' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', '## Scope extension (US-479 S5)\n- [ ] **AC-01.** an earlier requirement\n- [ ] **AC-02.** untouched\n')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  const body = gh2.body('42')
  assert.doesNotMatch(body, /an earlier requirement/)
  assert.equal(body.split('\n').filter(l => l.includes('**AC-01')).length, 1)
  assert.ok(body.includes('- [ ] **AC-01.** the approved requirement'))
  assert.ok(body.includes('- [ ] **AC-02.** untouched'), 'the sibling AC survives byte-identical')
})

test('Finding 6 residual (Caso A, real #479 checkbox): the rewritten line keeps its checkbox state and its title — only the description changes', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-851'
  setComments({ 851: comment('rucka', decisionBody([{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-01', description: 'the approved requirement.' }] } }], hash)) })
  const gh2 = newFakeGh2()
  gh2.seed('42', '- [x] **AC-01 — Independent contract before code.** the old requirement.\n')
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  assert.equal(gh2.body('42'), '- [x] **AC-01 — Independent contract before code.** the approved requirement.\n', 'the checked box and the human title are preserved verbatim')
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

// ── Finding 6 residual (Caso B): the ONE content verification, on every path ─────────────────
test('Finding 6 residual RED->GREEN (Caso B, reported reproduction): title and marker correct, approved AC missing from the created body — refused, never accepted on title alone', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-840'
  const approvedDelta = { title: 'Follow-up (AC stripped)', ac: [{ id: 'AC-1', description: 'the approved requirement' }] }
  setComments({ 840: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  process.env.FAKE_GH2_STRIP_AC_ON_CREATE = '1'
  let out
  try {
    out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_STRIP_AC_ON_CREATE
  }
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /gh-issue-create-content-mismatch:AC-1/)
  assert.equal(Object.keys(gh2.allIssues()).length, 1, 'the ledger is preserved — a retry reconciles onto this SAME issue, never a second create')
})

test('Finding 6 residual (Caso B): AC present under the right id but with the WRONG description — refused', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-841'
  const approvedDelta = { title: 'Follow-up (AC corrupted)', ac: [{ id: 'AC-1', description: 'the approved requirement' }] }
  setComments({ 841: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  process.env.FAKE_GH2_CORRUPT_AC_DESCRIPTION = '1'
  let out
  try {
    out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_CORRUPT_AC_DESCRIPTION
  }
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /gh-issue-create-content-mismatch:AC-1/)
})

test('Finding 6 residual (Caso B): the correct description sits under a DIFFERENT id than approved — refused, id association matters, not just text presence', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-842'
  const approvedDelta = { title: 'Follow-up (AC id shifted)', ac: [{ id: 'AC-1', description: 'the approved requirement' }] }
  setComments({ 842: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  process.env.FAKE_GH2_SHIFT_AC_ID = '1'
  let out
  try {
    out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_SHIFT_AC_ID
  }
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /gh-issue-create-content-mismatch:AC-1/)
})

test('Finding 6 residual (Caso B): a duplicated/contradictory definition of the approved id in the created body is refused, never guessed', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-843'
  const approvedDelta = { title: 'Follow-up (AC duplicated)', ac: [{ id: 'AC-1', description: 'the approved requirement' }] }
  setComments({ 843: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  process.env.FAKE_GH2_DUPLICATE_AC = '1'
  let out
  try {
    out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_DUPLICATE_AC
  }
  assert.equal(out.applied, false, JSON.stringify(out))
  assert.match(out.results[0].reason, /gh-issue-create-content-mismatch:AC-1/)
})

test('Finding 6 residual (Caso B): retry after a negative content readback never creates a second card — once the remote body is fixed, the SAME issue is confirmed and reused', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-844'
  const approvedDelta = { title: 'Follow-up (content flake then fixed)', ac: [{ id: 'AC-1', description: 'the approved requirement' }] }
  setComments({ 844: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  process.env.FAKE_GH2_STRIP_AC_ON_CREATE = '1'
  let first
  try {
    first = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_STRIP_AC_ON_CREATE
  }
  assert.equal(first.applied, false, JSON.stringify(first))
  assert.equal(Object.keys(gh2.allIssues()).length, 1)
  const createdId = Object.keys(gh2.allIssues())[0]
  // the remote body is fixed out of band (a maintainer edits it, or the earlier fault clears)
  gh2.seed(createdId, `${gh2.issue(createdId).body}\n- [ ] **AC-1.** the approved requirement`, gh2.issue(createdId).title)
  const second = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  assert.equal(second.applied, true, JSON.stringify(second))
  assert.equal(Object.keys(gh2.allIssues()).length, 1, 'still exactly one issue — never a second create on retry')
  assert.equal(gh2.calls().filter(c => c[0] === 'issue' && c[1] === 'create').length, 1)
})

test('Finding 6 residual (Caso B): a lost create response reconciles onto the created issue, and the approved AC content is verified BEFORE the decision (and its handoff) is applied', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-845'
  const approvedDelta = { title: 'Follow-up (lost response, content verified)', ac: [{ id: 'AC-1', description: 'the approved requirement' }] }
  setComments({ 845: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', approvedDelta }], hash)) })
  const gh2 = newFakeGh2()
  process.env.FAKE_GH2_LOSE_CREATE_RESPONSE = '1'
  let out
  try {
    out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V, ghBin: gh2.ghBin })
  } finally {
    delete process.env.FAKE_GH2_LOSE_CREATE_RESPONSE
  }
  assert.equal(out.applied, true, JSON.stringify(out), 'the create landed remotely WITH the approved content — reconciliation confirms it, not just the marker')
  assert.equal(Object.keys(gh2.allIssues()).length, 1)
  const created = Object.values(gh2.allIssues())[0]
  assert.match(created.body, /AC-1.*the approved requirement/s)
  // the handoff records the decision only because content verification passed
  const written = readFileSync(join(dir, 'r0-review-phase.attempt-2.json'), 'utf8')
  assert.match(JSON.parse(written).scopeChanges[0].targetIssueUrl, /^https:\/\/github\.com\/foomakers\/pair\/issues\/\d+$/)
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
  // AMENDED by US-479 T-29 (S11, D5): this exhaustive equality enumerated the whole counter set,
  // and S11 requires four more derived counters ("Add derived counters invalidatedRemediations,
  // regressionRepairs, activeRegressionRisks, dischargedRegressionRisks to every-step metrics").
  // An exhaustive assertion cannot survive a mandated addition, so the four keys are pinned here
  // at their values for this fixture — the assertion stays exhaustive and nothing is weakened.
  // AMENDED again by US-479 DR-01: the budget needed a counter of CONCLUDED cycles distinct from
  // completed ones, so the exhaustive set gains `spentCycles`. This round concluded (a fix, then a
  // non-partial review) and also closed, so both are 1. No existing expectation is weakened.
  assert.deepEqual(c, { attemptedCycles: 1, spentCycles: 1, completedCycles: 1, reviewExecutions: 2, reviewBatches: 1, contractRevisions: 0, preparationRepairs: 0, implementationRetries: 0, invalidatedRemediations: 0, regressionRepairs: 0, activeRegressionRisks: 0, dischargedRegressionRisks: 0 })
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

// ── US-479 B1 (S3, AC-08, DT-04): a preparation that hits a CONTRADICTION with sealed rows
// routes a minimal successor revision in the same cycle — it is not a terminal refusal ──────────
const CX = { command: 'pnpm exec vitest run src/a.test.ts -t R33', expected: 'R33 passes under the installer-derived rule', actual: 'R33 fails: the alias directory is never installed' }
// The contradiction as red-spec publishes it: the typed evidence S3 enumerates, nothing else.
const contradiction = (dir, phase, extra = {}, opts) =>
  handoff(
    dir,
    phase,
    'red-spec',
    {
      status: 'contradiction',
      mode: 'remediation',
      revisionReason: 'contradicts-approved-authority',
      predecessorContractHash: `sha256:${'1'.repeat(64)}`,
      conflictingRowIds: ['R33', 'R34'],
      changedRows: ['R33', 'R34'],
      counterexample: CX,
      findings: { received: ['r5-11'], covered: [] },
      ...extra,
    },
    opts,
  )
// A sealed initial chain a0 -> a0-rev2 -> a0-rev3, then a remediation round whose preparation
// discovers that closing its finding would break two SEALED rows of a0-rev3.
function sealedInitialChain(dir, { hash = `sha256:${'1'.repeat(64)}` } = {}) {
  redSpec(dir, 'a0', { mode: 'initial', contractHash: `sha256:${'9'.repeat(64)}` })
  redVerify(dir, 'a0', { contractHash: `sha256:${'9'.repeat(64)}` })
  redSpec(dir, 'a0-rev2', { mode: 'revision', contractHash: `sha256:${'8'.repeat(64)}` })
  redVerify(dir, 'a0-rev2', { contractHash: `sha256:${'8'.repeat(64)}` })
  redSpec(dir, 'a0-rev3', { mode: 'revision', contractPath: '/abs/a0-rev3-red-contract.json', contractHash: hash })
  redVerify(dir, 'a0-rev3', { contractHash: hash, snapshot: SHA('e') })
  handoff(dir, 'a0-rev3', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('c') })
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r5-11')] })
}

test('B1 (DT-04): a complete contradiction routes prepare/revision on the SUCCESSOR of the contract identified by its hash — not the current group contract — and carries the exact changed rows', () => {
  const { dir } = runDir()
  sealedInitialChain(dir)
  contradiction(dir, 'r1-g1')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.status, 'in-progress')
  assert.deepEqual(
    { step: r.next.step, mode: r.next.mode, phase: r.next.phase, revision: r.next.revision },
    { step: 'prepare', mode: 'revision', phase: 'a0-rev4', revision: 4 },
    JSON.stringify(r.next),
  )
  assert.deepEqual(r.next.changedRows, ['R33', 'R34'])
  assert.equal(r.next.contract.path, '/abs/a0-rev3-red-contract.json', 'the revision is based on the contradicted contract')
  // the route back to the remediation that raised it is explicit, never lost
  assert.deepEqual(r.next.contradictionFor, { phase: 'r1-g1', findings: ['r5-11'] })
})

test('B1: the succession line is resolved from the VERIFIED sealed identity — an unresolvable predecessor hash is a typed refusal, never a guessed target', () => {
  const { dir } = runDir()
  sealedInitialChain(dir)
  contradiction(dir, 'r1-g1', { predecessorContractHash: `sha256:${'7'.repeat(64)}` })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.reason, 'failed-preparation')
  assert.equal(r.next.refusal, 'contradiction-unresolvable')
})

test('B1: a contract hash that was PREPARED but never sealed is not a verified identity', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial', contractHash: `sha256:${'1'.repeat(64)}` }) // no red-verify seal
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r5-11')] })
  contradiction(dir, 'r1-g1')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.refusal, 'contradiction-unresolvable')
})

test('B1 (budget): ONE revision per contradiction per obligation and succession line — an equivalent second contradiction escalates, and reordered ids, a different raising group and a different successor hash do not reset it', () => {
  const { dir } = runDir()
  sealedInitialChain(dir)
  contradiction(dir, 'r1-g1')
  const first = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(first.next.phase, 'a0-rev4')
  // the revision happened: prepared, sealed, implemented, re-reviewed, and the same conflict returns
  redSpec(dir, 'a0-rev4', { mode: 'revision', contractHash: `sha256:${'5'.repeat(64)}`, changedRows: ['R33', 'R34'] })
  redVerify(dir, 'a0-rev4', { contractHash: `sha256:${'5'.repeat(64)}`, snapshot: SHA('f') })
  handoff(dir, 'a0-rev4', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('d') })
  review(dir, 'r1', { mode: 're-review', readiness: { ready: false }, reviewedHead: SHA('d'), findings: [finding('r5-11')] })
  // same rows, other order, a DIFFERENT group, and now naming the NEW successor's hash
  contradiction(dir, 'r2-g3', { conflictingRowIds: ['R34', 'R33'], changedRows: ['R34', 'R33'], predecessorContractHash: `sha256:${'5'.repeat(64)}` })
  const second = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(second.next.step, 'blocked')
  assert.equal(second.next.reason, 'escalate')
  assert.equal(second.next.budget, 'contradictionRevisions')
})

test('B1 (budget): the key is stamped by publish, not spelled by the agent — equivalent contradictions share it and an unrelated row set does not', () => {
  const { dir } = runDir()
  sealedInitialChain(dir)
  const a = contradiction(dir, 'r1-g1')
  const keyA = JSON.parse(readFileSync(a.path, 'utf8')).contradictionKey
  assert.match(String(keyA), /^sha256:[0-9a-f]{64}$/)
  const { dir: dir2 } = runDir()
  sealedInitialChain(dir2)
  const b = contradiction(dir2, 'r4-g2', { conflictingRowIds: ['R34', 'R33'], changedRows: ['R33', 'R34'] })
  assert.equal(JSON.parse(readFileSync(b.path, 'utf8')).contradictionKey, keyA, 'order and raising group do not change the key')
  const { dir: dir3 } = runDir()
  sealedInitialChain(dir3)
  const c = contradiction(dir3, 'r1-g1', { conflictingRowIds: ['R40'], changedRows: ['R40'] })
  assert.notEqual(JSON.parse(readFileSync(c.path, 'utf8')).contradictionKey, keyA)
})

test('B1 (budget): a sibling run directory of the same PR cannot reset the contradiction budget by changing runId', () => {
  const root = mkdtempSync(join(tmpdir(), 'cycle-'))
  const runsRoot = join(root, '.pair', 'working', 'runs')
  const older = join(runsRoot, 'v4', '42')
  const newer = join(runsRoot, 'v5', '42')
  for (const d of [older, newer]) mkdirSync(d, { recursive: true })
  sealedInitialChain(older)
  contradiction(older, 'r1-g1')
  sealedInitialChain(newer)
  contradiction(newer, 'r1-g1')
  const r = resolve({ dir: newer, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, runsRoot, story: '42' })
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.budget, 'contradictionRevisions')
})

test('B1: the typed evidence is validated BEFORE the write — an incomplete contradiction is refused, and the old prose never becomes typed evidence by itself', () => {
  const { dir } = runDir()
  sealedInitialChain(dir)
  const bad = (fields, expected) => {
    const file = join(dir, `tmp-bad-${Math.random().toString(36).slice(2)}.json`)
    writeFileSync(
      file,
      JSON.stringify({
        run: 'run-1',
        story: '42',
        pr: 7,
        branch: 'feature/US-42',
        phase: 'r1-g1',
        skill: 'red-spec',
        inputHead: SHA('a'),
        status: 'contradiction',
        mode: 'remediation',
        revisionReason: 'contradicts-approved-authority',
        predecessorContractHash: `sha256:${'1'.repeat(64)}`,
        conflictingRowIds: ['R33', 'R34'],
        changedRows: ['R33', 'R34'],
        counterexample: CX,
        ...fields,
      }),
    )
    const out = publish({ dir, file, phase: 'r1-g1', skill: 'red-spec', workflowVersion: V })
    assert.equal(out.published, false, `expected a refusal for ${expected}`)
    assert.match(out.reason, new RegExp(expected))
    assert.equal(existsSync(join(dir, 'r1-g1-red-spec.json')), false, 'nothing was written')
  }
  bad({ counterexample: undefined }, 'counterexample-missing')
  bad({ counterexample: { ...CX, command: 'pnpm test && rm -rf /' } }, 'counterexample-command-unsafe')
  bad({ counterexample: { ...CX, actual: '' } }, 'counterexample-actual-missing')
  bad({ predecessorContractHash: 'a0-rev3' }, 'predecessorContractHash-invalid')
  bad({ conflictingRowIds: [] }, 'conflictingRowIds-invalid')
  bad({ changedRows: ['R33'] }, 'changedRows-incomplete:R34')
  bad({ revisionReason: 'because the rows disagree' }, 'revisionReason-invalid')
  // the prose refusal of 3.0.x carries none of this: it cannot be promoted by adding the reason alone
  bad({ status: 'split-required', splitReason: 'R33 and R34 collide' }, 'revisionReason-without-contradiction')
})

test('B1: split-required WITHOUT the typed evidence stays terminal — the old refusal is unchanged', () => {
  const { dir } = runDir()
  sealedInitialChain(dir)
  handoff(dir, 'r1-g1', 'red-spec', { status: 'split-required', mode: 'remediation', splitReason: 'a behavior repair and a refactor never share a contract' })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.reason, 'failed-preparation')
  assert.equal(r.next.refusal, 'split-required')
})

test('B1 (boundary): red-spec publishes `findings: { received, covered }` — its own documented envelope shape, not the review shape; a malformed one is still refused', () => {
  const { dir } = runDir()
  const ok = redSpec(dir, 'a0', { findings: { received: ['AC-1'], covered: ['AC-1'] } })
  assert.equal(JSON.parse(readFileSync(ok.path, 'utf8')).findings.received[0], 'AC-1')
  const file = join(dir, 'tmp-bad-findings.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('a'), status: 'red', findings: { received: [''], covered: [] } }))
  const out = publish({ dir, file, phase: 'r1-g1', skill: 'red-spec', workflowVersion: V })
  assert.equal(out.published, false)
  assert.equal(out.reason, 'findings-received-invalid')
  // the review shape is unchanged for the skill that actually uses it
  const rf = join(dir, 'tmp-bad-review.json')
  writeFileSync(rf, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r9', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'x', findings: { received: [] }, custody: {}, readiness: {} }))
  assert.equal(publish({ dir, file: rf, phase: 'r9', skill: 'review-phase', workflowVersion: V }).reason, 'findings-not-an-array')
})

// ── US-479 B2 (S10, AC-27, DT-33): legacy evidence is inspected, acknowledged and BOUND — never
// executed, never rewritten, and never silently dropped from the lifetime totals ────────────────
const sha256File = p => _hash('sha256').update(readFileSync(p)).digest('hex')
const digestDir = d =>
  readdirSync(d)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => `${f}:${sha256File(join(d, f))}`)
// A legacy (schema-2 / 3.0.x) run directory, written by hand exactly as the older engine left it.
function legacyRun(root, runId, { schemaVersion = 2, workflowVersion = '3.0.10', metrics } = {}) {
  const d = join(root, '.pair', 'working', 'runs', runId, '42')
  mkdirSync(d, { recursive: true })
  writeFileSync(
    join(d, 'r0-review-phase.json'),
    JSON.stringify({ run: runId, story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'CHANGES-REQUESTED', findings: [{ id: 'r0-1', severity: 'Major', location: 'x', description: 'd', recommendation: 'r', blocking: true, transition: 'open', kind: 'defect' }], custody: { verified: true, contractBreach: false }, readiness: { ready: false }, schemaVersion, workflowVersion, seq: 1 }, null, 2) + '\n',
  )
  if (metrics) writeFileSync(join(d, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n')
  return d
}
const LEGACY_METRICS = { schemaVersion: 1, identity: { canonicalRunId: 'v4', runIds: ['v4'] }, cycles: { attempted: 2, completed: 1 }, usage: { observedTotalTokens: 1200, inputTokens: 200, outputTokens: 1000, cacheReadTokens: 50, cacheWriteTokens: 25 } }

test('B2 (DT-33): migrate-acknowledge leaves every legacy file byte-identical, records verified digests, and writes exactly ONE record however many times it runs', () => {
  const root = mkdtempSync(join(tmpdir(), 'b2-'))
  const legacy = legacyRun(root, 'v4', { metrics: LEGACY_METRICS })
  const before = digestDir(legacy)
  const fresh = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(fresh, { recursive: true })
  const first = migrateAcknowledge({ dir: fresh, legacyDirs: [legacy], workflowVersion: V, story: '42', pr: 7, run: 'v5', branch: 'b', inputHead: SHA('a') })
  assert.equal(first.applied, true, JSON.stringify(first))
  assert.deepEqual(digestDir(legacy), before, 'the legacy evidence is untouched')
  const rec = JSON.parse(readFileSync(first.path, 'utf8'))
  assert.equal(rec.recordType, 'migration')
  assert.equal(rec.predecessorRuns.length, 1)
  assert.equal(rec.predecessorRuns[0].runId, 'v4')
  assert.equal(rec.predecessorRuns[0].inspection.next, 'migration-acknowledgment-required')
  assert.match(rec.predecessorRuns[0].handoffs[0].sha256, /^sha256:[0-9a-f]{64}$/)
  assert.equal(rec.predecessorRuns[0].metricsPath, join(legacy, 'metrics.json'))
  // no invented approval and no invented counter
  for (const k of ['verdict', 'readiness', 'reviewedHead', 'findings', 'cycles', 'usage']) assert.equal(rec[k], undefined, `${k} must not be fabricated by a migration`)
  const again = migrateAcknowledge({ dir: fresh, legacyDirs: [legacy], workflowVersion: V, story: '42', pr: 7, run: 'v5', branch: 'b', inputHead: SHA('a') })
  assert.equal(again.applied, false)
  assert.equal(again.reason, 'already-acknowledged')
  assert.equal(readdirSync(fresh).filter(f => /migration|review-phase/.test(f)).length, 1)
})

test('B2: a legacy file that CHANGED since it was acknowledged is refused — the digests are verified, not decorative', () => {
  const root = mkdtempSync(join(tmpdir(), 'b2-'))
  const legacy = legacyRun(root, 'v4')
  const fresh = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(fresh, { recursive: true })
  assert.equal(migrateAcknowledge({ dir: fresh, legacyDirs: [legacy], workflowVersion: V, story: '42', pr: 7, run: 'v5', branch: 'b', inputHead: SHA('a') }).applied, true)
  const f = join(legacy, 'r0-review-phase.json')
  writeFileSync(f, readFileSync(f, 'utf8').replace('CHANGES-REQUESTED', 'APPROVED'))
  const out = migrateAcknowledge({ dir: fresh, legacyDirs: [legacy], workflowVersion: V, story: '42', pr: 7, run: 'v5', branch: 'b', inputHead: SHA('a') })
  assert.equal(out.applied, false)
  assert.match(out.reason, /^predecessor-evidence-changed/)
})

test('B2: transitive predecessors are carried — acknowledging v4 from v5 keeps v3, which v4 itself acknowledged', () => {
  const root = mkdtempSync(join(tmpdir(), 'b2-'))
  const v3 = legacyRun(root, 'v3')
  const v4 = join(root, '.pair', 'working', 'runs', 'v4', '42')
  mkdirSync(v4, { recursive: true })
  migrateAcknowledge({ dir: v4, legacyDirs: [v3], workflowVersion: V, story: '42', pr: 7, run: 'v4', branch: 'b', inputHead: SHA('a') })
  const v5 = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(v5, { recursive: true })
  const out = migrateAcknowledge({ dir: v5, legacyDirs: [v4], workflowVersion: V, story: '42', pr: 7, run: 'v5', branch: 'b', inputHead: SHA('a') })
  assert.equal(out.applied, true)
  assert.deepEqual(JSON.parse(readFileSync(out.path, 'utf8')).predecessorRuns.map(r => r.runId).sort(), ['v3', 'v4'])
})

test('B2: the record is evidence, not a review — it confers no readiness, spends no review execution, and the cycle still starts where it would have', () => {
  const root = mkdtempSync(join(tmpdir(), 'b2-'))
  const legacy = legacyRun(root, 'v4')
  const fresh = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(fresh, { recursive: true })
  migrateAcknowledge({ dir: fresh, legacyDirs: [legacy], workflowVersion: V, story: '42', pr: 7, run: 'v5', branch: 'b', inputHead: SHA('a') })
  const r = resolve({ dir: fresh, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, story: '42' })
  assert.equal(r.status, 'in-progress')
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase }, { step: 'verify', mode: 'first', phase: 'r0', round: 0 }.step ? { step: 'verify', mode: 'first', phase: 'r0' } : {}, JSON.stringify(r.next))
  assert.equal(r.counters.reviewExecutions, 0, 'a migration is not a review execution')
  assert.deepEqual(r.predecessorRuns, ['v4'], 'the reference survives into the resume')
  // and a SECOND resume still carries it
  assert.deepEqual(resolve({ dir: fresh, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, story: '42' }).predecessorRuns, ['v4'])
})

test('B2: the legacy run directory itself is never adopted for execution — it stays incompatible, and nothing there is rewritten by the acknowledgment', () => {
  const root = mkdtempSync(join(tmpdir(), 'b2-'))
  const legacy = legacyRun(root, 'v4')
  const before = digestDir(legacy)
  const fresh = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(fresh, { recursive: true })
  migrateAcknowledge({ dir: fresh, legacyDirs: [legacy], workflowVersion: V, story: '42', pr: 7, run: 'v5', branch: 'b', inputHead: SHA('a') })
  assert.equal(resolve({ dir: legacy, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, story: '42' }).status, 'incompatible')
  assert.deepEqual(digestDir(legacy), before)
  assert.equal(migrateInspect({ dir: legacy }).next, 'migration-acknowledgment-required')
})

test('B2 (CLI): migrate-acknowledge runs from the shell the launch recipe uses, is idempotent there too, and never touches the legacy directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'b2-cli-'))
  const legacy = legacyRun(root, 'v4', { metrics: LEGACY_METRICS })
  const before = digestDir(legacy)
  const fresh = join(root, '.pair', 'working', 'runs', 'v5', '42')
  mkdirSync(fresh, { recursive: true })
  const cli = fileURLToPath(new URL('../../skills/pair-workflow-review-phase/scripts/cycle-state.mjs', import.meta.url))
  const run = () => spawnSync('node', [cli, 'migrate-acknowledge', '--dir', fresh, '--legacy', legacy, '--workflowVersion', V, '--story', '42', '--run', 'v5', '--head', SHA('a'), '--pr', '7', '--branch', 'b'], { encoding: 'utf8' })
  const first = run()
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.equal(JSON.parse(first.stdout).applied, true)
  const second = run()
  assert.equal(second.status, 0, 'an already-acknowledged binding is a success, not a failure')
  assert.equal(JSON.parse(second.stdout).reason, 'already-acknowledged')
  assert.deepEqual(digestDir(legacy), before)
  assert.equal(readdirSync(fresh).filter(f => f.endsWith('.json')).length, 1)
})

test('F1: a contradiction published BEFORE the key was stamped is history, not a missing seal — the refusal says which, and a fresh answer under this engine routes', () => {
  const root = mkdtempSync(join(tmpdir(), 'f1-unstamped-'))
  const runsRoot = join(root, '.pair', 'working', 'runs')
  const legacy = join(runsRoot, 'v4', '42')
  const dir = join(runsRoot, 'v5', '42')
  for (const d of [legacy, dir]) mkdirSync(d, { recursive: true })
  const hash = `sha256:${'1'.repeat(64)}`
  writeFileSync(join(legacy, 'a0-rev3-red-spec.json'), JSON.stringify({ schemaVersion: 2, workflowVersion: '3.0.13', run: 'v4', story: '42', pr: 7, branch: 'b', skill: 'red-spec', phase: 'a0-rev3', inputHead: SHA('a'), status: 'red', contractPath: '/abs/a0-rev3.json', contractHash: hash, seq: 1 }))
  writeFileSync(join(legacy, 'a0-rev3-red-verify.json'), JSON.stringify({ schemaVersion: 2, workflowVersion: '3.0.13', run: 'v4', story: '42', pr: 7, branch: 'b', skill: 'red-verify', phase: 'a0-rev3', inputHead: SHA('a'), verified: true, sealed: true, snapshot: SHA('e'), contractHash: hash, seq: 2 }))
  assert.equal(migrateAcknowledge({ dir, legacyDirs: [legacy], workflowVersion: V, story: '42', pr: 7, run: 'v5', branch: 'b', inputHead: SHA('a') }).applied, true)
  // a handoff exactly as an older engine left it: complete evidence, no stamped key
  writeFileSync(
    join(dir, 'r1-g1-red-spec.json'),
    JSON.stringify({ run: 'v5', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('a'), status: 'contradiction', mode: 'remediation', revisionReason: 'contradicts-approved-authority', predecessorContractHash: hash, conflictingRowIds: ['R33'], changedRows: ['R33'], counterexample: CX, contradictionKey: null, contradictionLine: null, schemaVersion: 3, workflowVersion: V, seq: 2 }),
  )
  const stale = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, story: '42', runsRoot })
  assert.equal(stale.next.refusal, 'contradiction-unresolvable')
  assert.match(stale.next.detail, /contradiction-key-unstamped/)
  // the same answer, re-published under THIS engine, routes the successor on the historical line
  const file = join(dir, 'draft.json')
  writeFileSync(file, JSON.stringify({ run: 'v5', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('a'), status: 'contradiction', mode: 'remediation', revisionReason: 'contradicts-approved-authority', predecessorContractHash: hash, conflictingRowIds: ['R33'], changedRows: ['R33'], counterexample: CX }))
  assert.equal(publish({ dir, file, phase: 'r1-g1', skill: 'red-spec', workflowVersion: V, pr: 7, attempt: 2 }).published, true)
  const fresh = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, story: '42', runsRoot })
  assert.deepEqual({ step: fresh.next.step, mode: fresh.next.mode, phase: fresh.next.phase, run: fresh.next.predecessorRunId }, { step: 'prepare', mode: 'revision', phase: 'a0-rev4', run: 'v4' })
})

// ── US-479 F1 residual (independent verification of 82de9dce): the predecessor's identity is a
// COHERENT SET of necessary proofs — a sealed red-verify alone does not make a revision routable ──
function legacySealedChain(root, runId = 'v4', { hash = `sha256:${'1'.repeat(64)}`, phase = 'a0-rev3' } = {}) {
  const d = join(root, '.pair', 'working', 'runs', runId, '42')
  mkdirSync(d, { recursive: true })
  const base = { schemaVersion: 2, workflowVersion: '3.0.13', run: runId, story: '42', pr: 7, branch: 'b', phase, inputHead: SHA('a') }
  writeFileSync(join(d, `${phase}-red-spec.json`), JSON.stringify({ ...base, skill: 'red-spec', status: 'red', mode: 'revision', contractPath: join(d, `${phase}-red-contract.json`), contractHash: hash, seq: 1 }, null, 2) + '\n')
  writeFileSync(join(d, `${phase}-red-verify.json`), JSON.stringify({ ...base, skill: 'red-verify', verified: true, sealed: true, snapshot: SHA('e'), contractHash: hash, seq: 2 }, null, 2) + '\n')
  return d
}
function boundCycle(root, legacyDir, runId = 'v5') {
  const dir = join(root, '.pair', 'working', 'runs', runId, '42')
  mkdirSync(dir, { recursive: true })
  const out = migrateAcknowledge({ dir, legacyDirs: [legacyDir], workflowVersion: V, story: '42', pr: 7, run: runId, branch: 'b', inputHead: SHA('a') })
  assert.equal(out.applied, true, JSON.stringify(out))
  return dir
}
function publishContradiction(dir, extra = {}) {
  const file = join(dir, `draft-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(file, JSON.stringify({ run: 'v5', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('a'), status: 'contradiction', mode: 'remediation', revisionReason: 'contradicts-approved-authority', predecessorContractHash: `sha256:${'1'.repeat(64)}`, conflictingRowIds: ['R33', 'R34'], changedRows: ['R33', 'R34'], counterexample: CX, findings: { received: ['r0-1'], covered: [] }, ...extra }))
  return publish({ dir, file, phase: 'r1-g1', skill: 'red-spec', workflowVersion: V, pr: 7 })
}
const resolveBound = (dir, runsRoot) => resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, story: '42', runsRoot })

test('F1 residual: spec AND verify intact — the revision is routed with a complete, hash-consistent contract descriptor and its provenance', () => {
  const root = mkdtempSync(join(tmpdir(), 'f1r-'))
  const runsRoot = join(root, '.pair', 'working', 'runs')
  const legacy = legacySealedChain(root)
  const dir = boundCycle(root, legacy)
  assert.equal(publishContradiction(dir).published, true)
  const n = resolveBound(dir, runsRoot).next
  assert.deepEqual({ step: n.step, mode: n.mode, phase: n.phase, run: n.predecessorRunId, phaseOf: n.predecessorPhase }, { step: 'prepare', mode: 'revision', phase: 'a0-rev4', run: 'v4', phaseOf: 'a0-rev3' })
  assert.equal(n.contract.path, join(legacy, 'a0-rev3-red-contract.json'))
  assert.equal(n.contract.hash, `sha256:${'1'.repeat(64)}`)
  assert.equal(n.contract.snapshot, SHA('e'))
  assert.deepEqual(n.revalidate, ['scopeEpoch', 'scopeBaselineHash', 'findings-origin'])
})

test('F1 residual: the red-spec that carries the contract descriptor is a NECESSARY proof — altered, absent, or disagreeing on the hash, the contradiction is refused rather than routed without a base', () => {
  const cases = [
    [
      'spec altered after the acknowledgment (verify intact)',
      legacy => writeFileSync(join(legacy, 'a0-rev3-red-spec.json'), readFileSync(join(legacy, 'a0-rev3-red-spec.json'), 'utf8').replace('"mode": "revision"', '"mode": "initial"')),
      /predecessor-evidence-changed|predecessor-evidence-incomplete/,
    ],
    ['spec absent', legacy => rmSync(join(legacy, 'a0-rev3-red-spec.json')), /predecessor-evidence-changed|predecessor-evidence-incomplete/],
    [
      'the descriptor names another contract hash',
      legacy => {
        const p = join(legacy, 'a0-rev3-red-spec.json')
        const d = JSON.parse(readFileSync(p, 'utf8'))
        d.contractHash = `sha256:${'7'.repeat(64)}`
        writeFileSync(p, JSON.stringify(d, null, 2) + '\n')
      },
      /predecessor-evidence/,
    ],
    [
      'the descriptor carries no contract path',
      legacy => {
        const p = join(legacy, 'a0-rev3-red-spec.json')
        const d = JSON.parse(readFileSync(p, 'utf8'))
        delete d.contractPath
        writeFileSync(p, JSON.stringify(d, null, 2) + '\n')
      },
      /predecessor-evidence/,
    ],
  ]
  for (const [name, tamper, expected] of cases) {
    const root = mkdtempSync(join(tmpdir(), 'f1r-'))
    const runsRoot = join(root, '.pair', 'working', 'runs')
    const legacy = legacySealedChain(root)
    const dir = boundCycle(root, legacy)
    const digestBefore = digestDir(legacy)
    // the contradiction is published BEFORE the tamper for the hash/path cases too: publish must
    // still stamp a key, and the refusal must come from the route, never from a silent success
    assert.equal(publishContradiction(dir).published, true, name)
    tamper(legacy)
    const n = resolveBound(dir, runsRoot).next
    assert.equal(n.step, 'blocked', name)
    assert.equal(n.refusal, 'contradiction-unresolvable', name)
    assert.match(n.detail, expected, `${name}: ${n.detail}`)
    // a refusal never routes a revision, and never touches the legacy
    assert.equal(n.contract, undefined, name)
    if (name === 'spec absent') assert.equal(digestDir(legacy).length, digestBefore.length - 1, name)
    else assert.notDeepEqual(digestDir(legacy), digestBefore, `${name}: the tamper is what the test measures`)
  }
})

test('F1 residual: an altered or absent red-VERIFY is refused too — the two proofs are checked separately, not one standing for the other', () => {
  for (const [name, tamper] of [
    ['verify absent', legacy => rmSync(join(legacy, 'a0-rev3-red-verify.json'))],
    ['verify altered', legacy => writeFileSync(join(legacy, 'a0-rev3-red-verify.json'), readFileSync(join(legacy, 'a0-rev3-red-verify.json'), 'utf8').replace('"sealed": true', '"sealed": false'))],
  ]) {
    const root = mkdtempSync(join(tmpdir(), 'f1r-'))
    const runsRoot = join(root, '.pair', 'working', 'runs')
    const legacy = legacySealedChain(root)
    const dir = boundCycle(root, legacy)
    assert.equal(publishContradiction(dir).published, true, name)
    tamper(legacy)
    const n = resolveBound(dir, runsRoot).next
    assert.equal(n.step, 'blocked', name)
    assert.equal(n.refusal, 'contradiction-unresolvable', name)
    assert.equal(n.contract, undefined, name)
  }
})

test('F1 residual: the same rule applies to the CURRENT run — a sealed verify whose red-spec was never published routes nothing', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial', contractHash: `sha256:${'9'.repeat(64)}` })
  redVerify(dir, 'a0', { contractHash: `sha256:${'9'.repeat(64)}` })
  // a seal for a phase that has no red-spec of its own: the descriptor does not exist
  handoff(dir, 'a0-rev2', 'red-verify', { verified: true, sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}` })
  review(dir, 'r0', { readiness: { ready: false }, findings: [finding('r0-1')] })
  contradiction(dir, 'r1-g1')
  const n = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).next
  assert.equal(n.step, 'blocked')
  assert.equal(n.refusal, 'contradiction-unresolvable')
  assert.match(n.detail, /contract-descriptor-missing/)
})

test('F1 residual: a descriptor whose digest still MATCHES the acknowledgment but whose contract hash disagrees is refused with that exact reason — the discrepancy is semantic, not just a moved byte', () => {
  const root = mkdtempSync(join(tmpdir(), 'f1r-'))
  const runsRoot = join(root, '.pair', 'working', 'runs')
  const legacy = legacySealedChain(root)
  // the disagreement exists BEFORE the acknowledgment, so every digest is valid afterwards
  const p = join(legacy, 'a0-rev3-red-spec.json')
  const spec = JSON.parse(readFileSync(p, 'utf8'))
  spec.contractHash = `sha256:${'7'.repeat(64)}`
  writeFileSync(p, JSON.stringify(spec, null, 2) + '\n')
  const dir = boundCycle(root, legacy)
  const before = digestDir(legacy)
  assert.equal(predecessorEvidence(dir)[0].changed, null, 'every recorded digest still matches')
  assert.equal(publishContradiction(dir).published, true)
  const n = resolveBound(dir, runsRoot).next
  assert.equal(n.step, 'blocked')
  assert.equal(n.refusal, 'contradiction-unresolvable')
  assert.match(n.detail, /predecessor-evidence-incomplete:v4\/a0-rev3:contract-descriptor-hash-mismatch:sha256:7{64}/)
  assert.equal(n.contract, undefined)
  assert.deepEqual(digestDir(legacy), before, 'nothing in the legacy was rewritten')
})

// ── US-479 T-29 / S11 (D5): regression-risk rewind, guards and discharge ─────────────────────
// "Rewind" is a workflow-state transition back to the introducing batch's remediation. The branch
// stays on its current head, the fix goes FORWARD, and `lastCleanReviewedHead` is only the
// behavioural baseline the guard is compared against. No Git operation is part of the algorithm.
const H0 = SHA('0')
const H1 = SHA('1')
const H2 = SHA('2')
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
// H0 reviewed clean, remediation batch r1 fixes r0-1 and produces H1.
function cleanThenRemediated(dir) {
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: H0 })
  review(dir, 'r0', { reviewedHead: H0, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')] })
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H1, evidenceLedger: [], remediationBatchId: 'r1' })
}
const reviewOf = (dir, phase, extra, opts) => review(dir, phase, { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, ...extra }, opts)

test('T-29 (DT-37): a review that proves a regression introduced by batch r1 persists ONE stable active risk, invalidates that batch, and derives the SAME batch`s remediation carrying the original findings plus the risk', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const out = reviewOf(dir, 'r1', {
    findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed by r1' }), regressionFinding()],
    invalidatedBatchId: 'r1',
  })
  const stored = JSON.parse(readFileSync(out.path, 'utf8')).findings.find(f => f.id === 'r1-9')
  // the id is derived by the script from PR + finding + introducing batch, never spelled by an agent
  assert.match(stored.regressionRisk.riskId, /^risk:[0-9a-f]{16}$/)
  assert.equal(stored.regressionRisk.state, 'active')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase, batch: r.next.regressionRepairOf }, { step: 'prepare', mode: 'remediation', phase: 'r1-g1', batch: 'r1' })
  assert.equal(r.next.attempt, 2, 'the same batch is prepared again; no new round, no new run')
  // the single complete contract carries the original unresolved findings AND every active guard
  assert.deepEqual(
    r.next.regressionRisks.map(x => ({ id: x.riskId, batch: x.introducedByRemediationBatchId, guard: x.reproducerRef })),
    [{ id: stored.regressionRisk.riskId, batch: 'r1', guard: GUARD.reproducerRef }],
  )
  assert.deepEqual(r.next.findings.map(f => f.id).sort(), ['r1-9'], 'r0-1 is closed; the regression is what remains open')
  assert.deepEqual(r.activeRegressionRisks.map(x => x.riskId), [stored.regressionRisk.riskId])
  assert.equal(r.counters.invalidatedRemediations, 1)
  assert.equal(r.counters.completedCycles, 0, 'an invalidated remediation is attempted, never completed')
  assert.equal(r.counters.attemptedCycles, 1)
})

test('T-29 (DT-37): the forward fix and an independent review bound to the EXACT new head discharge the risk, empty the active matrix, keep the history and allow convergence', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const riskId = JSON.parse(readFileSync(join(dir, 'r1-review-phase.json'), 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk.riskId
  // the same batch, prepared again, verified and fixed FORWARD to H2
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  const closing = review(dir, 'r2', {
    mode: 're-review',
    reviewedHead: H2,
    verdict: 'APPROVED',
    readiness: { ready: true, remoteHead: H2 },
    findings: [
      finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'still closed at H2' }),
      finding('r1-9', {
        transition: 'resolved',
        blocking: false,
        evidence: 'guard green at H2',
        origin: 'introduced-by-remediation',
        obligationIds: ['AC-7'],
        originEvidence: { baselineHead: H0, failingHead: H1, reproducer: GUARD.reproducerRef },
        regressionRisk: risk({ state: 'discharged', dischargedHead: H2, dischargedByReviewId: 'r2-review-phase' }),
      }),
    ],
  })
  const dischargedRisk = JSON.parse(readFileSync(closing.path, 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk
  assert.equal(dischargedRisk.riskId, riskId, 'the same stable id, never a new one')
  assert.equal(dischargedRisk.state, 'discharged')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.activeRegressionRisks, [], 'the derived active matrix is empty')
  assert.deepEqual({ step: r.next.step, head: r.next.reviewedHead }, { step: 'done', head: H2 })
  assert.equal(r.counters.invalidatedRemediations, 1, 'the invalidation stays in history')
  assert.equal(r.counters.regressionRepairs, 1)
  assert.equal(r.counters.dischargedRegressionRisks, 1)
  assert.equal(r.counters.activeRegressionRisks, 0)
  assert.equal(r.counters.completedCycles, 1, 'the cycle completes only now')
})

test('T-29 (DT-37): convergence, scope escalation and readiness are impossible while a risk is active', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', {
    verdict: 'APPROVED',
    readiness: { ready: true, remoteHead: H1 },
    scopeChanges: [{ id: 'sc-1', type: 'new-requirement', status: 'pending', description: 'a proposal' }],
    findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), regressionFinding('r1-9')],
    invalidatedBatchId: 'r1',
  })
  // AMENDED by US-479 DR-10: this used to publish the risk on a NON-blocking finding, to prove the
  // derivation refuses to converge even then. That payload is now refused one step earlier — an
  // active risk is by definition an open blocker — so the defence is asserted in BOTH places: the
  // write is rejected, and the derivation still refuses to converge on the legal payload below.
  const nonBlocking = join(mkdtempSync(join(tmpdir(), 'dt37-')), 'draft.json')
  writeFileSync(nonBlocking, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r2', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'APPROVED', custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: H1 }, mode: 're-review', invalidatedBatchId: 'r1', findings: [regressionFinding('r1-9', { blocking: false, transition: 'open' })] }))
  const refused = publish({ dir, file: nonBlocking, phase: 'r2', skill: 'review-phase', workflowVersion: V })
  assert.equal(refused.published, false, 'an active risk on a non-blocking finding is not writable')
  assert.match(refused.reason, /finding-transition-incoherent/)
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.notEqual(r.next.step, 'done')
  assert.notEqual(r.next.reason, 'awaiting-scope-decision')
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, phase: r.next.phase }, { step: 'prepare', mode: 'remediation', phase: 'r1-g1' })
  assert.equal(r.activeRegressionRisks.length, 1)
})

test('T-29 (DT-37): `introduced-by-remediation` is refused BEFORE the write unless every S11 proof is present and mutually consistent', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const bad = (mutate, expected) => {
    const f = join(dir, `draft-${Math.random().toString(36).slice(2)}.json`)
    const findings = [mutate(regressionFinding())]
    writeFileSync(f, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', findings, invalidatedBatchId: 'r1' }))
    const out = publish({ dir, file: f, phase: 'r1', skill: 'review-phase', workflowVersion: V, attempt: 9 })
    assert.equal(out.published, false, `expected a refusal for ${expected}`)
    assert.match(out.reason, new RegExp(expected))
  }
  bad(f => ({ ...f, regressionRisk: undefined }), 'regressionRisk-missing')
  bad(f => ({ ...f, obligationIds: undefined }), 'regression-obligation-missing')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, lastCleanReviewedHead: undefined } }), 'lastCleanReviewedHead-invalid')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, firstFailingHead: undefined } }), 'firstFailingHead-invalid')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, lastCleanReviewedHead: H1 } }), 'regression-heads-identical')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, introducedByRemediationBatchId: undefined } }), 'introducedByRemediationBatchId-invalid')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, reproducerRef: undefined } }), 'reproducerRef-invalid')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, reproducerRef: 'pnpm test && rm -rf /' } }), 'reproducerRef-unsafe')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, closureAssertions: [] } }), 'closureAssertions-missing')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, affectedBoundaryRefs: [] } }), 'affectedBoundaryRefs-missing')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, state: 'whatever' } }), 'regressionRisk-state-invalid')
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, introducedByRemediationBatchId: 'r9' } }), 'regression-batch-unknown')
  // the failing head must actually be the one the named batch produced
  bad(f => ({ ...f, regressionRisk: { ...f.regressionRisk, firstFailingHead: SHA('7') } }), 'firstFailingHead-not-from-batch')
  assert.equal(existsSync(join(dir, 'r1-review-phase.attempt-9.json')), false, 'nothing was written')
})

test('T-29 (DT-38): a guard that also fails on the baseline head, a changed requirement and insufficient evidence never become regressions', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  // a reviewer that cannot show the obligation passing at H0 has no regression to claim: the
  // finding stays an ordinary defect of unknown origin, and no risk enters the matrix
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), finding('r1-8', { origin: 'unknown' })] })
  const unknown = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(unknown.activeRegressionRisks, [])
  assert.deepEqual({ step: unknown.next.step, phase: unknown.next.phase }, { step: 'prepare', phase: 'r2-g1' }, 'the ordinary next round, not a rewind')
  assert.equal(unknown.counters.invalidatedRemediations, 0)
  // a new requirement is a scope proposal and never a risk
  const { dir: dir2 } = runDir()
  cleanThenRemediated(dir2)
  reviewOf(dir2, 'r1', {
    verdict: 'APPROVED',
    readiness: { ready: true, remoteHead: H1 },
    findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' })],
    scopeChanges: [{ id: 'sc-1', type: 'new-requirement', status: 'pending', description: 'a genuinely new AC' }],
  })
  const scoped = resolve({ dir: dir2, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(scoped.activeRegressionRisks, [])
  assert.equal(scoped.next.reason, 'awaiting-scope-decision')
})

test('T-29 (DT-38): replay, restart and repeated discovery reuse the SAME risk id and duplicate nothing; a distinct regression gets a distinct id', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const first = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  const id = first.activeRegressionRisks[0].riskId
  // a restart between persist and deriveNext: the same next step and the same id
  const again = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(again.next, first.next)
  assert.deepEqual(again.activeRegressionRisks, first.activeRegressionRisks)
  // the same regression observed a second time by the next reviewer of the same head
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', regressionGuards: [id] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [id] }, { attempt: 2 })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: false, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r1' }, { attempt: 2 })
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [regressionFinding('r1-9')], invalidatedBatchId: 'r1' })
  const repeated = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(repeated.activeRegressionRisks.map(x => x.riskId), [id], 'one risk, still the same id')
  assert.equal(repeated.counters.invalidatedRemediations, 1, 'the same batch invalidated twice is one invalidated remediation')
  assert.equal(repeated.counters.activeRegressionRisks, 1)
  // a DIFFERENT regression from the same batch is its own risk
  review(dir, 'r3', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [regressionFinding('r1-9'), regressionFinding('r1-10', { regressionRisk: risk({ firstFailingHead: H2 }) })], invalidatedBatchId: 'r1' })
  const two = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(two.activeRegressionRisks.length, 2)
  assert.equal(new Set(two.activeRegressionRisks.map(x => x.riskId)).size, 2)
  assert.deepEqual(two.next.regressionRisks.map(x => x.riskId).sort(), two.activeRegressionRisks.map(x => x.riskId).sort())
})

// US-479 F-1 note: this history concludes THREE corrective cycles (r1, its repair, r3), which a
// budget of three now legitimately stops — `spentCycles` counts concluded cycles, not successful
// ones. The subject here is the riskId semantics of a reintroduction, so the budget is taken out of
// the question rather than the assertions being changed.
const REOPEN_POLICY = { ...POLICY, maxFixRounds: 9 }
test('T-29 (DT-38): a reintroduction after discharge REOPENS the same risk id and is not a new discovery', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const id = resolve({ dir, workflowVersion: V, policy: REOPEN_POLICY, entry: 'pr', pr: 7 }).activeRegressionRisks[0].riskId
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', regressionGuards: [id] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [id] }, { attempt: 2 })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r1' }, { attempt: 2 })
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'APPROVED', readiness: { ready: true, remoteHead: H2 }, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), finding('r1-9', { transition: 'resolved', blocking: false, evidence: 'green', origin: 'introduced-by-remediation', obligationIds: ['AC-7'], originEvidence: { baselineHead: H0, failingHead: H1, reproducer: GUARD.reproducerRef }, regressionRisk: risk({ state: 'discharged', dischargedHead: H2, dischargedByReviewId: 'r2-review-phase' }) })] })
  assert.deepEqual(resolve({ dir, workflowVersion: V, policy: REOPEN_POLICY, entry: 'pr', pr: 7 }).activeRegressionRisks, [])
  // a later round reintroduces it: the SAME id comes back active
  handoff(dir, 'r3-g1', 'red-spec', { status: 'red', mode: 'remediation', contractPath: '/abs/c.json', contractHash: `sha256:${'1'.repeat(64)}`, groupId: 'r3-g1', remediationBatchId: 'r3' })
  handoff(dir, 'r3-g1', 'red-verify', { verified: true, findings: [], sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}`, remediationBatchId: 'r3' })
  handoff(dir, 'r3-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('3'), evidenceLedger: [], remediationBatchId: 'r3' })
  review(dir, 'r4', { mode: 're-review', reviewedHead: SHA('3'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [regressionFinding('r1-9', { regressionRisk: risk({ introducedByRemediationBatchId: 'r3', lastCleanReviewedHead: H2, firstFailingHead: SHA('3') }) })], invalidatedBatchId: 'r3' })
  const back = resolve({ dir, workflowVersion: V, policy: REOPEN_POLICY, entry: 'pr', pr: 7 })
  // S11 keys `riskId` on PR + stable finding id + INTRODUCING batch, so a reintroduction by a
  // later batch is a new risk ENTRY for the same finding: the finding id is what stays stable, and
  // that is why this is a reopen rather than a new discovery. The r1 risk stays discharged in the
  // append-only history; the r3 one is active. (A reintroduction by the SAME batch reuses the id —
  // that case is the repeated-discovery test above.)
  assert.equal(back.activeRegressionRisks.length, 1)
  assert.equal(back.activeRegressionRisks[0].findingId, 'r1-9', 'the same stable finding, reopened')
  assert.equal(back.activeRegressionRisks[0].introducedByRemediationBatchId, 'r3')
  assert.equal(back.counters.dischargedRegressionRisks, 1, 'the discharged r1 risk remains in history')
  assert.equal(back.counters.invalidatedRemediations, 2)
  assert.deepEqual({ step: back.next.step, phase: back.next.phase, batch: back.next.regressionRepairOf }, { step: 'prepare', phase: 'r3-g1', batch: 'r3' })
})

test('T-29 (S11): a discharge is refused unless it is bound to the EXACT reviewed head, and a caller-supplied active matrix is never accepted', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const f = join(dir, 'draft-discharge.json')
  const dischargeDraft = head =>
    JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r2', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H2, verdict: 'APPROVED', custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: H2 }, mode: 're-review', findings: [finding('r1-9', { transition: 'resolved', blocking: false, evidence: 'green', origin: 'introduced-by-remediation', obligationIds: ['AC-7'], originEvidence: { baselineHead: H0, failingHead: H1, reproducer: GUARD.reproducerRef }, regressionRisk: risk({ state: 'discharged', dischargedHead: head, dischargedByReviewId: 'r2-review-phase' }) })] })
  writeFileSync(f, dischargeDraft(SHA('9')))
  const wrongHead = publish({ dir, file: f, phase: 'r2', skill: 'review-phase', workflowVersion: V })
  assert.equal(wrongHead.published, false)
  assert.match(wrongHead.reason, /discharge-head-mismatch/)
  // an aggregate matrix handed in by the caller is refused: the matrix is derived, never stored
  const m = join(dir, 'draft-matrix.json')
  writeFileSync(m, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r2', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H2, verdict: 'APPROVED', custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: H2 }, mode: 're-review', findings: [], activeRegressionRisks: [{ riskId: 'risk:deadbeefdeadbeef' }] }))
  const supplied = publish({ dir, file: m, phase: 'r2', skill: 'review-phase', workflowVersion: V })
  assert.equal(supplied.published, false)
  assert.match(supplied.reason, /activeRegressionRisks-not-storable/)
})

// ── US-479 S12 / AC-30 / DT-39: the negative transition matrix of the regression-risk ledger ──
// One authority validates every transition against the PERSISTED ledger. "Latest entry wins" is
// not a validation: a payload that never had an active predecessor, or that mutates the immutable
// evidence it is supposed to discharge, is refused BEFORE the write.
const rrDraft = (dir, fields) => {
  const file = join(mkdtempSync(join(tmpdir(), 'rr-draft-')), 'draft.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r2', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H2, verdict: 'APPROVED', custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: H2 }, mode: 're-review', ...fields }))
  return file
}
const dischargedFinding = (extra = {}, riskExtra = {}) =>
  finding('r1-9', {
    transition: 'resolved',
    blocking: false,
    evidence: 'guard green at H2',
    origin: 'introduced-by-remediation',
    obligationIds: ['AC-7'],
    originEvidence: { baselineHead: H0, failingHead: H1, reproducer: GUARD.reproducerRef },
    regressionRisk: risk({ state: 'discharged', dischargedHead: H2, dischargedByReviewId: 'r2-review-phase', ...riskExtra }),
    ...extra,
  })
// The matching regression repair: the same batch prepared again and fixed FORWARD to H2.
function matchingRepair(dir, riskId, { outputHead = H2, fixed = true } = {}) {
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  handoff(dir, 'r1-g1', 'green-fix', { fixed, needsHumanDecision: false, outputHead, evidenceLedger: [], remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
}
function provenRisk(dir) {
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed by r1' }), regressionFinding()], invalidatedBatchId: 'r1' })
  return JSON.parse(readFileSync(join(dir, 'r1-review-phase.json'), 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk.riskId
}

test('AC-30 (normative RED): a review that jumps straight to `discharged` with no active predecessor is refused before any write, and nothing at all moves', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const before = { handoffs: readdirSync(dir).filter(f => f.endsWith('.json')).sort(), digests: digestDir(dir), counters: resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).counters }
  const out = publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /^regression-risk-transition-invalid:risk:[0-9a-f]{16}:missing-active-predecessor$/)
  const after = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(readdirSync(dir).filter(f => f.endsWith('.json')).sort(), before.handoffs, 'no new handoff')
  assert.deepEqual(digestDir(dir), before.digests, 'seals and history byte-identical')
  assert.notEqual(after.next.step, 'done')
  assert.deepEqual(after.counters, before.counters, 'no counter moved')
  assert.deepEqual(after.activeRegressionRisks, [], 'no risk was fabricated')
  assert.equal(after.counters.dischargedRegressionRisks, 0)
  assert.equal(after.counters.regressionRepairs, 0)
})

test('F-RR-01: a discharge with no matching completed regression repair is refused', () => {
  const { dir } = runDir()
  provenRisk(dir)
  const before = digestDir(dir)
  const out = publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /missing-matching-repair/)
  assert.deepEqual(digestDir(dir), before)
})

test('F-RR-01: a repair that did not FIX, or whose head is not the reviewed head, is not a matching repair', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId, { fixed: false })
  assert.match(publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V }).reason, /missing-matching-repair/)
  const { dir: dir2 } = runDir()
  const riskId2 = provenRisk(dir2)
  matchingRepair(dir2, riskId2, { outputHead: SHA('7') })
  assert.match(publish({ dir: dir2, file: rrDraft(dir2, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V }).reason, /discharge-head-mismatch|missing-matching-repair/)
})

test('F-RR-01: a discharge that MUTATES any immutable field of the active entry is refused, field by field', () => {
  const mutations = [
    ['reproducerRef', { reproducerRef: 'pnpm exec vitest run other.test.ts' }],
    ['closureAssertions', { closureAssertions: [{ id: 'ca-2', command: 'pnpm exec vitest run other.test.ts', expected: 'pass' }] }],
    ['affectedBoundaryRefs', { affectedBoundaryRefs: ['installer:other'] }],
    ['introducedByRemediationBatchId', { introducedByRemediationBatchId: 'r0' }],
    ['lastCleanReviewedHead', { lastCleanReviewedHead: SHA('8') }],
    ['firstFailingHead', { firstFailingHead: SHA('8') }],
  ]
  for (const [field, riskExtra] of mutations) {
    const { dir } = runDir()
    const riskId = provenRisk(dir)
    matchingRepair(dir, riskId)
    const before = digestDir(dir)
    const out = publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), dischargedFinding({}, riskExtra)] }), phase: 'r2', skill: 'review-phase', workflowVersion: V })
    assert.equal(out.published, false, field)
    assert.match(out.reason, new RegExp(`immutable-field-mismatch:${field}|missing-active-predecessor`), `${field}: ${out.reason}`)
    assert.deepEqual(digestDir(dir), before, field)
  }
  // the obligation the risk cites is immutable too
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  const out = publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), dischargedFinding({ obligationIds: ['AC-9'] })] }), phase: 'r2', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /immutable-field-mismatch:obligationIds/)
})

test('F-RR-01: a discharge is refused while the batch`s ORIGINAL finding is not carried and confirmed closed', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  // r0-1 omitted entirely
  assert.match(publish({ dir, file: rrDraft(dir, { findings: [dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V }).reason, /original-finding-not-closed:r0-1/)
  // r0-1 carried but still open
  assert.match(publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1'), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V }).reason, /original-finding-not-closed:r0-1/)
})

test('F-RR-01: state, transition and blocking are ONE transition — an incoherent triple is refused', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  // discharged but the finding still says open
  assert.match(publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), dischargedFinding({ transition: 'open', blocking: true })] }), phase: 'r2', skill: 'review-phase', workflowVersion: V }).reason, /finding-transition-incoherent/)
  // an ACTIVE risk on a finding declared resolved
  const { dir: dir2 } = runDir()
  cleanThenRemediated(dir2)
  const f = join(dir2, 'draft-active.json')
  writeFileSync(f, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', invalidatedBatchId: 'r1', findings: [regressionFinding('r1-9', { transition: 'resolved', blocking: false, evidence: 'x' })] }))
  assert.match(publish({ dir: dir2, file: f, phase: 'r1', skill: 'review-phase', workflowVersion: V }).reason, /finding-transition-incoherent/)
})

test('F-RR-01 (positive): active -> matching repair -> exact-head review discharges the SAME risk, empties the active matrix and keeps history', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  const out = publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed at H2' }), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, true, JSON.stringify(out))
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.activeRegressionRisks, [])
  assert.equal(r.counters.dischargedRegressionRisks, 1)
  assert.equal(JSON.parse(readFileSync(out.path, 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk.riskId, riskId)
  assert.equal(r.next.step, 'done')
  assert.ok(readHandoffs(dir).some(h => h.name === 'r1-review-phase'), 'the invalidating review is still in history')
})

test('F-RR-02: a qualification whose baseline, failing head, origin evidence or invalidated batch disagrees with persisted history is refused', () => {
  const cases = [
    ['baseline-not-reviewed-clean', { lastCleanReviewedHead: SHA('5') }, {}, {}],
    // a head the batch never produced is BOTH not-from-batch and not-this-review: either typed
    // refusal is the same illegal claim, refused before the write
    ['failing-head-not-current-review|firstFailingHead-not-from-batch', { firstFailingHead: SHA('6') }, {}, {}],
    ['origin-evidence-mismatch', {}, { originEvidence: { baselineHead: SHA('5'), failingHead: H1, reproducer: GUARD.reproducerRef } }, {}],
    ['origin-evidence-mismatch', {}, { originEvidence: { baselineHead: H0, failingHead: H1, reproducer: 'pnpm exec vitest run something-else.test.ts' } }, {}],
    ['invalidated-batch-mismatch', {}, {}, { invalidatedBatchId: 'r0' }],
  ]
  for (const [expected, riskExtra, findingExtra, envelopeExtra] of cases) {
    const { dir } = runDir()
    cleanThenRemediated(dir)
    const before = digestDir(dir)
    const f = join(mkdtempSync(join(tmpdir(), 'rr-draft-')), 'draft.json')
    writeFileSync(f, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', invalidatedBatchId: 'r1', findings: [regressionFinding('r1-9', { ...findingExtra, regressionRisk: risk(riskExtra) })], ...envelopeExtra }))
    const out = publish({ dir, file: f, phase: 'r1', skill: 'review-phase', workflowVersion: V })
    assert.equal(out.published, false, expected)
    assert.match(out.reason, new RegExp(expected), `${expected}: ${out.reason}`)
    assert.deepEqual(digestDir(dir), before, expected)
  }
})

test('F-RR-02: the failing head must be one the named batch actually PRODUCED — a reviewedHead of any handoff is not a batch output', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  // H0 is the head review r0 read back; it is not an output of batch r1
  const f = join(mkdtempSync(join(tmpdir(), 'rr-draft-')), 'draft.json')
  writeFileSync(f, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H0, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', invalidatedBatchId: 'r1', findings: [regressionFinding('r1-9', { regressionRisk: risk({ lastCleanReviewedHead: H1, firstFailingHead: H0 }) })] }))
  const out = publish({ dir, file: f, phase: 'r1', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /firstFailingHead-not-from-batch|baseline-not-reviewed-clean/)
})

test('F-RR-04: a mandatory human decision is evaluated BEFORE the automatic rewind — escalation wins, nothing is prepared or discharged', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { needsHumanDecision: true, humanDecisionKind: 'history-rewrite', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.reason, 'escalate')
  assert.match(r.next.detail, /history-rewrite/)
  assert.equal(r.activeRegressionRisks.length, 1, 'the risk stays active and untouched')
  assert.notEqual(r.next.step, 'prepare')
  assert.equal(r.counters.dischargedRegressionRisks, 0)
})

test('F-RR-04: a plain scope proposal does NOT take precedence — the rewind still happens and quality risks are closed first', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { scopeChanges: [{ id: 'sc-1', type: 'new-requirement', status: 'pending', description: 'later' }], findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, mode: r.next.mode, batch: r.next.regressionRepairOf }, { step: 'prepare', mode: 'remediation', batch: 'r1' })
})

test('F-RR-05: the rewind targets the group that actually PRODUCED the failing head, with that group`s own scope — never a hard-coded -g1', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: H0 })
  review(dir, 'r0', { reviewedHead: H0, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2')] })
  // batch r1 with TWO groups; g2 is the one that produces the failing head
  const plan = { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'g1-owner', mode: 'behavioral', allowedPaths: ['src/one.ts'] }, { groupId: 'r1-g2', findings: ['r0-2'], owner: 'g2-owner', mode: 'behavioral', allowedPaths: ['src/two.ts'] }], carried: [] }
  redSpec(dir, 'r1-g1', { plan, groupId: 'r1-g1', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('4'), evidenceLedger: [], remediationBatchId: 'r1' })
  redSpec(dir, 'r1-g2', { groupId: 'r1-g2', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g2', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g2', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H1, evidenceLedger: [], remediationBatchId: 'r1' })
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), finding('r0-2', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.phase, 'r1-g2', 'the producing group, derived from the head it produced')
  assert.equal(r.next.group.owner, 'g2-owner')
  assert.deepEqual(r.next.group.allowedPaths, ['src/two.ts'])
  assert.equal(r.next.attempt, 2)
  // restart keeps the same lineage
  assert.deepEqual(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).next, r.next)
})

test('F-RR-05: an ambiguous group provenance is a typed refusal, never a guess', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: H0 })
  review(dir, 'r0', { reviewedHead: H0, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2')] })
  const plan = { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'o', mode: 'behavioral', allowedPaths: ['src/one.ts'] }, { groupId: 'r1-g2', findings: ['r0-2'], owner: 'o', mode: 'behavioral', allowedPaths: ['src/two.ts'] }], carried: [] }
  // BOTH groups report the same output head: the provenance of the failing head is not unique
  for (const g of ['r1-g1', 'r1-g2']) {
    redSpec(dir, g, g === 'r1-g1' ? { plan, groupId: g, remediationBatchId: 'r1' } : { groupId: g, remediationBatchId: 'r1' })
    redVerify(dir, g, { remediationBatchId: 'r1' })
    handoff(dir, g, 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H1, evidenceLedger: [], remediationBatchId: 'r1' })
  }
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), finding('r0-2', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'blocked')
  assert.match(String(r.next.refusal ?? r.next.reason), /regression-lineage-ambiguous|escalate/)
  assert.match(r.next.detail ?? '', /lineage/)
})

test('F-RR-06: completion is scoped to the batch lineage — a later unrelated dirty review cannot reopen a completed earlier batch', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  // r1 closes clean at H1
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'APPROVED', readiness: { ready: true, remoteHead: H1 }, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' })] })
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).counters.completedCycles, 1)
  // a later, unrelated round finds a NEW defect: r1 stays completed
  handoff(dir, 'r2-g1', 'red-spec', { status: 'red', mode: 'remediation', contractPath: '/abs/c.json', contractHash: `sha256:${'1'.repeat(64)}`, groupId: 'r2-g1', remediationBatchId: 'r2', plan: { groups: [{ groupId: 'r2-g1', findings: ['r1-1'], owner: 'o', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] } })
  handoff(dir, 'r2-g1', 'red-verify', { verified: true, findings: [], sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}`, remediationBatchId: 'r2' })
  handoff(dir, 'r2-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r2' })
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r2-1')] })
  const after = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(after.counters.completedCycles, 1, 'r1 stays completed; r2 is not')
  assert.equal(after.counters.invalidatedRemediations, 0)
})

test('F-RR-06: an invalidated batch is completed exactly ONCE, after its own discharge — and only its own', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  const invalidated = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(invalidated.counters.completedCycles, 0)
  assert.equal(invalidated.counters.invalidatedRemediations, 1)
  matchingRepair(dir, riskId)
  publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed at H2' }), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V })
  const closed = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(closed.counters.completedCycles, 1)
  assert.equal(closed.counters.invalidatedRemediations, 1, 'the invalidation is history, counted once')
  // a replay of the very same resolve duplicates nothing
  assert.deepEqual(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).counters, closed.counters)
})

test('F-RR-06: invalidatedRemediations counts only batch identities the history can resolve', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  // a review naming a batch that never existed is not a countable invalidation
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r9', findings: [finding('r1-1')] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.counters.invalidatedRemediations, 0, 'r9 is not a batch this run ever had')
})

// ── US-479 V1 (F-RR-02): a re-observation must not be forced to rewrite the origin evidence ────
// `firstFailingHead` is the head where the regression FIRST appeared. Validating it as the head of
// the current review made every re-observation rewrite it — losing H1 and letting a later discharge
// certify as "first failing" a head that never was. The current-head rule belongs to the FIRST
// observation only; afterwards the field is immutable like the rest of the origin evidence.
test('V1 (F-RR-02): re-observing an ALREADY ACTIVE risk on a new head keeps firstFailingHead untouched and is accepted', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  // a repair that does NOT cure the regression: the batch is prepared again and fixed to H2
  matchingRepair(dir, riskId)
  const out = publish({
    dir,
    file: rrDraft(dir, { phase: 'r2', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'still closed' }), regressionFinding()] }),
    phase: 'r2',
    skill: 'review-phase',
    workflowVersion: V,
  })
  assert.equal(out.published, true, JSON.stringify(out))
  const stored = JSON.parse(readFileSync(out.path, 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk
  assert.equal(stored.riskId, riskId, 'the same stable id')
  assert.equal(stored.firstFailingHead, H1, 'the head where it FIRST failed is preserved, not rewritten to H2')
  assert.equal(stored.state, 'active')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.activeRegressionRisks.length, 1)
  assert.equal(r.activeRegressionRisks[0].firstFailingHead, H1)
})

test('V1 (F-RR-02): on the ACTIVE branch firstFailingHead is immutable — a re-observation that rewrites it is refused', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  const before = digestDir(dir)
  const out = publish({
    dir,
    file: rrDraft(dir, { phase: 'r2', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding('r1-9', { regressionRisk: risk({ firstFailingHead: H2 }) })] }),
    phase: 'r2',
    skill: 'review-phase',
    workflowVersion: V,
  })
  assert.equal(out.published, false)
  assert.match(out.reason, /immutable-field-mismatch:firstFailingHead/)
  assert.deepEqual(digestDir(dir), before)
})

test('V1 (F-RR-02): the FIRST observation still has to name the head it is reviewing', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  // no predecessor yet: a claim whose failing head is not this review's head is unqualified
  const out = publish({
    dir,
    file: rrDraft(dir, { phase: 'r1', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [regressionFinding('r1-9', { regressionRisk: risk({ lastCleanReviewedHead: H1, firstFailingHead: H0 }) })] }),
    phase: 'r1',
    skill: 'review-phase',
    workflowVersion: V,
  })
  assert.equal(out.published, false)
  assert.match(out.reason, /failing-head-not-current-review|firstFailingHead-not-from-batch/)
})

// ── US-479 V3 (F-RR-05): a repair's own GREEN is a legitimate producer of a NEW failing head ────
test('V3 (F-RR-05): when a repair`s GREEN carries its repair marker, the producing group is still resolved — not zero producers', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  // the repair's own GREEN records that it WAS a repair, and it produced H2
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r1', regressionRepairOf: 'r1' }, { attempt: 2 })
  // the review at H2 discharges the FIRST risk and raises a new one introduced by the repair
  // itself, so the only active risk's failing head is the repair's own output — no older head can
  // mask which group produced it
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), dischargedFinding(), regressionFinding('r1-10', { regressionRisk: risk({ lastCleanReviewedHead: H0, firstFailingHead: H2 }) })] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'prepare', JSON.stringify({ step: r.next.step, refusal: r.next.refusal, detail: r.next.detail }))
  assert.equal(r.next.phase, 'r1-g1')
  assert.equal(r.next.regressionRepairOf, 'r1')
})

// ── US-479 V4 (F-RR-06): one ordering rule, so a run without `seq` is not silently uncountable ──
test('V4 (F-RR-06): handoffs written without `seq` still yield a completed cycle — publication order, not a raw seq comparison', () => {
  const root = mkdtempSync(join(tmpdir(), 'v4-'))
  const dir = join(root, '.pair', 'working', 'runs', 'legacy', '42')
  mkdirSync(dir, { recursive: true })
  const write = (name, data) => writeFileSync(join(dir, name), JSON.stringify({ run: 'legacy', story: '42', pr: 7, branch: 'b', inputHead: SHA('a'), schemaVersion: 3, workflowVersion: V, ...data }, null, 2) + '\n')
  // exactly the shape a migrated run has: no `seq` on any handoff
  write('r0-review-phase.json', { phase: 'r0', skill: 'review-phase', reviewedHead: H0, verdict: 'CHANGES-REQUESTED', findings: [finding('r0-1')], custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 'first' })
  write('r1-g1-red-spec.json', { phase: 'r1-g1', skill: 'red-spec', status: 'red', mode: 'remediation', contractPath: '/abs/c.json', contractHash: `sha256:${'1'.repeat(64)}`, groupId: 'r1-g1', remediationBatchId: 'r1', plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'o', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] } })
  write('r1-g1-red-verify.json', { phase: 'r1-g1', skill: 'red-verify', verified: true, findings: [], sealed: true, snapshot: SHA('b'), contractHash: `sha256:${'1'.repeat(64)}`, remediationBatchId: 'r1' })
  write('r1-g1-green-fix.json', { phase: 'r1-g1', skill: 'green-fix', fixed: true, needsHumanDecision: false, outputHead: H1, evidenceLedger: [], remediationBatchId: 'r1' })
  write('r1-review-phase.json', { phase: 'r1', skill: 'review-phase', reviewedHead: H1, verdict: 'APPROVED', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' })], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: H1 }, mode: 're-review' })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.counters.completedCycles, 1, 'the closing review is recognised by publication order, with or without seq')
  assert.equal(r.counters.attemptedCycles, 1)
  assert.equal(r.next.step, 'done')
})

// ── US-479 R1 (F-RR-03): the derived guard set travels with EVERY verification dispatch ────────
// V2 attached it to the verify that follows a GREEN. The other branches that dispatch a review —
// the k-th reviewer of a multi-reviewer pass (the one that must discharge), and the re-review a
// changed input forces — still dispatched a reviewer with no guards to execute, which is exactly
// the wasted round S12 exists to remove. One attachment point, not one per branch.
const POLICY_2R = { ...POLICY, reviewers: 2 }

test('R1 (F-RR-03): the SECOND reviewer of a pass receives the same active guard set as the first', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  const r = resolve({ dir, workflowVersion: V, policy: POLICY_2R, entry: 'pr', pr: 7 })
  assert.deepEqual({ step: r.next.step, phase: r.next.phase, reviewer: r.next.reviewer }, { step: 'verify', phase: 'r1', reviewer: 2 })
  assert.deepEqual((r.next.regressionRisks ?? []).map(x => x.riskId), [riskId], 'the reviewer that must discharge is dispatched with the guard')
  assert.deepEqual(r.next.regressionRisks.map(x => ({ guard: x.reproducerRef, base: x.lastCleanReviewedHead, failing: x.firstFailingHead })), [{ guard: GUARD.reproducerRef, base: H0, failing: H1 }])
})

test('R1 (F-RR-03): the re-review a CHANGED INPUT forces carries the active guards too', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const digest = `sha256:${'4'.repeat(64)}`
  reviewOf(dir, 'r1', { inputsDigest: digest, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed by r1' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const riskId = JSON.parse(readFileSync(join(dir, 'r1-review-phase.json'), 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk.riskId
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, inputs: `sha256:${'5'.repeat(64)}` })
  assert.equal(r.next.inputsChanged, true, JSON.stringify({ step: r.next.step, phase: r.next.phase }))
  assert.equal(r.next.step, 'verify')
  assert.deepEqual((r.next.regressionRisks ?? []).map(x => x.riskId), [riskId], 'invalidating the review evidence does not drop the guard the risk still needs')
})

test('R1 (F-RR-03): with no active risk no verification dispatch invents the field', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed by r1' })] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY_2R, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'verify')
  assert.equal(r.next.reviewer, 2)
  assert.equal(r.next.regressionRisks, undefined)
  assert.deepEqual(r.activeRegressionRisks, [])
})

// ── US-479 AC-31 / DT-40 (S13): `discharged -> active` is the one transition never validated ────
// A discharged batch produces no further heads, so a defect seen afterwards was produced by a LATER
// batch — attributing it to the original one is already refused, and attributing it to the batch
// that really produced the head yields a different riskId through the ordinary `none -> active`
// path. A reopening of an existing id therefore means one thing only: a discharge that should not
// have been granted. It is a RESTORATION of the prior entry, so every field of it is immutable.
const H3 = SHA('3')
function dischargedRisk(dir) {
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  const out = publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed at H2' }), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, true, `fixture: the discharge itself must be legal — ${out.reason}`)
  return riskId
}
// A later review that reopens the risk, reading the same head the discharge was bound to.
const reopenDraft = (dir, riskExtra = {}, findingExtra = {}) =>
  rrDraft(dir, {
    phase: 'r3',
    reviewedHead: H2,
    verdict: 'CHANGES-REQUESTED',
    readiness: { ready: false },
    findings: [regressionFinding('r1-9', { ...findingExtra, regressionRisk: risk({ ...riskExtra }) })],
  })

test('AC-31 (DT-40): reopening a discharged risk with ANY field of the prior entry mutated is refused before the write', () => {
  const mutations = [
    ['reproducerRef', { reproducerRef: 'pnpm exec vitest run other.test.ts' }],
    ['closureAssertions', { closureAssertions: [{ id: 'ca-9', command: 'pnpm exec vitest run other.test.ts', expected: 'pass' }] }],
    ['affectedBoundaryRefs', { affectedBoundaryRefs: ['installer:somethingElse'] }],
    ['lastCleanReviewedHead', { lastCleanReviewedHead: H2 }],
    ['firstFailingHead', { firstFailingHead: H2 }],
  ]
  for (const [field, riskExtra] of mutations) {
    const { dir } = runDir()
    dischargedRisk(dir)
    const before = digestDir(dir)
    const out = publish({ dir, file: reopenDraft(dir, riskExtra), phase: 'r3', skill: 'review-phase', workflowVersion: V })
    assert.equal(out.published, false, `${field} was accepted`)
    assert.match(out.reason, new RegExp(`immutable-field-mismatch:${field}`), `${field}: ${out.reason}`)
    assert.deepEqual(digestDir(dir), before, `${field}: the run directory must be byte-identical`)
  }
  // the obligation the risk cites is part of the identity too
  const { dir } = runDir()
  dischargedRisk(dir)
  const out = publish({ dir, file: reopenDraft(dir, {}, { obligationIds: ['AC-99'] }), phase: 'r3', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /immutable-field-mismatch:obligationIds/)
})

test('AC-31 (DT-40): an exact restoration of the prior entry IS accepted, keeps the identity and adds no new discovery', () => {
  const { dir } = runDir()
  const riskId = dischargedRisk(dir)
  const beforeCounters = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).counters
  const out = publish({ dir, file: reopenDraft(dir), phase: 'r3', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, true, JSON.stringify(out))
  const stored = JSON.parse(readFileSync(out.path, 'utf8')).findings.find(f => f.id === 'r1-9').regressionRisk
  assert.equal(stored.riskId, riskId, 'the same stable id — a reopening is not a second identity')
  assert.equal(stored.firstFailingHead, H1, 'the origin evidence is restored, not rewritten')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.activeRegressionRisks.map(x => x.riskId), [riskId], 'the risk is active again')
  assert.equal(r.counters.dischargedRegressionRisks, 0, 'it is no longer discharged')
  assert.equal(r.counters.activeRegressionRisks, 1)
  assert.equal(r.counters.attemptedCycles, beforeCounters.attemptedCycles, 'a reopening is not a new cycle')
  assert.notEqual(r.next.step, 'done', 'an active risk keeps the cycle open')
})

test('AC-31 (DT-40, positive control): the SAME defect on a LATER batch`s head is a NEW risk, not a reopening', () => {
  const { dir } = runDir()
  const riskId = dischargedRisk(dir)
  // a later batch r3 fixes something else and produces H3
  redSpec(dir, 'r3-g1', { plan: { groups: [{ groupId: 'r3-g1', findings: ['r2-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r3-g1', remediationBatchId: 'r3' })
  redVerify(dir, 'r3-g1', { remediationBatchId: 'r3' })
  handoff(dir, 'r3-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H3, evidenceLedger: [], remediationBatchId: 'r3' })
  // attributing the reappearance to the ORIGINAL batch is refused: r1 never produced H3
  const wrong = publish({
    dir,
    file: rrDraft(dir, { phase: 'r3', reviewedHead: H3, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [regressionFinding('r1-9', { regressionRisk: risk({ lastCleanReviewedHead: H2, firstFailingHead: H3 }) })] }),
    phase: 'r3',
    skill: 'review-phase',
    workflowVersion: V,
  })
  assert.equal(wrong.published, false)
  assert.match(wrong.reason, /firstFailingHead-not-from-batch|immutable-field-mismatch/)
  // attributing it to the batch that actually produced H3 is the ordinary `none -> active` path
  const right = publish({
    dir,
    file: rrDraft(dir, { phase: 'r3', reviewedHead: H3, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r3', findings: [regressionFinding('r3-9', { regressionRisk: risk({ introducedByRemediationBatchId: 'r3', lastCleanReviewedHead: H2, firstFailingHead: H3 }) })] }),
    phase: 'r3',
    skill: 'review-phase',
    workflowVersion: V,
  })
  assert.equal(right.published, true, JSON.stringify(right))
  const stored = JSON.parse(readFileSync(right.path, 'utf8')).findings.find(f => f.id === 'r3-9').regressionRisk
  assert.notEqual(stored.riskId, riskId, 'a different introducing batch is a different risk')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.activeRegressionRisks.map(x => x.riskId), [stored.riskId])
})


test('AC-32 (DT-41): the FIRST repair of a regression carries no reconstruction directive', () => {
  const { dir } = runDir()
  provenRisk(dir)
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'prepare')
  assert.equal(r.next.regressionRepairOf, 'r1')
  assert.equal(r.next.reconstruct, undefined, 'patching first is right: the base is not yet proven bad')
})

// ── US-479 T-27 (DT-05): independent groups serialize by the plan, never by an invented dependency ──
const twoGroupPlan = (deps = {}) => ({
  groups: [
    { groupId: 'r1-g1', findings: ['r0-1'], owner: 'installer', mode: 'behavioral', allowedPaths: ['src/a.ts'], ...(deps['r1-g1'] ? { dependsOn: deps['r1-g1'] } : {}) },
    { groupId: 'r1-g2', findings: ['r0-2'], owner: 'gate', mode: 'behavioral', allowedPaths: ['src/b.ts'], ...(deps['r1-g2'] ? { dependsOn: deps['r1-g2'] } : {}) },
  ],
  carried: [],
})
function twoGroupRound(dir, deps = {}) {
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('0') })
  review(dir, 'r0', { reviewedHead: SHA('0'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2', { location: 'src/b.ts:1' })] })
  redSpec(dir, 'r1-g1', { plan: twoGroupPlan(deps), groupId: 'r1-g1', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('1'), evidenceLedger: [], remediationBatchId: 'r1' })
}

test('DT-05: a second INDEPENDENT group runs after the first with no dependency between them — the plan order, not an invented dependsOn', () => {
  const { dir } = runDir()
  twoGroupRound(dir)
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'prepare')
  assert.equal(r.next.phase, 'r1-g2', 'the independent group is next; nothing blocks it')
  assert.equal(r.next.group.owner, 'gate', 'it carries its OWN ownership, not the first group`s')
  assert.deepEqual(r.next.group.allowedPaths, ['src/b.ts'], 'and its own paths: two groups of a batch never share a write surface')
  assert.equal(r.next.group.dependsOn, undefined, 'no dependency was invented')
})

test('DT-05: a DECLARED dependency is honoured whatever order the plan lists the groups in', () => {
  const { dir } = runDir()
  // g1 depends on g2: the plan lists g1 first, but g2 must be prepared before it
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('0') })
  review(dir, 'r0', { reviewedHead: SHA('0'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1'), finding('r0-2')] })
  const plan = twoGroupPlan({ 'r1-g1': ['r1-g2'] })
  redSpec(dir, 'r1-g2', { plan, groupId: 'r1-g2', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g2', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g2', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('1'), evidenceLedger: [], remediationBatchId: 'r1' })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.phase, 'r1-g1', 'the dependent group follows the one it depends on')
})

// ── US-479 T-27 (DT-07): a crash between the fix and its review moves no completion counter ──────
test('DT-07: after a crash the batch is ATTEMPTED not completed; the complete review makes it 1; an identical replay stays 1', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir) // r1 fixed r0-1 and produced H1 — then the process died before any review
  const crashed = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(crashed.counters.attemptedCycles, 1, 'the batch was attempted')
  assert.equal(crashed.counters.completedCycles, 0, 'nothing completed it: no review has run')
  assert.equal(crashed.next.step, 'verify', 'the resume asks for the review that never happened')
  // the review the crash interrupted now runs and closes the batch
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'APPROVED', readiness: { ready: true, remoteHead: H1 }, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' })] })
  const done = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(done.counters.completedCycles, 1)
  // replaying the SAME resolution changes nothing: the counters are derived, never accumulated
  const replay = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(replay.counters, done.counters, 'an identical replay is not a second cycle')
})

test('DT-07: a REAL second remediation after the review is the second completed cycle', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), finding('r1-1')] })
  redSpec(dir, 'r2-g1', { plan: { groups: [{ groupId: 'r2-g1', findings: ['r1-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r2-g1', remediationBatchId: 'r2' })
  redVerify(dir, 'r2-g1', { remediationBatchId: 'r2' })
  handoff(dir, 'r2-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], remediationBatchId: 'r2' })
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'APPROVED', readiness: { ready: true, remoteHead: H2 }, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' }), finding('r1-1', { transition: 'resolved', blocking: false, evidence: 'closed' })] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.counters.completedCycles, 2, 'two real remediations, each closed by its own review')
  assert.equal(r.counters.attemptedCycles, 2)
})

// ── US-479 T-27 (DT-13): quality first, then ONE consolidated scope halt ─────────────────────────
const proposal = (id, extra = {}) => ({ id, type: 'scope-extension', proposal: `extend for ${id}`, baselineEvidenceRefs: ['x'], discoveredAtReviewId: 'r0', status: 'pending', ...extra })

test('DT-13: open defects alongside scope proposals fix the defects first — no scope halt yet', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('0') })
  review(dir, 'r0', { reviewedHead: SHA('0'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')], scopeChanges: [proposal('sc-1'), proposal('sc-2')] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'prepare', 'a pending proposal never defers a real defect')
  assert.notEqual(r.next.reason, 'awaiting-scope-decision')
})

test('DT-13: once quality has converged the proposals halt the cycle ONCE, together, and never reach `done`', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('0') })
  review(dir, 'r0', { reviewedHead: SHA('0'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')], scopeChanges: [proposal('sc-1'), proposal('sc-2')] })
  redSpec(dir, 'r1-g1', { plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r1-g1', remediationBatchId: 'r1' })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1' })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H1, evidenceLedger: [], remediationBatchId: 'r1' })
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'APPROVED', readiness: { ready: true, remoteHead: H1 }, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' })] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.reason, 'awaiting-scope-decision')
  assert.equal(r.next.qualityState, 'converged')
  assert.deepEqual(r.next.scopeChanges.map(c => c.id).sort(), ['sc-1', 'sc-2'], 'ONE halt carrying every pending proposal, not one halt each')
  assert.notEqual(r.status, 'completed', 'a pending scope decision is never `done`')
})

// ── US-479 T-27 (DT-15): a new-card decision needs a real destination, or nothing moves ─────────
// `new-card` is the only decision that creates an effect outside this repository's cycle. It is
// applied only with an explicit approved payload or an existing issue this script VERIFIED through
// `gh`. A decision that has neither is not applied — and an unapplied proposal stays PENDING, never
// silently deferred, so the cycle keeps halting for it instead of walking past it.
test('DT-15: new-card with neither an approved payload nor a target URL is not applied, and the proposal stays PENDING', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-777'
  setComments({ 777: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', rationale: 'later' }], hash)) })
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V })
  assert.equal(out.results?.find(r => r.id === 'sc-1')?.applied, false, JSON.stringify(out))
  assert.equal(out.results.find(r => r.id === 'sc-1').reason, 'payload-insufficient')
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.reason, 'awaiting-scope-decision', 'an unapplied decision leaves the halt standing')
  assert.deepEqual(r.next.scopeChanges.map(c => c.status ?? 'pending'), ['pending'], 'pending, never deferred')
})

test('DT-15: a target URL that does not verify is refused — an unreachable destination is not a link', () => {
  const { dir } = runDir()
  review(dir, 'r0', { findings: [], scopeChanges: [scopeChange('sc-1')] })
  const hash = scopeBaselineHashOf([scopeChange('sc-1')])
  const decisionRef = 'https://github.com/foomakers/pair/pull/7#issuecomment-778'
  // an issue in ANOTHER repository is not this cycle's destination, whatever it contains
  setComments({ 778: comment('rucka', decisionBody([{ id: 'sc-1', action: 'new-card', rationale: 'tracked elsewhere', targetIssueUrl: 'https://github.com/other/repo/issues/12' }], hash)) })
  const out = applyScopeDecisions({ dir, decisionRef, repo: 'foomakers/pair', pr: 7, workflowVersion: V })
  assert.equal(out.results.find(r => r.id === 'sc-1').applied, false)
  assert.match(out.results.find(r => r.id === 'sc-1').reason, /targetIssueUrl-repo-mismatch|gh-issue-view/)
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.reason, 'awaiting-scope-decision')
})

// ── US-479 T-27 (DT-27): a decided origin carries the replay that decided it ────────────────────
// `preexisting-missed` and `introduced-by-remediation` are claims about WHEN a defect began, and
// both are decided by replaying the reproducer at the baseline head — never by file age, blame or
// the reviewer's confidence. `unknown` is the honest answer when the baseline cannot be replayed,
// and it needs no evidence precisely because it claims nothing.
const originDraft = (dir, findings) => {
  const file = join(mkdtempSync(join(tmpdir(), 'origin-')), 'draft.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', findings }))
  return file
}

test('DT-27: an origin claimed as DECIDED without its replay evidence is refused before the write', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const before = digestDir(dir)
  for (const origin of ['preexisting-missed', 'introduced-by-remediation']) {
    const out = publish({ dir, file: originDraft(dir, [finding('r1-1', { origin })]), phase: 'r1', skill: 'review-phase', workflowVersion: V })
    assert.equal(out.published, false, origin)
    assert.match(out.reason, /finding-originEvidence-missing|regressionRisk-missing/, `${origin}: ${out.reason}`)
  }
  assert.deepEqual(digestDir(dir), before, 'an undecidable claim writes nothing')
})

test('DT-27: `unknown` is the honest answer when the baseline cannot be replayed — it needs no evidence and is an ordinary finding', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const out = publish({ dir, file: originDraft(dir, [finding('r1-1', { origin: 'unknown' })]), phase: 'r1', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, true, JSON.stringify(out))
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.activeRegressionRisks, [], 'an unknown origin is never a regression risk')
  assert.equal(r.next.step, 'prepare', 'it is remediated as the ordinary defect it is')
})

test('DT-27: a baseline-failing defect is `preexisting-missed` — evidence, no risk, no invalidated batch', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const out = publish({
    dir,
    file: originDraft(dir, [finding('r1-1', { origin: 'preexisting-missed', originEvidence: { baselineHead: H0, failingHead: H1, reproducer: 'pnpm exec vitest run src/a.test.ts -t old' } })]),
    phase: 'r1',
    skill: 'review-phase',
    workflowVersion: V,
  })
  assert.equal(out.published, true, JSON.stringify(out))
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.activeRegressionRisks, [], 'a defect that already failed at the baseline invalidates no remediation')
  assert.equal(r.counters.invalidatedRemediations, 0)
})

test('DT-27: a scope proposal can never carry a severity or an origin — it is not a defect', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const before = digestDir(dir)
  const file = join(mkdtempSync(join(tmpdir(), 'origin-')), 'draft.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', findings: [], scopeChanges: [{ id: 'sc-1', type: 'scope-extension', proposal: 'do more', baselineEvidenceRefs: ['x'], status: 'pending', severity: 'Major' }] }))
  const out = publish({ dir, file, phase: 'r1', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /scopeChange-severity-forbidden/)
  assert.deepEqual(digestDir(dir), before)
})

// ── DR-01 (delta review of 8a2fd59e): a FAILING remediation must still spend the budget ─────────
// F-RR-06 made completion mean "a review closed every one of this batch's own obligations". That is
// the right meaning for a QUALITY metric and the wrong one for a BUDGET: when a remediation keeps
// failing, no review ever closes the obligation, so the budget was never spent and the cycle looped
// until the engine's blunt dispatch ceiling killed it — instead of escalating to a human after three
// rounds, which is exactly what the budget exists for. The two questions are now separate counters:
// `completedCycles` is how many corrective cycles CLOSED, `spentCycles` is how many were CONCLUDED
// — a real fix followed by its review, whatever that review decided.
function failingRound(dir, round, openId = 'r0-1') {
  const phase = `r${round}-g1`
  redSpec(dir, phase, { plan: { groups: [{ groupId: phase, findings: [openId], owner: 'a', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: phase, remediationBatchId: `r${round}` })
  redVerify(dir, phase, { remediationBatchId: `r${round}` })
  handoff(dir, phase, 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA(String(round)), evidenceLedger: [], remediationBatchId: `r${round}` })
  // the fix reports success, the independent review disagrees: the obligation is STILL open
  review(dir, `r${round}`, { mode: 're-review', reviewedHead: SHA(String(round)), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding(openId)] })
}

test('DR-01: three remediation rounds that all FAIL spend the budget and escalate — they do not loop', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('0') })
  review(dir, 'r0', { reviewedHead: SHA('0'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')] })
  const policy = { ...POLICY, maxFixRounds: 3 }
  const steps = []
  for (const round of [1, 2, 3]) {
    failingRound(dir, round)
    const r = resolve({ dir, workflowVersion: V, policy, entry: 'pr', pr: 7 })
    steps.push({ round, step: r.next.step, reason: r.next.reason, budget: r.next.budget, spent: r.counters.spentCycles, completed: r.counters.completedCycles })
  }
  assert.deepEqual(
    steps.map(s => s.spent),
    [1, 2, 3],
    'each concluded round spends one, whatever the review decided',
  )
  assert.deepEqual(steps.map(s => s.completed), [0, 0, 0], 'and none of them COMPLETED: nothing was ever closed')
  assert.deepEqual({ step: steps[0].step, step2: steps[1].step }, { step: 'prepare', step2: 'prepare' }, 'the first two rounds keep going')
  assert.deepEqual({ step: steps[2].step, reason: steps[2].reason, budget: steps[2].budget }, { step: 'blocked', reason: 'escalate', budget: 'maxFixRounds' }, 'the third exhausts the budget and asks a human')
})

test('DR-01: a metadata-only re-review spends nothing — no fix, no budget (T-21 stays true)', () => {
  const { dir } = runDir()
  redSpec(dir, 'a0', { mode: 'initial' })
  redVerify(dir, 'a0')
  handoff(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('0') })
  review(dir, 'r0', { reviewedHead: SHA('0'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')] })
  // three re-reviews of the SAME head with no remediation in between
  for (const round of [1, 2, 3]) review(dir, `r${round}`, { mode: 're-review', reviewedHead: SHA('0'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r0-1')] })
  const r = resolve({ dir, workflowVersion: V, policy: { ...POLICY, maxFixRounds: 3 }, entry: 'pr', pr: 7 })
  assert.equal(r.counters.spentCycles, 0, 'a round number that moved without a fix is not a spent cycle')
  assert.notEqual(r.next.reason, 'escalate')
})

test('DR-01 (control): a batch closed clean stays completed when a later unrelated review is dirty (F-RR-06 stays true)', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  review(dir, 'r1', { mode: 're-review', reviewedHead: H1, verdict: 'APPROVED', readiness: { ready: true, remoteHead: H1 }, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed' })] })
  const closed = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(closed.counters.completedCycles, 1)
  // a later review finds something NEW: it belongs to the next batch and cannot reopen this one
  review(dir, 'r2', { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r2-9')] })
  const after = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(after.counters.completedCycles, 1, 'a closed batch stays closed')
  assert.equal(after.counters.spentCycles, 1)
})

// NOTE (US-479 F-4): this is a CONTROL, not a witness. The second delta review established that it
// passes with and without the empty-obligations branch, because its fixture's batch DOES have an
// obligation set (`cleanThenRemediated` publishes r1-g1 with a plan naming r0-1) — `completedCycles`
// is 0 here because the risk is still active, not because of that branch. The branch itself stays as
// a fail-closed guard: no reachable history produces an empty obligation set for a batch with a
// repair, and if one ever did, closing it vacuously is the worse failure.
test('DR-01 (control): an active risk keeps its batch from completing, whatever a later review says', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, findings: [finding('r2-9')] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.counters.completedCycles, 0, 'nothing was proven closed: an empty obligation set closes nothing')
})


// ── DR-06 / DR-10 (delta review): the remaining asymmetries of the S12 matrix ───────────────────
test('DR-06: ANY mandatory human decision beats the automatic rewind — not only a history rewrite', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { needsHumanDecision: true, findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()], invalidatedBatchId: 'r1' })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(r.next.step, 'blocked', JSON.stringify({ step: r.next.step, phase: r.next.phase }))
  assert.equal(r.next.reason, 'escalate')
  assert.equal(r.activeRegressionRisks.length, 1, 'the risk stays active and untouched')
})

test('DR-10: an ACTIVE risk on a non-blocking finding is an incoherent triple, like its mirror image', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const before = digestDir(dir)
  const f = join(mkdtempSync(join(tmpdir(), 'dr10-')), 'draft.json')
  writeFileSync(f, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', invalidatedBatchId: 'r1', findings: [regressionFinding('r1-9', { blocking: false })] }))
  const out = publish({ dir, file: f, phase: 'r1', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /finding-transition-incoherent/)
  assert.deepEqual(digestDir(dir), before)
})

test('DR-10: a review that raises a regression must NAME the batch it invalidates', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const before = digestDir(dir)
  const f = join(mkdtempSync(join(tmpdir(), 'dr10-')), 'draft.json')
  // no invalidatedBatchId at all: the ledger would show an active risk whose batch nothing counts
  writeFileSync(f, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', findings: [regressionFinding()] }))
  const out = publish({ dir, file: f, phase: 'r1', skill: 'review-phase', workflowVersion: V })
  assert.equal(out.published, false)
  assert.match(out.reason, /invalidated-batch-missing/)
  assert.deepEqual(digestDir(dir), before)
})

// ── DR-09: `regressionGuards` is a hard engine gate, so the skills must declare it as output ────
test('DR-09: red-verify and review-phase declare `regressionGuards` in their Output Format', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url))
  for (const rel of [
    '.claude/skills/pair-workflow-red-verify/SKILL.md',
    '.claude/skills/pair-workflow-review-phase/SKILL.md',
    'packages/knowledge-hub/dataset/.skills/workflow/red-verify/SKILL.md',
    'packages/knowledge-hub/dataset/.skills/workflow/review-phase/SKILL.md',
  ]) {
    const md = readFileSync(join(root, rel), 'utf8')
    const at = md.indexOf('## Output Format')
    // `slice(-1)` on a miss yields the last character, which is truthy: the guard below never fired.
    assert.ok(at >= 0, `${rel}: no Output Format section`)
    const section = md.slice(at)
    assert.match(section.split('\n').slice(0, 6).join('\n'), /regressionGuards/, `${rel}: the coordinator fails the run when the echo is missing, so the canonical output line must carry it`)
  }
})

// ── m-2: the skills that CONSUME `$reconstruct` must document the keys the resolver emits ──────
// DR3-05 was fixed at one consumer and left stale at the other — green-fix, the participant that
// actually performs the restore, still documented `rollbackTo` (deleted) and never mentioned
// `notes` (new). Neither `skills:conformance` nor `docs:staleness` covers prose-vs-payload drift,
// so the drift is asserted here, against the keys the emitting line itself carries.
test('m-2: every phase skill documenting `$reconstruct` names exactly the keys the resolver emits', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url))
  const emitted = ['fromHead', 'paths', 'riskIds', 'notes']
  const gone = ['rollbackTo']
  for (const rel of [
    '.claude/skills/pair-workflow-green-fix/SKILL.md',
    '.claude/skills/pair-workflow-red-spec/SKILL.md',
    'packages/knowledge-hub/dataset/.skills/workflow/green-fix/SKILL.md',
    'packages/knowledge-hub/dataset/.skills/workflow/red-spec/SKILL.md',
  ]) {
    const md = readFileSync(join(root, rel), 'utf8')
    assert.ok(md.includes('$reconstruct'), `${rel}: does not document the argument at all`)
    for (const k of emitted) assert.ok(md.includes(k), `${rel}: the resolver emits \`${k}\` and the skill never names it`)
    for (const k of gone) assert.ok(!md.includes(k), `${rel}: \`${k}\` is not emitted any more — a fixer told to read it reads nothing`)
  }
})

// ── AC-32, after the third review: two declared modes, and the choice is a human's ─────────────
// Deciding by itself whether restoring content was safe cost four defects in three rounds, and
// getting it wrong deletes real work. The workflow no longer decides: the default patches forward
// as it always did, and a human who has read the escalation may name the round to roll back to.
// Nothing below vetoes anything — that is the point.
const rollback = (dir, to) => resolve({ dir, workflowVersion: V, policy: { ...POLICY, rollbackTo: to }, entry: 'pr', pr: 7 }).next

test('AC-32: with no round named, a failed repair just patches forward — no directive, whatever the history', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  const next = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).next
  assert.equal(next.step, 'prepare')
  assert.equal(next.reconstruct, undefined, 'the default is the behaviour that always existed')
  assert.equal(next.rollbackRefusal, undefined)
})

test('AC-32: a named HEAD is taken as given, and the work still goes FORWARD', () => {
  const { dir } = runDir()
  // The rewind the maintainer's decision is owed to: r1 was proven to have introduced the
  // regression and nothing has rebuilt anything yet. (A LATER rewind is DR3-04's witness: the
  // directive is spent once the repair it was delivered to produced a head.)
  const riskId = provenRisk(dir)
  const next = rollback(dir, H0)
  assert.equal(next.step, 'prepare')
  assert.deepEqual(
    { from: next.reconstruct?.fromHead, paths: next.reconstruct?.paths, risks: next.reconstruct?.riskIds },
    { from: H0, paths: ['src/a.ts'], risks: [riskId] },
    'the head named verbatim, the producing group`s own scope, and the guards it must satisfy',
  )
  assert.equal(next.base, H1, 'the branch stays where it is: restoring is content, the commit is forward')
})

test('AC-32: a head this cycle never recorded yields NO directive and says so — never a guessed head', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  const next = rollback(dir, SHA('e'))
  assert.equal(next.reconstruct, undefined)
  assert.equal(next.rollbackRefusal, `rollback-head-unknown:${SHA('e')}`)
  assert.equal(next.step, 'prepare', 'and the cycle still proceeds — a bad parameter is not a dead end')
})

test('AC-32: overlapping work does NOT veto a named rollback — the human who named it owns that call', () => {
  const { dir } = runDir()
  provenRisk(dir)
  // another group wrote the very same path after the baseline: under the old guard this refused
  redSpec(dir, 'r2-g1', { plan: { groups: [{ groupId: 'r2-g1', findings: ['r2-1'], owner: 'b', mode: 'behavioral', allowedPaths: ['src/a.ts'] }], carried: [] }, groupId: 'r2-g1', remediationBatchId: 'r2' })
  redVerify(dir, 'r2-g1', { remediationBatchId: 'r2' })
  handoff(dir, 'r2-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: SHA('7'), evidenceLedger: [], remediationBatchId: 'r2' })
  review(dir, 'r3', { mode: 're-review', reviewedHead: SHA('7'), verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  const next = rollback(dir, H0)
  assert.ok(next.reconstruct, 'the directive is emitted: the algorithm reports, it does not veto')
  assert.equal(next.reconstruct.fromHead, H0)
})

// ── ADL 2026-09-12: rollback takes a HEAD, its notes live in the handoff, nobody deletes them ───
const rollbackTo = (dir, head) => resolve({ dir, workflowVersion: V, policy: { ...POLICY, rollbackTo: head }, entry: 'pr', pr: 7 }).next
// The corrective repair a directive was actually DELIVERED to: the preparation echoes the head it
// was handed (`reconstructedFrom`), and the fixer produces a new one from it.
function delivered(dir, riskId, fromHead, { outputHead = H2 } = {}) {
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', reconstructedFrom: fromHead, regressionGuards: [riskId] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead, evidenceLedger: [], remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
}
const workedNote = (extra = {}) => ({ id: 'w1', claim: 'the installer resolves from SKILL_DIR, not cwd', appliesTo: ['src/a.ts'], evidence: [{ id: 'we-1', command: 'pnpm exec vitest run src/a.test.ts -t resolves', expected: 'pass' }], ...extra })

test('rollback: a 40-hex head this cycle recorded is taken as given — no round name, nothing to resolve', () => {
  const { dir } = runDir()
  provenRisk(dir)
  const next = rollbackTo(dir, H0)
  assert.equal(next.reconstruct?.fromHead, H0, 'the head the maintainer named, verbatim')
  assert.deepEqual(next.reconstruct?.paths, ['src/a.ts'])
  assert.equal(next.base, H1, 'the work still goes forward on the current head')
})

test('rollback: a head this cycle never recorded is REFUSED, and the refusal is not silent', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  matchingRepair(dir, riskId)
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  const next = rollbackTo(dir, SHA('e'))
  assert.equal(next.reconstruct, undefined)
  assert.equal(next.rollbackRefusal, `rollback-head-unknown:${SHA('e')}`, 'a head from nowhere is not a rollback point')
  // a value that is not a head at all is refused the same way, never parsed as a round name
  assert.match(rollbackTo(dir, 'r1-g1').rollbackRefusal ?? '', /^rollback-head-invalid:/)
})

test('DR3-04 (M-1): the rollback is emitted ONCE — a later rewind does not restore over the rebuild the first one produced', () => {
  const { dir } = runDir()
  // Rewind #1: the review proved r1 introduced a regression, nothing has been rebuilt yet.
  const riskId = provenRisk(dir)
  const first = rollbackTo(dir, H0)
  assert.equal(first.reconstruct?.fromHead, H0, 'the first rewind carries the directive the maintainer named')
  assert.equal(first.regressionRepairOf, 'r1')
  // The corrective preparation takes it — echoing the head it was handed — and the fixer rebuilds:
  // H2 IS the rollback, applied.
  delivered(dir, riskId, H0)
  // Rewind #2: the same risk is still live at the rebuilt head, so the cycle rewinds again.
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  const second = rollbackTo(dir, H0)
  assert.equal(second.step, 'prepare', 'the cycle proceeds — a spent directive is not a dead end')
  assert.equal(second.reconstruct, undefined, 'restoring src/a.ts at H0 again would delete the rebuild that H2 is')
  assert.equal(second.rollbackRefusal, undefined, 'and this is not a refusal: the decision was honoured, once')
  assert.equal(second.base, H2, 'the work still goes forward from where the rebuild left it')
})

test('DR4-01 (R1): a decision named for the FIRST time after an ordinary repair is owed — spending is keyed on the decision, not on the batch', () => {
  const { dir } = runDir()
  // Rewind #1 took the DEFAULT: no head was named, so the repair patched forward and no directive
  // was ever delivered. This is the documented primary case — a maintainer names a head after
  // reading the escalation, i.e. after corrective repairs have already run.
  const riskId = provenRisk(dir)
  assert.equal(resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).next.reconstruct, undefined, 'no head named, no directive')
  matchingRepair(dir, riskId)
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  // Only NOW does the maintainer name H0. Nothing has ever carried this decision.
  const next = rollbackTo(dir, H0)
  assert.equal(next.reconstruct?.fromHead, H0, 'a decision never delivered cannot have been spent')
  assert.equal(next.rollbackRefusal, undefined)
})

test('DR4-01 (R2): a SECOND, different head is a new decision — honouring the first does not spend it', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  assert.equal(rollbackTo(dir, H0).reconstruct?.fromHead, H0)
  // the corrective preparation records the head it was handed, and the fixer rebuilds from it
  delivered(dir, riskId, H0)
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  assert.equal(rollbackTo(dir, H0).reconstruct, undefined, 'the SAME decision, already honoured, is spent')
  assert.equal(rollbackTo(dir, H1).reconstruct?.fromHead, H1, 'a different head is a different decision, and it is owed')
})

test('DR4-01 (R3): batch attribution falls back to the phase round, like every other reader — an omitted `remediationBatchId` does not resurrect a spent directive', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  assert.ok(rollbackTo(dir, H0).reconstruct)
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', reconstructedFrom: H0, regressionGuards: [riskId] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  // `remediationBatchId` is optional for green-fix (REQUIRED_BY_SKILL), and the phase still says r1
  handoff(dir, 'r1-g1', 'green-fix', { fixed: true, needsHumanDecision: false, outputHead: H2, evidenceLedger: [], regressionGuards: [riskId] }, { attempt: 2 })
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  assert.equal(rollbackTo(dir, H0).reconstruct, undefined, 'the rebuild happened; the phase round says which batch produced it')
})

test('DR4-01: the echo is a 40-hex head or the handoff does not publish — a spend can never rest on a forged field', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const f = join(mkdtempSync(join(tmpdir(), 'echo-')), 'draft.json')
  writeFileSync(f, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('a'), status: 'red', mode: 'remediation', contractPath: '/abs/c.json', contractHash: `sha256:${'1'.repeat(64)}`, regressionRepairOf: 'r1', reconstructedFrom: 'H0' }))
  const out = publish({ dir, file: f, phase: 'r1-g1', skill: 'red-spec', workflowVersion: V, attempt: 2 })
  assert.equal(out.published, false)
  assert.match(out.reason, /reconstructedFrom-not-a-sha/)
})

test('DR3-04 (M-1): a directive dispatched but never rebuilt is still owed — only a completed repair spends it', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  assert.ok(rollbackTo(dir, H0).reconstruct, 'owed at the first rewind')
  // The preparation carried it, the fixer FAILED: no new head exists, so nothing was rebuilt.
  redSpec(dir, 'r1-g1', { groupId: 'r1-g1', remediationBatchId: 'r1', regressionRepairOf: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  redVerify(dir, 'r1-g1', { remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  handoff(dir, 'r1-g1', 'green-fix', { fixed: false, needsHumanDecision: false, outputHead: H1, evidenceLedger: [], remediationBatchId: 'r1', regressionGuards: [riskId] }, { attempt: 2 })
  review(dir, 'r2', { mode: 're-review', reviewedHead: H1, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  assert.equal(rollbackTo(dir, H0).reconstruct?.fromHead, H0, 'a repair that produced nothing cannot have consumed the decision')
})

test('rollbackNotes: the view is ACTIVE while an obligation is open or a regression is live, and empty after', () => {
  const { dir } = runDir()
  const riskId = provenRisk(dir)
  const open = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(open.rollbackNotes.active, true, 'a live regression keeps the notes')
  assert.deepEqual(open.rollbackNotes.regressions.map(r => r.riskId), [riskId])
  // the repair cures it and the review closes everything the batch owed
  matchingRepair(dir, riskId)
  publish({ dir, file: rrDraft(dir, { findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'closed at H2' }), dischargedFinding()] }), phase: 'r2', skill: 'review-phase', workflowVersion: V })
  const done = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.equal(done.rollbackNotes.active, false, 'progress without new regressions empties the view — nobody deleted anything')
  assert.deepEqual(done.rollbackNotes.regressions, [])
  assert.deepEqual(done.rollbackNotes.obligations.filter(o => o.open), [])
})

test('rollbackNotes: `worked` is carried from the review that observed the failure', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { invalidatedBatchId: 'r1', worked: [workedNote()], findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.rollbackNotes.worked.map(w => w.id), ['w1'])
  assert.equal(r.rollbackNotes.worked[0].claim, 'the installer resolves from SKILL_DIR, not cwd')
})

test('m-4: `worked` ids are stable across rounds, so a later review SUPERSEDES the earlier claim — the rebuild never sees both', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  reviewOf(dir, 'r1', { invalidatedBatchId: 'r1', worked: [workedNote()], findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  // A later review revises the SAME id: what it once called correct, it now calls wrong.
  review(dir, 'r2', { mode: 're-review', reviewedHead: H2, verdict: 'CHANGES-REQUESTED', readiness: { ready: false }, invalidatedBatchId: 'r1', worked: [workedNote({ claim: 'it resolves from cwd — the earlier claim was WRONG' })], findings: [finding('r0-1', { transition: 'resolved', blocking: false, evidence: 'c' }), regressionFinding()] })
  const r = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })
  assert.deepEqual(r.rollbackNotes.worked.map(w => w.id), ['w1'], 'one entry per id, as the obligations already are')
  assert.equal(r.rollbackNotes.worked[0].claim, 'it resolves from cwd — the earlier claim was WRONG', 'last writer wins; a revoked claim never reaches the rebuild presented as verified')
  assert.equal(r.rollbackNotes.worked[0].source, 'r2-review-phase', 'and it is attributed to the review that stated it')
})

test('worked: an entry with no evidence and no declared reason is refused before the write', () => {
  const { dir } = runDir()
  cleanThenRemediated(dir)
  const before = digestDir(dir)
  const draft = extra => {
    const f = join(mkdtempSync(join(tmpdir(), 'worked-')), 'draft.json')
    writeFileSync(f, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'r1', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: H1, verdict: 'CHANGES-REQUESTED', custody: { verified: true, contractBreach: false }, readiness: { ready: false }, mode: 're-review', findings: [finding('r0-1')], ...extra }))
    return f
  }
  for (const [label, worked, re] of [
    ['no evidence at all', [workedNote({ evidence: undefined })], /worked-unproven:w1/],
    ['an assertion missing its expectation', [workedNote({ evidence: [{ id: 'we-1', command: 'x' }] })], /worked-evidence-invalid:w1/],
    ['nowhere to apply it', [workedNote({ appliesTo: [] })], /worked-appliesTo-missing:w1/],
    ['a claim with no id', [workedNote({ id: '' })], /worked-id-missing/],
    ['unverifiable without saying why', [workedNote({ evidence: undefined, notVerifiable: true })], /worked-rationale-missing:w1/],
  ]) {
    const out = publish({ dir, file: draft({ worked }), phase: 'r1', skill: 'review-phase', workflowVersion: V })
    assert.equal(out.published, false, label)
    assert.match(out.reason, re, `${label}: ${out.reason}`)
  }
  assert.deepEqual(digestDir(dir), before, 'every refusal above wrote nothing')
  // a design decision no command can demonstrate is legal WITH its reason
  const ok = publish({ dir, file: draft({ worked: [workedNote({ evidence: undefined, notVerifiable: true, rationale: 'a naming convention; no command proves it' })] }), phase: 'r1', skill: 'review-phase', workflowVersion: V })
  assert.equal(ok.published, true, JSON.stringify(ok))
})
