// US-647 — maintainer decisions and amendments resume a run without supersede chains (AC-11, AC-23, AC-12, AC-5, AC-6).
// Real shared authority over a disposable run directory; only the host transport (the comment lists) is faked.
// RUNS FROM `.claude/workflows` ONLY: execute via `pnpm workflows:test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, discoverDecisions, readDecisions, parseDecisionComment, publish, recover, cycleCounters, readHandoffs, STOP_CATALOG, DECISION_OVERRIDABLE_CODES, blockIdOf } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'
import { OVERRIDABLE_BREACH_CODES, verifyChain } from '../../skills/pair-workflow-review-phase/scripts/red-snapshot.mjs'
import { chainRepo, write, git, PR } from './red-snapshot-lib.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-state.mjs', import.meta.url))
const V = '4.0.1'
const SHA = c => c.repeat(40)
const H = `sha256:${'a'.repeat(64)}`
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
let seq = 0
const put = (dir, phase, skill, data, attempt = 1) =>
  writeFileSync(
    join(dir, `${phase}-${skill}${attempt > 1 ? `.attempt-${attempt}` : ''}.json`),
    JSON.stringify({ schemaVersion: 3, workflowVersion: V, run: 'run-1', story: '42', pr: 7, phase, skill, inputHead: SHA('a'), seq: ++seq, attempt, createdAt: new Date(Date.now() + seq).toISOString(), ...data }),
  )
const runDir = () => {
  const root = mkdtempSync(join(tmpdir(), 'decisions-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'), '- `default-assignee`: `rucka`\n')
  return dir
}
const finding = (id, extra = {}) => ({ id, severity: 'Major', location: 'src/a.ts:1', description: 'wrong', recommendation: 'fix', kind: 'defect', transition: 'open', blocking: true, ...extra })
const review = (dir, phase, data, attempt) => put(dir, phase, 'review-phase', { reviewedHead: SHA('c'), verdict: 'changes-requested', findings: [], custody: { contractBreach: false }, readiness: { ready: false }, ...data }, attempt)
const fresh = dir => put(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('b') })
const sealed = (dir, phase = 'a0') => {
  put(dir, phase, 'red-spec', { status: 'red', contractPath: join(dir, `${phase}-contract.json`), contractHash: H })
  put(dir, phase, 'red-verify', { verified: true, sealed: true, contractHash: H, snapshot: SHA('d') })
}
const decisionBody = (over = {}) => '```json\n' + JSON.stringify({ schemaVersion: 1, kind: 'maintainer-decision', story: '42', choice: 'decide', reason: 'accept the trade-off', ...over }) + '\n```'
let cid = 100
const T0 = '2026-11-15T10:00:00Z'
const comment = (body, { login = 'rucka', user = true, createdAt = T0, updatedAt = createdAt } = {}) => ({ id: ++cid, body, url: `https://github.com/o/r/pull/7#issuecomment-${cid}`, authorLogin: login, authorIsUser: user, createdAt, updatedAt })
const hostOf = ({ pr = [], card = [] } = {}) => ({ code: { listComments: () => pr }, pm: { listCardComments: () => card } })
const pick = (dir, comments, extra = {}) => discoverDecisions({ dir, story: '42', pr: 7, repo: 'o/r', host: hostOf(comments), ...extra })
const go = (dir, extra = {}) => resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7, ...extra })

// ── AC-11: pickup — who may decide, and which decision counts ─────────────────────────────────────────────────────────
const unprovable = dir => {
  fresh(dir)
  review(dir, 'r0', { findings: [finding('r0-1')] })
  put(dir, 'r1-g1', 'red-spec', { status: 'unprovable', reason: 'no policy for the id rule' })
}

test('AC-11: the adopted maintainer’s decision resumes the run without a head move; nothing is renamed', () => {
  const dir = runDir()
  unprovable(dir)
  const parked = go(dir).next
  assert.deepEqual([parked.step, parked.reason, parked.refusal], ['blocked', 'failed-preparation', 'unprovable'])
  assert.match(parked.block, /^r1-g1-red-spec\.json@[0-9a-f]{12}$/)
  const out = pick(dir, { card: [comment(decisionBody({ block: parked.block }))] })
  assert.deepEqual(out.recorded.map(r => r.status), ['accepted'])
  const next = go(dir).next
  assert.deepEqual([next.step, next.mode, next.phase, next.attempt], ['prepare', 'remediation', 'r1-g1', 2])
  assert.deepEqual([next.maintainerDecision.choice, next.maintainerDecision.by, next.maintainerDecision.reason], ['decide', 'rucka', 'accept the trade-off'])
  assert.equal(readHandoffs(dir).length, 3)
  assert.match(readFileSync(join(dir, 'maintainer-interventions.md'), 'utf8'), /decide/)
})

