// US-591 — owner-approved correction of a wrong sealed oracle (AC-1..AC-4). Real shared authority over a
// disposable run directory; only the host transport (the comment read) is faked.
// RUNS FROM `.claude/workflows` ONLY: execute via `pnpm workflows:test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, approveCorrection, readApprovals } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'

const DISPATCH = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs', import.meta.url))

const V = '4.0.1'
const SHA = c => c.repeat(40)
const H = `sha256:${'a'.repeat(64)}`
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
let seq = 0
const put = (dir, phase, skill, data) =>
  writeFileSync(join(dir, `${phase}-${skill}.json`), JSON.stringify({ schemaVersion: 3, workflowVersion: V, run: 'run-1', story: '42', phase, skill, inputHead: SHA('a'), seq: ++seq, attempt: 1, ...data }))
const runDir = () => {
  const root = mkdtempSync(join(tmpdir(), 'owner-corr-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'), '- `default-assignee`: `rucka`\n')
  put(dir, 'a0', 'red-spec', { status: 'red', contractPath: join(dir, 'a0-red-contract.json'), contractHash: H })
  put(dir, 'a0', 'red-verify', { verified: true, sealed: true, contractHash: H, snapshot: SHA('b') })
  put(dir, 'r0', 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'approved', findings: [], custody: { contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') } })
  return dir
}
const body = (over = {}) => '```json\n' + JSON.stringify({ schemaVersion: 1, kind: 'contract-correction', story: '42', pr: 7, predecessorContractHash: H, rows: ['AC-1'], delta: 'oracle expects 9 not 8', reason: 'wrong pnpm oracle', ...over }) + '\n```'
const hostOf = comments => ({
  code: {
    parseCommentRef: ref => ({ id: Number(/-(\d+)$/.exec(ref)[1]), pr: 7, inScope: true }),
    readComment: ({ id }) => comments[id],
  },
})
const c = (login, text = body(), type = 'User') => ({ authorLogin: login, authorIsUser: type === 'User', pr: 7, body: text, createdAt: '2026-11-15T10:00:00Z', updatedAt: '2026-11-15T10:00:00Z' })
const approve = (dir, id, comments) => approveCorrection({ dir, decisionRef: `pr7#c-${id}`, repo: 'o/r', pr: 7, host: hostOf(comments) })
const go = dir => resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 })

test('AC-1/AC-4: a verified maintainer approval routes ONE successor revision with the bound audit, and replay or the advancing line never duplicates it', () => {
  const dir = runDir()
  const out = approve(dir, 1, { 1: c('rucka') })
  assert.equal(out.approved, true, JSON.stringify(out))
  assert.deepEqual([out.record.actor, out.record.predecessorContractHash, out.record.rows], ['rucka', H, ['AC-1']])
  const next = go(dir).next
  assert.deepEqual([next.step, next.mode, next.phase, next.changedRows], ['prepare', 'revision', 'a0-rev2', ['AC-1']])
  assert.equal(next.ownerApproval.decisionRef, 'pr7#c-1')
  assert.equal(next.contract.hash, H)
  assert.equal(approve(dir, 1, { 1: c('rucka') }).reason, 'already-applied')
  assert.equal(readApprovals(dir).length, 1)
  // the successor preparation exists: the approval is consumed, the normal route resumes
  put(dir, 'a0-rev2', 'red-spec', { status: 'red', contractPath: join(dir, 'a0-rev2-red-contract.json'), contractHash: `sha256:${'d'.repeat(64)}` })
  assert.equal(go(dir).next.step, 'validate')
})

test('AC-1: refused — bot, other human, stale/foreign binding, plain name; nothing recorded, nothing routed', () => {
  const dir = runDir()
  const cases = [
    [c('rucka', body(), 'Bot'), 'author-not-a-user'],
    [c('mallory'), 'author-not-authorized:mallory'],
    [c('rucka', body({ story: '99' })), 'story-mismatch'],
    [c('rucka', body({ pr: 8 })), 'pr-mismatch'],
    [c('rucka', body({ predecessorContractHash: `sha256:${'e'.repeat(64)}` })), 'predecessor-not-sealed'],
    [c('rucka', body({ rows: [] })), 'rows-invalid'],
    [c('rucka', 'approved, go ahead'), 'no-fenced-json'],
  ]
  for (const [comment, reason] of cases) assert.equal(approve(dir, 2, { 2: comment }).reason, reason)
  assert.deepEqual(readApprovals(dir), [])
  assert.equal(go(dir).next.step, 'done')
})