for (const [label, c, extra, reason] of [
  ['another human', { login: 'mallory' }, {}, 'author-not-authorized:mallory'],
  ['a bot under the maintainer login', { user: false }, {}, 'author-not-a-user'],
  ['the --maintainer flag naming the commenter (not honored)', { login: 'mallory' }, { maintainer: 'mallory' }, 'author-not-authorized:mallory'],
])
  test(`AC-11 edge: a decision by ${label} is ignored and recorded — the run stays parked`, () => {
    const dir = runDir()
    unprovable(dir)
    const block = go(dir).next.block
    const out = pick(dir, { pr: [comment(decisionBody({ block }), c)] }, extra)
    assert.deepEqual(out.recorded.map(r => [r.status, r.reason]), [['ignored', reason]])
    assert.equal(readDecisions(dir).length, 1)
    assert.equal(go(dir).next.reason, 'failed-preparation')
  })

test('AC-11: the CLI refuses --maintainer — the adopted login is the only authority', () => {
  const dir = runDir()
  const r = spawnSync(process.execPath, [CLI, 'decisions', '--dir', dir, '--story', '42', '--maintainer', 'mallory'], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.match(r.stdout, /unknown flag\(s\) for decisions: --maintainer/)
  for (const cmd of ['apply-scope-decisions', 'approve-correction']) {
    const s = spawnSync(process.execPath, [CLI, cmd, '--dir', dir, '--repo', 'o/r', '--pr', '7', '--decision-ref', 'x', '--maintainer', 'mallory'], { encoding: 'utf8' })
    assert.match(s.stdout, new RegExp(`unknown flag\\(s\\) for ${cmd}: --maintainer`))
  }
})

test('AC-11: a stale decision (an older block) never resumes a newer refusal; the newest decision for the current block wins, both recorded', () => {
  const dir = runDir()
  unprovable(dir)
  const oldBlock = go(dir).next.block
  put(dir, 'r1-g1', 'red-spec', { status: 'unprovable', reason: 'still no policy' }, 2)
  const block = go(dir).next.block
  assert.notEqual(block, oldBlock)
  const old = comment(decisionBody({ block: oldBlock }))
  pick(dir, { pr: [old] })
  assert.equal(go(dir).next.reason, 'failed-preparation')
  pick(dir, { pr: [old, comment(decisionBody({ block, reason: 'first answer' })), comment(decisionBody({ block, reason: 'second answer' }))] })
  assert.equal(readDecisions(dir).filter(r => r.status === 'accepted').length, 3)
  const next = go(dir).next
  assert.deepEqual([next.step, next.attempt, next.maintainerDecision.reason], ['prepare', 3, 'second answer'])
})

test('AC-11: a fresh card with no run directory yet records a standing amendment (no block to answer)', () => {
  const dir = join(runDir(), 'fresh')
  const out = pick(dir, { card: [comment(decisionBody({ choice: 'amend', scope: { paths: ['src/a.ts'] } }))] })
  assert.deepEqual([out.block, out.recorded.map(r => r.status)], [null, ['accepted']])
})

test('AC-11: replaying the same comments records nothing twice', () => {
  const dir = runDir()
  unprovable(dir)
  const c = comment(decisionBody({ block: go(dir).next.block }))
  pick(dir, { pr: [c] })
  assert.deepEqual(pick(dir, { pr: [c] }).recorded, [])
  assert.equal(readDecisions(dir).length, 1)
})

for (const [label, body] of [
  ['an agent comment carrying a pair marker (an escalation quoting the template)', `<!-- pair:first-review #42 PR#7 run:run-1 -->\n${decisionBody()}`],
  ['free text', 'ok, go ahead and decide'],
  ['a fenced block of another kind', '```json\n{"schemaVersion":1,"kind":"contract-correction"}\n```'],
])
  test(`AC-11 business rule: ${label} is not a decision candidate`, () => {
    const dir = runDir()
    unprovable(dir)
    assert.deepEqual(pick(dir, { pr: [comment(body)] }).recorded, [])
    assert.equal(go(dir).next.reason, 'failed-preparation')
  })

for (const [label, body, reason] of [
  ['an unknown key', decisionBody({ block: 'r1-g1-red-spec.json@000000000000', approveMerge: true }), 'unknown-key:approveMerge'],
  ['two fenced blocks', `${decisionBody({ block: 'r1-g1-red-spec.json@000000000000' })}\n${decisionBody()}`, 'ambiguous-fences'],
  ['a choice outside the vocabulary', decisionBody({ block: 'r1-g1-red-spec.json@000000000000', choice: 'merge' }), 'choice-invalid'],
  ['a missing block', decisionBody(), 'block-invalid'],
  ['another story', decisionBody({ block: 'r1-g1-red-spec.json@000000000000', story: '99' }), 'story-mismatch'],
  ['overrides on a decide', decisionBody({ block: 'r1-g1-red-spec.json@000000000000', overrides: [] }), 'overrides-not-allowed'],
])
  test(`AC-11 business rule: a maintainer decision with ${label} is parsed rigidly — ignored with ${reason}`, () => {
    const dir = runDir()
    unprovable(dir)
    assert.deepEqual(pick(dir, { pr: [comment(body)] }).recorded.map(r => [r.status, r.reason]), [['ignored', reason]])
  })

test('AC-11: parseDecisionComment accepts exactly one well-formed block', () => {
  const ok = parseDecisionComment(`Some context.\n${decisionBody({ block: 'r0-review-phase.json@0123456789ab', scope: { paths: ['src/a.ts'], acs: ['AC-3'] } })}`)
  assert.deepEqual([ok.value.choice, ok.value.block, ok.value.scope.paths], ['decide', 'r0-review-phase.json@0123456789ab', ['src/a.ts']])
})

// ── AC-11: every decision block the slice owns resumes from one comment ───────────────────────────────────────────────
const blocks = [
  ['split-required', dir => { fresh(dir); review(dir, 'r0', { findings: [finding('r0-1')] }); put(dir, 'r1-g1', 'red-spec', { status: 'split-required', splitReason: 'two concerns' }) }, ['prepare', 'r1-g1']],
  ['contradiction-unresolvable', dir => { fresh(dir); review(dir, 'r0', { findings: [finding('r0-1')] }); put(dir, 'r1-g1', 'red-spec', { status: 'contradiction', mode: 'remediation', findings: { received: ['r0-1'] } }) }, ['prepare', 'r1-g1']],
  ['green-fix escalate', dir => { fresh(dir); review(dir, 'r0', { findings: [finding('r0-1')] }); sealed(dir, 'r1-g1'); put(dir, 'r1-g1', 'green-fix', { fixed: false, needsHumanDecision: true }) }, ['green', 'r1-g1']],
  ['review escalate (needsHumanDecision)', dir => { fresh(dir); review(dir, 'r0', { findings: [finding('r0-1')], needsHumanDecision: true, humanDecisionIds: ['r0-1'] }) }, ['prepare', 'r1-g1']],
  ['external finding, no head move', dir => { fresh(dir); review(dir, 'r0', { findings: [finding('r0-1', { external: true, location: 'card' })] }) }, ['verify', 'r1']],
  ['maxFixRounds escalate', dir => { fresh(dir); review(dir, 'r0', { findings: [finding('r0-1')] }) }, ['prepare', 'r1-g1'], { maxFixRounds: 0 }],
]
for (const [label, setup, [step, phase], policy] of blocks)
  test(`AC-11: ${label} — one maintainer decision resumes ${step} ${phase}`, () => {
    const dir = runDir()
    setup(dir)
    const opts = policy ? { policy: { ...POLICY, ...policy } } : {}
    const parked = go(dir, opts).next
    assert.equal(parked.step, 'blocked', JSON.stringify(parked))
    pick(dir, { pr: [comment(decisionBody({ block: parked.block }))] })
    const next = go(dir, opts).next
    assert.deepEqual([next.step, next.phase], [step, phase], JSON.stringify(next))
    assert.equal(next.maintainerDecision.decisionRef.startsWith('https://github.com/o/r/pull/7#issuecomment-'), true)
  })

test('AC-11: a decision for a block it cannot answer leaves the run parked and says so', () => {
  const dir = runDir()
  unprovable(dir)
  const block = go(dir).next.block
  pick(dir, { pr: [comment(decisionBody({ block, choice: 'override', overrides: [{ code: 'out-of-scope', path: 'x.ts', segment: 'a0' }] }))] })
  const next = go(dir).next
  assert.equal(next.reason, 'failed-preparation')
  assert.match(next.decisionNotApplicable, /issuecomment/)
})

// ── custody: override (replaces the hand-written file) and reset (AC-5, AC-6) ────────────────────────────────────────
const custodyStuck = (dir, breaches) => {
  sealed(dir)
  put(dir, 'a0', 'implement-phase', { status: 'ok', gatesPassed: true, prNumber: 7, outputHead: SHA('b') })
  review(dir, 'r0', { custody: { contractBreach: true, breaches } })
}

test('AC-11: a custody override comment writes the attributed override and re-verifies the current head', () => {
  const dir = runDir()
  custodyStuck(dir, [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }])
  const parked = go(dir).next
  assert.equal(parked.reason, 'failed-custody')
  const c = comment(decisionBody({ block: parked.block, choice: 'override', reason: 'engine fix, tracked', overrides: [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }] }))
  pick(dir, { pr: [c] })
  const file = JSON.parse(readFileSync(join(dir, 'custody-overrides.json'), 'utf8'))
  assert.deepEqual(file.overrides.map(o => [o.code, o.path, o.segment, o.authorizedBy, o.decisionRef, o.reason]), [['out-of-scope', 'src/x.ts', 'a0', 'rucka', c.url, 'engine fix, tracked']])
  const next = go(dir).next
  assert.deepEqual([next.step, next.mode, next.phase], ['verify', 're-review', 'r1'])
})

test('AC-11 security: a hand-written override entry (no verified decision) is dropped at the next pickup', () => {
  const dir = runDir()
  custodyStuck(dir, [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }])
  writeFileSync(join(dir, 'custody-overrides.json'), JSON.stringify({ overrides: [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0', reason: 'trust me', authorizedBy: 'rucka', at: '2026-11-15T00:00:00Z' }] }))
  pick(dir, { pr: [] })
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'custody-overrides.json'), 'utf8')).overrides, [])
})

test('AC-5/AC-6: a reset on a seal misalignment (no open finding) re-seals through the independent path on the current head; budgets preserved and recorded', () => {
  const dir = runDir()
  custodyStuck(dir, [{ code: 'test-blob-changed', path: 'a.test.mjs', sealedBy: 'a0' }])
  const before = cycleCounters(readHandoffs(dir))
  // the head did not move: the card is stuck, nothing re-derives it on its own
  const parked = go(dir, { head: SHA('c') }).next
  assert.equal(parked.reason, 'failed-custody')
  pick(dir, { pr: [comment(decisionBody({ block: parked.block, choice: 'reset', reason: 'seal moved by a base merge' }))] })
  const next = go(dir, { head: SHA('c') }).next
  assert.deepEqual([next.step, next.mode, next.phase, next.base], ['prepare', 'revision', 'a0-rev2', SHA('c')])
  assert.deepEqual(next.breaches, [{ code: 'test-blob-changed', path: 'a.test.mjs', sealedBy: 'a0' }])
  assert.deepEqual(cycleCounters(readHandoffs(dir)), before)
  const recovery = JSON.parse(readFileSync(join(dir, 'recovery.json'), 'utf8'))
  assert.deepEqual([recovery.resets.length, recovery.resets[0].preserved, recovery.resets[0].restarted], [1, ['maxFixRounds', 'redRepairs', 'greenRetries'], ['autoRecoveryRounds']])
  assert.match(readFileSync(join(dir, 'maintainer-interventions.md'), 'utf8'), /reset/)
})