test('AC-4: a second approval while one is pending is a conflict; one for a predecessor the line already moved past is stale', () => {
  const dir = runDir()
  assert.equal(approve(dir, 1, { 1: c('rucka') }).approved, true)
  assert.equal(approve(dir, 3, { 3: c('rucka', body({ delta: 'other' })) }).reason, 'conflicting-approval')
  put(dir, 'a0-rev2', 'red-spec', { status: 'red', contractPath: join(dir, 'x.json'), contractHash: `sha256:${'d'.repeat(64)}` })
  assert.equal(approve(dir, 4, { 4: c('rucka', body({ delta: 'late' })) }).reason, 'stale-predecessor')
})

// A preparation refused `unprovable` on a non-causal flake (e.g. Vitest's onTaskUpdate RPC timeout) has no
// RED witness to write and no commit to make: the maintainer's verified waiver is the only way on.
const waiverRun = () => {
  const dir = runDir()
  const f = id => ({ id, severity: 'Major', blocking: true, transition: 'open', kind: 'defect', location: 'a', description: 'd', recommendation: 'r' })
  put(dir, 'r0', 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'CHANGES-REQUESTED', findings: [f('r0-1'), f('r0-2')], custody: { contractBreach: false }, readiness: { ready: false } })
  put(dir, 'r1-g1', 'red-spec', { status: 'unprovable', mode: 'remediation', inputHead: SHA('c'), findings: { received: ['r0-1'] }, reason: 'vitest onTaskUpdate timeout, not caused by the code' })
  return dir
}
const waiver = (over = {}) => '```json\n' + JSON.stringify({ schemaVersion: 1, kind: 'preparation-waiver', story: '42', pr: 7, phase: 'r1-g1', attempt: 1, inputHead: SHA('c'), findings: ['r0-1'], reason: 'flake, not causal', ...over }) + '\n```'