test('AC-5: a reset with no sealed contract (a fresh card) runs a fresh review on the current head', () => {
  const dir = runDir()
  fresh(dir)
  review(dir, 'r0', { custody: { contractBreach: true, breaches: [{ code: 'contract-expected-refused' }] } })
  const parked = go(dir).next
  pick(dir, { pr: [comment(decisionBody({ block: parked.block, choice: 'reset' }))] })
  const next = go(dir).next
  assert.deepEqual([next.step, next.mode, next.phase], ['verify', 're-review', 'r1'])
})

test('AC-6: a reset on a spent process budget restarts autoRecoveryRounds explicitly and records it', () => {
  const dir = runDir()
  fresh(dir)
  const policy = { ...POLICY, autoRecoveryRounds: 1 }
  assert.equal(recover({ dir, kind: 'resume', policy }).allowed, true)
  assert.equal(recover({ dir, kind: 'resume', policy }).allowed, false)
  assert.equal(recover({ dir, kind: 'stage-retry', policy }).allowed, true)
  assert.equal(recover({ dir, kind: 'stage-retry', policy }).allowed, false)
  pick(dir, { pr: [comment(decisionBody({ block: go(dir, { policy }).block, choice: 'reset' }))] })
  const recovery = JSON.parse(readFileSync(join(dir, 'recovery.json'), 'utf8'))
  assert.deepEqual([recovery.resets[0].restarted, recovery.resets[0].preserved], [['autoRecoveryRounds'], ['maxFixRounds', 'redRepairs', 'greenRetries']])
  assert.equal(recover({ dir, kind: 'resume', policy }).allowed, true)
  assert.equal(recover({ dir, kind: 'stage-retry', policy }).allowed, true)
})

// ── AC-23 (T-16): a finding that contradicts a recorded decision parks before dispatch ───────────────────────────────
const standing = (dir, scope, extra = {}) => pick(dir, { card: [comment(decisionBody({ choice: 'amend', reason: 'ids are opaque strings', scope, ...extra }))] })

test('AC-23: a finding whose obligation overlaps a recorded decision parks as a decision block naming both — no prepare dispatched', () => {
  const dir = runDir()
  fresh(dir)
  standing(dir, { paths: ['src/a.ts'] })
  review(dir, 'r0', { findings: [finding('r0-1')] })
  const next = go(dir).next
  assert.deepEqual([next.step, next.reason], ['blocked', 'decision-conflict'])
  assert.deepEqual(next.findings.map(f => f.id), ['r0-1'])
  assert.equal(next.decisions.length, 1)
  assert.equal(next.decisions[0].reason, 'ids are opaque strings')
  assert.ok(STOP_CATALOG.some(s => s.status === 'decision-conflict' && s.class === 'decision'))
})

test('AC-23: an AC-scoped decision conflicts through the review’s own AC assessment, never through free text', () => {
  const dir = runDir()
  fresh(dir)
  standing(dir, { acs: ['AC-3'] })
  review(dir, 'r0', { findings: [finding('r0-1', { location: 'docs/x.md', description: 'AC-3 says otherwise' })], acAssessment: [{ ac: 'AC-3', assessment: 'weak', tests: ['t'], findingId: 'r0-1' }] })
  assert.equal(go(dir).next.reason, 'decision-conflict')
  const dir2 = runDir()
  fresh(dir2)
  standing(dir2, { acs: ['AC-3'] })
  review(dir2, 'r0', { findings: [finding('r0-1', { location: 'docs/x.md', description: 'AC-3 says otherwise' })] })
  assert.equal(go(dir2).next.step, 'prepare')
})

test('AC-23 control: no overlap ⇒ the round proceeds as usual', () => {
  const dir = runDir()
  fresh(dir)
  standing(dir, { paths: ['src/other.ts'] })
  review(dir, 'r0', { findings: [finding('r0-1')] })
  assert.deepEqual([go(dir).next.step, go(dir).next.phase], ['prepare', 'r1-g1'])
})

test('AC-23 edge: an amendment that withdraws the decision lets the finding proceed as a normal round', () => {
  const dir = runDir()
  fresh(dir)
  const card = [comment(decisionBody({ choice: 'amend', reason: 'ids are opaque strings', scope: { paths: ['src/a.ts'] } }))]
  const ref = pick(dir, { card }).recorded[0].decisionRef
  review(dir, 'r0', { findings: [finding('r0-1')] })
  const parked = go(dir).next
  assert.equal(parked.reason, 'decision-conflict')
  pick(dir, { card, pr: [comment(decisionBody({ choice: 'amend', block: parked.block, reason: 'withdrawn', withdraws: [ref] }))] })
  const next = go(dir).next
  assert.deepEqual([next.step, next.phase], ['prepare', 'r1-g1'])
})

test('AC-23 edge: a decision upholding the recorded one sends the finding back to the reviewer with the decision', () => {
  const dir = runDir()
  fresh(dir)
  const card = [comment(decisionBody({ choice: 'amend', reason: 'ids are opaque strings', scope: { paths: ['src/a.ts'] } }))]
  pick(dir, { card })
  review(dir, 'r0', { findings: [finding('r0-1')] })
  const parked = go(dir).next
  pick(dir, { card, pr: [comment(decisionBody({ block: parked.block, reason: 'the decision stands' }))] })
  const next = go(dir).next
  assert.deepEqual([next.step, next.mode, next.maintainerDecision.reason], ['verify', 're-review', 'the decision stands'])
})

// ── AC-12 (T-6): a missing policy is read fail-closed, recorded, and an overturn opens a new round ───────────────────
const assumptionContract = (dir, assumptions) => {
  const cp = join(dir, 'r1-g1-contract.json')
  const contract = { fixScope: { owner: 'r1-g1', mode: 'behavioral', allowedPaths: ['src/a.ts'] }, redTests: [{ file: 'a.test.mjs', sha256: H, command: 'node --test a.test.mjs', observed: 'fail 1' }], assumptions }
  writeFileSync(cp, JSON.stringify(contract))
  return cp
}
const publishSpec = (dir, cp, host) => {
  const draft = join(dir, 'draft.json')
  const hash = JSON.parse(spawnSync(process.execPath, [CLI, 'hash', '--file', cp], { encoding: 'utf8' }).stdout).contractHash
  writeFileSync(draft, JSON.stringify({ run: 'run-1', story: '42', pr: 7, phase: 'r1-g1', skill: 'red-spec', status: 'red', mode: 'remediation', inputHead: SHA('c'), contractPath: cp, contractHash: hash, findings: { received: ['r0-1'] } }))
  return publish({ dir, file: draft, phase: 'r1-g1', skill: 'red-spec', workflowVersion: V, host, repoRoot: dir })
}