test('preparation waiver: a verified maintainer waiver of an `unprovable` preparation routes a re-review carrying the waived findings, once', () => {
  const dir = waiverRun()
  assert.deepEqual([go(dir).next.step, go(dir).next.reason], ['blocked', 'failed-preparation'])
  const out = approve(dir, 5, { 5: c('rucka', waiver()) })
  assert.equal(out.approved, true, JSON.stringify(out))
  const next = go(dir).next
  assert.deepEqual([next.step, next.mode, next.phase, next.openIds], ['verify', 're-review', 'r2', ['r0-2']])
  assert.deepEqual(next.waived, [{ id: 'r0-1', decisionRef: 'pr7#c-5', actor: 'rucka', reason: 'flake, not causal' }])
  // the reviewer is handed the waiver, never left to re-raise what the human closed
  const packet = spawnSync(process.execPath, [DISPATCH, 'packet', '--next', JSON.stringify(next), '--card', JSON.stringify({ id: '42', branch: 'feature/US-42-x', title: 't', prNumber: 7 }), '--run', 'story-42', '--workflow-version', V], { encoding: 'utf8' })
  assert.equal(packet.status, 0, packet.stdout + packet.stderr)
  assert.match(JSON.parse(packet.stdout).prompt, /\$waived=\[\{"id":"r0-1","decisionRef":"pr7#c-5"/)
  assert.equal(approve(dir, 5, { 5: c('rucka', waiver()) }).reason, 'already-applied')
})

test('preparation waiver: refused — not the maintainer, a finding the refusal did not hold, no unprovable tail; nothing recorded, nothing routed', () => {
  const dir = waiverRun()
  const cases = [
    [c('mallory', waiver()), 'author-not-authorized:mallory'],
    [c('rucka', waiver(), 'Bot'), 'author-not-a-user'],
    [c('rucka', waiver({ findings: ['r0-2'] })), 'waiver-findings-unknown'],
    [c('rucka', waiver({ phase: 'r1-g2' })), 'waiver-not-owed'],
    [c('rucka', waiver({ findings: [] })), 'findings-invalid'],
    // bound to the refused attempt: another attempt or another head is not this refusal
    [c('rucka', waiver({ attempt: 2 })), 'waiver-attempt-mismatch'],
    [c('rucka', waiver({ inputHead: SHA('d') })), 'waiver-attempt-mismatch'],
    [c('rucka', waiver({ inputHead: undefined })), 'inputHead-invalid'],
  ]
  for (const [comment, reason] of cases) assert.equal(approve(dir, 6, { 6: comment }).reason, reason)
  assert.deepEqual(readApprovals(dir), [])
  assert.equal(go(dir).next.reason, 'failed-preparation')
  // a run whose tail is not an unprovable preparation owes no waiver
  assert.equal(approve(runDir(), 7, { 7: c('rucka', waiver()) }).reason, 'waiver-not-owed')
})

test('preparation waiver r0-1: the same comment replayed in ANOTHER run of the PR is refused — nothing recorded, nothing routed there', () => {
  const a = waiverRun()
  assert.equal(approve(a, 5, { 5: c('rucka', waiver()) }).approved, true)
  // run B: same story, same PR, same phase/attempt/head, a different finding under the same id
  const b = join(a, '..', '..', 'run-2', '42')
  mkdirSync(b, { recursive: true })
  const f = { id: 'r0-1', severity: 'Critical', blocking: true, transition: 'open', kind: 'defect', location: 'b', description: 'injection', recommendation: 'r' }
  put(b, 'r0', 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'CHANGES-REQUESTED', findings: [f], custody: { contractBreach: false }, readiness: { ready: false } })
  put(b, 'r1-g1', 'red-spec', { status: 'unprovable', mode: 'remediation', inputHead: SHA('c'), findings: { received: ['r0-1'] } })
  assert.equal(approve(b, 5, { 5: c('rucka', waiver()) }).reason, 'decisionRef-already-used')
  assert.deepEqual(readApprovals(b), [])
  assert.equal(go(b).next.reason, 'failed-preparation')
})

test('preparation waiver r0-2: only the ADOPTED maintainer authorizes it — a --maintainer naming the commenter is not honored', () => {
  const dir = waiverRun()
  const out = approveCorrection({ dir, decisionRef: 'pr7#c-8', repo: 'o/r', pr: 7, maintainer: 'mallory', host: hostOf({ 8: c('mallory', waiver()) }) })
  assert.equal(out.reason, 'author-not-authorized:mallory')
  assert.deepEqual(readApprovals(dir), [])
})

// The REAL GitHub comment-URL grammar: /pull/ and /issues/ name the same comment, and owner/repo case is
// not identity to the API. A replay is judged on the comment (repo + id), never on the URL spelling.
const ghHost = comments => ({
  code: {
    parseCommentRef: (ref, { repo }) => {
      const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)#issuecomment-(\d+)$/.exec(ref)
      return m ? { pr: Number(m[3]), id: m[4], inScope: `${m[1]}/${m[2]}` === repo } : null
    },
    readComment: ({ id }) => comments[id],
  },
})
for (const [label, ref, repo] of [
  ['/issues/ instead of /pull/', 'https://github.com/o/r/issues/7#issuecomment-555', 'o/r'],
  ['owner/repo in another case', 'https://github.com/O/R/pull/7#issuecomment-555', 'O/R'],
]) {
  test(`preparation waiver r0-1: a replay spelled with ${label} is the same comment — refused in another run`, () => {
    const a = waiverRun()
    const comments = { 555: c('rucka', waiver()) }
    assert.equal(approveCorrection({ dir: a, decisionRef: 'https://github.com/o/r/pull/7#issuecomment-555', repo: 'o/r', pr: 7, host: ghHost(comments) }).approved, true)
    const b = join(a, '..', '..', 'run-2', '42')
    mkdirSync(b, { recursive: true })
    put(b, 'r0', 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'CHANGES-REQUESTED', findings: [{ id: 'r0-1', severity: 'Critical', blocking: true, transition: 'open', kind: 'defect', location: 'b', description: 'x', recommendation: 'r' }], custody: { contractBreach: false }, readiness: { ready: false } })
    put(b, 'r1-g1', 'red-spec', { status: 'unprovable', mode: 'remediation', inputHead: SHA('c'), findings: { received: ['r0-1'] } })
    assert.equal(approveCorrection({ dir: b, decisionRef: ref, repo, pr: 7, host: ghHost(comments) }).reason, 'decisionRef-already-used')
    assert.deepEqual(readApprovals(b), [])
  })
}

test('preparation waiver r1-1: a comment already consumed, edited to name a NEWER refused attempt of the same run, is refused — never a false already-applied', () => {
  const dir = waiverRun()
  assert.equal(approve(dir, 5, { 5: c('rucka', waiver()) }).approved, true)
  writeFileSync(join(dir, 'r1-g1-red-spec.attempt-2.json'), JSON.stringify({ schemaVersion: 3, workflowVersion: V, run: 'run-1', story: '42', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('c'), seq: ++seq, attempt: 2, status: 'unprovable', mode: 'repair', findings: { received: ['r0-1'] } }))
  assert.equal(go(dir).next.reason, 'failed-preparation', 'the new refusal is not covered by the consumed waiver')
  const out = approve(dir, 5, { 5: c('rucka', waiver({ attempt: 2 })) })
  assert.deepEqual([out.approved, out.reason], [false, 'decisionRef-already-used'])
  assert.equal(readApprovals(dir).length, 1)
})