test('AC-12: a missing policy read restrictively is stamped from the contract and posted as an Assumption comment on the card', () => {
  const dir = runDir()
  fresh(dir)
  review(dir, 'r0', { findings: [finding('r0-1')] })
  const posted = []
  const host = { pm: { commentOnCard: x => (posted.push(x), { action: 'created' }) } }
  const out = publishSpec(dir, assumptionContract(dir, [{ id: 'A-1', policy: 'who may approve', reading: 'only the maintainer (most restrictive)' }]), host)
  assert.equal(out.published, true, JSON.stringify(out))
  assert.deepEqual(JSON.parse(readFileSync(out.path, 'utf8')).assumptions.map(a => a.id), ['A-1'])
  assert.equal(posted.length, 1)
  assert.equal(posted[0].id, '42')
  assert.match(posted[0].marker, /^<!-- pair:assumption #42 r1-g1 -->$/)
  assert.match(posted[0].body, /A-1[\s\S]*who may approve[\s\S]*only the maintainer/)
  // r0-4: the template the card comment quotes binds the overturn to THIS preparation's handoff
  assert.ok(posted[0].body.includes(`"block":"${blockIdOf({ file: out.path })}"`))
})

test('AC-12: a malformed assumption is refused before validation', () => {
  const dir = runDir()
  fresh(dir)
  review(dir, 'r0', { findings: [finding('r0-1')] })
  const out = publishSpec(dir, assumptionContract(dir, [{ id: 'A-1', policy: 'who may approve' }]), { pm: { commentOnCard: () => ({}) } })
  assert.deepEqual([out.published, out.reason], [false, 'contract-assumptions-invalid'])
})

test('AC-12: no assumption ⇒ no card comment (policy present)', () => {
  const dir = runDir()
  fresh(dir)
  review(dir, 'r0', { findings: [finding('r0-1')] })
  const posted = []
  assert.equal(publishSpec(dir, assumptionContract(dir, undefined), { pm: { commentOnCard: x => posted.push(x) } }).published, true)
  assert.deepEqual(posted, [])
})

test('AC-12: a later amendment overturning the assumption opens a new round once the review converged', () => {
  const dir = runDir()
  fresh(dir)
  review(dir, 'r0', { findings: [finding('r0-1')] })
  put(dir, 'r1-g1', 'red-spec', { status: 'red', contractPath: join(dir, 'c.json'), contractHash: H, assumptions: [{ id: 'A-1', policy: 'who may approve', reading: 'only the maintainer' }], findings: { received: ['r0-1'] } })
  put(dir, 'r1-g1', 'red-verify', { verified: true, sealed: true, contractHash: H, snapshot: SHA('d') })
  put(dir, 'r1-g1', 'green-fix', { fixed: true, outputHead: SHA('f') })
  review(dir, 'r1', { reviewedHead: SHA('f'), verdict: 'approved', readiness: { ready: true, remoteHead: SHA('f') } })
  assert.equal(go(dir).next.step, 'done')
  // r0-4: an overturn with no block, or naming another run's preparation, opens nothing
  assert.deepEqual(standing(dir, undefined, { reason: 'x', overturns: ['A-1'] }).recorded.map(r => r.reason), ['block-invalid'])
  standing(dir, undefined, { block: 'r1-g1-red-spec.json@0123456789ab', reason: 'stale run', overturns: ['A-1'] })
  assert.equal(go(dir).next.step, 'done')
  const ref = standing(dir, undefined, { block: blockIdOf({ file: join(dir, 'r1-g1-red-spec.json') }), reason: 'any maintainer may approve', overturns: ['A-1'] }).recorded[0].decisionRef
  const next = go(dir).next
  assert.deepEqual([next.step, next.mode, next.phase], ['prepare', 'remediation', 'r2-g1'])
  assert.match(next.findings[0].description, /A-1[\s\S]*any maintainer may approve/)
  assert.ok(next.findings[0].id.startsWith('amend-'), ref)
})

test('AC-11: an override comment may name only a code custody lets a human waive — the two lists are one', () => {
  assert.deepEqual(DECISION_OVERRIDABLE_CODES, [...OVERRIDABLE_BREACH_CODES])
  for (const code of ['parent-not-base', 'snapshot-missing', 'base-not-a-sha'])
    assert.equal(parseDecisionComment(decisionBody({ block: 'r0-review-phase.json@0123456789ab', choice: 'override', overrides: [{ code, path: 'a.ts', segment: 'a0' }] })).error, 'overrides-invalid')
})

test('AC-11 (integration): custody re-runs with the override the maintainer decided — honored, attributed to the verified login and the comment', () => {
  const { cwd, base } = chainRepo()
  write(cwd, 'src/other.js', 'export const o = 1\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'engine fix outside the sealed scope')
  const dir = runDir()
  custodyStuck(dir, [{ code: 'out-of-scope', path: 'src/other.js', segment: 'r1-g1' }])
  assert.equal(verifyChain({ pr: PR, base, cwd, runDir: dir }).verified, false)
  const parked = go(dir).next
  const c = comment(decisionBody({ block: parked.block, choice: 'override', reason: 'tracked engine fix', overrides: [{ code: 'out-of-scope', path: 'src/other.js', segment: 'r1-g1' }] }))
  pick(dir, { pr: [comment(decisionBody({ block: parked.block, choice: 'override', reason: 'forged', overrides: [{ code: 'out-of-scope', path: 'src/other.js', segment: 'r1-g1' }] }), { login: 'mallory' })] })
  assert.equal(verifyChain({ pr: PR, base, cwd, runDir: dir }).verified, false, 'a non-maintainer override waives nothing')
  pick(dir, { pr: [c] })
  const out = verifyChain({ pr: PR, base, cwd, runDir: dir })
  assert.equal(out.verified, true, JSON.stringify(out.breaches))
  assert.deepEqual([out.overriddenBreaches[0].override.authorizedBy, out.overriddenBreaches[0].override.decisionRef], ['rucka', c.url])
})

// ── the resumed dispatch carries the decision to the stage that answers it ──────────────────────────────────────────
const DISPATCH = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs', import.meta.url))
const MD = { decisionRef: 'https://github.com/o/r/pull/7#issuecomment-9', choice: 'decide', reason: 'the id rule is opaque', by: 'rucka' }
const packet = next => {
  const r = spawnSync(process.execPath, [DISPATCH, 'packet', '--next', JSON.stringify({ pr: 7, ...next }), '--card', JSON.stringify({ id: '42', branch: 'feature/US-42-x', base: 'origin/main', title: 't' }), '--run', 'story-42', '--workflow-version', V], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  return JSON.parse(r.stdout).prompt
}
const contract = { path: '/tmp/c.json', hash: H, snapshot: SHA('d') }
for (const next of [
  { step: 'prepare', mode: 'remediation', phase: 'r1-g1', round: 1, attempt: 2, base: SHA('c') },
  { step: 'green', mode: 'retry', phase: 'r1-g1', round: 1, attempt: 2, base: SHA('c'), contract },
  { step: 'verify', mode: 're-review', phase: 'r1', round: 1, attempt: 1, base: SHA('c') },
])
  test(`AC-11: the ${next.step} packet carries $maintainerDecision verbatim — and none without a decision`, () => {
    assert.match(packet({ ...next, maintainerDecision: MD }), /\$maintainerDecision=\{[^\n]*issuecomment-9[^\n]*the id rule is opaque/)
    assert.doesNotMatch(packet(next), /\$maintainerDecision/)
  })

// ── review r0-1: a custody override is bound to THIS run and revocable ───────────────────────────────────────────────
const overrideOf = (block, extra = {}) => comment(decisionBody({ block, choice: 'override', reason: 'tracked engine fix', overrides: [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }], ...extra }))
const overridesIn = dir => (existsSync(join(dir, 'custody-overrides.json')) ? JSON.parse(readFileSync(join(dir, 'custody-overrides.json'), 'utf8')).overrides : [])

test('r0-1: an override comment of another run (its block is no handoff of this run dir) waives nothing here', () => {
  const a = runDir()
  custodyStuck(a, [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }])
  const c = overrideOf(go(a).next.block)
  pick(a, { pr: [c] })
  assert.equal(overridesIn(a).length, 1)
  const b = runDir()
  custodyStuck(b, [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }])
  pick(b, { pr: [c] })
  assert.deepEqual(overridesIn(b), [])
  // a forged block that names a real file of this run with a wrong digest is no better
  pick(b, { pr: [overrideOf(go(b).next.block.replace(/@.*/, '@000000000000'))] })
  assert.deepEqual(overridesIn(b), [])
})

for (const [label, revoke] of [
  ['an amendment withdrawing it', (dir, c) => pick(dir, { pr: [c, comment(decisionBody({ choice: 'amend', reason: 'revoked', withdraws: [c.url] }))] })],
  ['the comment deleted on the host', dir => pick(dir, { pr: [] })],
  ['the comment edited after it was accepted', (dir, c) => pick(dir, { pr: [{ ...c, updatedAt: '2026-11-15T11:00:00Z' }] })],
])
  test(`r0-1/r0-2: an accepted override is revoked by ${label} — the derived file drops it and the record says why`, () => {
    const dir = runDir()
    custodyStuck(dir, [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }])
    const c = overrideOf(go(dir).next.block)
    pick(dir, { pr: [c] })
    assert.equal(overridesIn(dir).length, 1)
    revoke(dir, c)
    assert.deepEqual(overridesIn(dir), [])
  })

test('r0-1 control: a failed host read revokes nothing (deletion is unprovable then)', () => {
  const dir = runDir()
  custodyStuck(dir, [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }])
  const c = overrideOf(go(dir).next.block)
  pick(dir, { pr: [c] })
  discoverDecisions({ dir, story: '42', pr: 7, host: { code: { listComments: () => { throw new Error('offline') } }, pm: { listCardComments: () => [] } } })
  assert.equal(overridesIn(dir).length, 1)
})

// ── review r0-2: a decision is a comment nobody edited ───────────────────────────────────────────────────────────────
for (const [label, extra, reason] of [
  ['edited after posting (the host names only its creator)', { updatedAt: '2026-11-15T11:00:00Z' }, 'comment-edited'],
  ['without the host timestamps that prove it unedited', { createdAt: null, updatedAt: null }, 'comment-edited'],
])
  test(`r0-2: a maintainer decision comment ${label} is ignored with ${reason}`, () => {
    const dir = runDir()
    unprovable(dir)
    const out = pick(dir, { pr: [comment(decisionBody({ block: go(dir).next.block }), extra)] })
    assert.deepEqual(out.recorded.map(r => [r.status, r.reason]), [['ignored', reason]])
    assert.equal(go(dir).next.reason, 'failed-preparation')
  })