// A host faithful to GitHub: a comment is looked up NUMERICALLY (`…-0555` is comment 555) and comes back with its
// canonical id, the repo of its html_url, and its created/updated times.
const T0 = '2026-11-15T10:00:00Z'
const faithful = (comments, { updatedAt = T0, createdAt = T0, repo = 'o/r' } = {}) => ({
  code: {
    id: 'github',
    parseCommentRef: (ref, { repo }) => {
      const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)#issuecomment-(\d+)$/.exec(ref)
      return m ? { pr: Number(m[3]), id: m[4], inScope: `${m[1]}/${m[2]}` === repo } : null
    },
    readComment: ({ id }) => {
      const c = comments[Number(id)]
      return c && { ...c, id: String(Number(id)), repo, createdAt, updatedAt }
    },
  },
})
const runB = a => {
  const b = join(a, '..', '..', 'run-2', '42')
  mkdirSync(b, { recursive: true })
  put(b, 'r0', 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'CHANGES-REQUESTED', findings: [{ id: 'r0-1', severity: 'Critical', blocking: true, transition: 'open', kind: 'defect', location: 'b', description: 'x', recommendation: 'r' }], custody: { contractBreach: false }, readiness: { ready: false } })
  put(b, 'r1-g1', 'red-spec', { status: 'unprovable', mode: 'remediation', inputHead: SHA('c'), findings: { received: ['r0-1'] } })
  return b
}
const URL555 = 'https://github.com/o/r/pull/7#issuecomment-555'
const URL0555 = 'https://github.com/o/r/pull/7#issuecomment-0555'

test('preparation waiver r0-1: the key is the comment`s canonical identity from the host — `-0555` after `-555` is refused in another run', () => {
  const a = waiverRun()
  const comments = { 555: c('rucka', waiver()) }
  assert.equal(approveCorrection({ dir: a, decisionRef: URL555, repo: 'o/r', pr: 7, host: faithful(comments) }).approved, true)
  const b = runB(a)
  assert.equal(approveCorrection({ dir: b, decisionRef: URL0555, repo: 'o/r', pr: 7, host: faithful(comments) }).reason, 'decisionRef-already-used')
  assert.deepEqual(readApprovals(b), [])
})

test('preparation waiver r0-1: `-0555` after `-555` on a NEWER attempt of the same run is refused too', () => {
  const dir = waiverRun()
  assert.equal(approveCorrection({ dir, decisionRef: URL555, repo: 'o/r', pr: 7, host: faithful({ 555: c('rucka', waiver()) }) }).approved, true)
  writeFileSync(join(dir, 'r1-g1-red-spec.attempt-2.json'), JSON.stringify({ schemaVersion: 3, workflowVersion: V, run: 'run-1', story: '42', phase: 'r1-g1', skill: 'red-spec', inputHead: SHA('c'), seq: ++seq, attempt: 2, status: 'unprovable', mode: 'repair', findings: { received: ['r0-1'] } }))
  assert.equal(approveCorrection({ dir, decisionRef: URL0555, repo: 'o/r', pr: 7, host: faithful({ 555: c('rucka', waiver({ attempt: 2 })) }) }).reason, 'decisionRef-already-used')
  assert.equal(readApprovals(dir).length, 1)
})

for (const [label, times, reason] of [
  ['never edited', {}, undefined],
  ['edited after it was posted', { updatedAt: '2026-11-15T10:07:00Z' }, 'comment-edited'],
  ['with no update time', { updatedAt: null }, 'comment-edited'],
  // a host that exposes no comment times at all (today Azure DevOps): undefined === undefined proves nothing
  ['from a host with no comment times at all', { createdAt: undefined, updatedAt: undefined }, 'comment-edited'],
]) {
  test(`preparation waiver: a maintainer comment ${label} ⇒ ${reason ?? 'approved'}`, () => {
    const dir = waiverRun()
    const comments = { 555: { ...c('rucka', waiver()), createdAt: undefined, updatedAt: undefined } }
    const host = { code: { ...faithful(comments).code, readComment: ({ id }) => ({ ...comments[Number(id)], id: String(Number(id)), repo: 'o/r', createdAt: T0, updatedAt: T0, ...times }) } }
    const out = approveCorrection({ dir, decisionRef: URL555, repo: 'o/r', pr: 7, host })
    assert.equal(out.reason, reason, JSON.stringify(out))
    assert.equal(readApprovals(dir).length, reason ? 0 : 1)
  })
}

test('preparation waiver r0-1: on GitHub the comment id is global — the same comment after a repo rename/transfer between runs is refused', () => {
  const a = waiverRun()
  const comments = { 555: c('rucka', waiver()) }
  assert.equal(approveCorrection({ dir: a, decisionRef: URL555, repo: 'o/r', pr: 7, host: faithful(comments) }).approved, true)
  const b = runB(a)
  const out = approveCorrection({ dir: b, decisionRef: 'https://github.com/n/r/pull/7#issuecomment-555', repo: 'n/r', pr: 7, host: faithful(comments, { repo: 'n/r' }) })
  assert.equal(out.reason, 'decisionRef-already-used')
  assert.deepEqual(readApprovals(b), [])
})