test('r0-2: a comment skipped once (no decision block) and later edited into a decision is still refused', () => {
  const dir = runDir()
  unprovable(dir)
  const c = comment('looks good')
  assert.deepEqual(pick(dir, { pr: [c] }).recorded, [])
  const out = pick(dir, { pr: [{ ...c, body: decisionBody({ block: go(dir).next.block, choice: 'reset' }), updatedAt: '2026-11-15T12:00:00Z' }] })
  assert.deepEqual(out.recorded.map(r => r.reason), ['comment-edited'])
})

// ── review r0-3: every consumer of resolve picks decisions up first ──────────────────────────────────────────────────
const SKILL_OF = name => readFileSync(new URL(`../../skills/pair-workflow-${name}/SKILL.md`, import.meta.url), 'utf8')
for (const name of ['cycle', 'red-spec', 'red-verify', 'implement-phase', 'green-fix', 'review-phase'])
  test(`r0-3: the ${name} skill runs \`cycle-state.mjs decisions\` before its first resolve`, () => {
    const md = SKILL_OF(name)
    const pickup = md.search(/cycle-state\.mjs"? decisions --dir/)
    const first = md.search(/cycle-state\.mjs"? resolve --dir/)
    assert.ok(pickup !== -1 && first !== -1 && pickup < first, `${name}: decisions ${pickup} must precede resolve ${first}`)
  })

// ── review r1-1: revocation only removes authority — a withdrawal, once accepted, is permanent ───────────────────────
for (const [label, mutate] of [
  ['edited', w => [{ ...w, updatedAt: '2026-11-15T11:00:00Z' }]],
  ['deleted', () => []],
])
  test(`r1-1: the withdrawal comment ${label} afterwards never resurrects the withdrawn override`, () => {
    const dir = runDir()
    custodyStuck(dir, [{ code: 'out-of-scope', path: 'src/x.ts', segment: 'a0' }])
    const o = overrideOf(go(dir).next.block)
    pick(dir, { pr: [o] })
    const w = comment(decisionBody({ choice: 'amend', reason: 'withdrawn', withdraws: [o.url] }))
    pick(dir, { pr: [o, w] })
    assert.deepEqual(overridesIn(dir), [])
    pick(dir, { pr: [o, ...mutate(w)] })
    assert.deepEqual(overridesIn(dir), [], 'a withdrawn override stays withdrawn')
  })

test('r1-1: a withdrawn decide stays withdrawn when the withdrawal comment is deleted — the block stays parked', () => {
  const dir = runDir()
  unprovable(dir)
  const d = comment(decisionBody({ block: go(dir).next.block }))
  const w = comment(decisionBody({ choice: 'amend', reason: 'not that', withdraws: [d.url] }))
  pick(dir, { pr: [d, w] })
  assert.equal(go(dir).next.reason, 'failed-preparation')
  pick(dir, { pr: [d] })
  assert.equal(go(dir).next.reason, 'failed-preparation')
})
