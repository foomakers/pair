// US-575 — auto-recovery: stale durable failures (keyed by PR head + base head), a moved PR head after a
// review, the recovery budget (`autoRecoveryRounds`) with its `needs-human` park, the merge-gate fall-back to
// the fix stage, the mechanical base sync and the deterministic prerequisite state.
// RUNS FROM `.claude/workflows` ONLY (like cycle-state.test.mjs): execute via `pnpm workflows:test`.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, recover, recordGateRed, baseSync, prereqState, POLICY_DEFAULTS } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-state.mjs', import.meta.url))
const V = '4.0.1'
const SHA = c => c.repeat(40)
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }

let seq = 0
const runDir = () => {
  const root = mkdtempSync(join(tmpdir(), 'recovery-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  return dir
}
const put = (dir, phase, skill, data, attempt = 1) =>
  writeFileSync(
    join(dir, `${phase}-${skill}${attempt > 1 ? `.attempt-${attempt}` : ''}.json`),
    JSON.stringify({ schemaVersion: 3, workflowVersion: V, run: 'run-1', story: '42', phase, skill, inputHead: SHA('a'), seq: ++seq, attempt, ...data }),
  )
const failedImplement = dir => {
  put(dir, 'a0', 'implement-phase', { status: 'ok', prNumber: 7, outputHead: SHA('c'), gatesPassed: false })
  put(dir, 'a0', 'implement-phase', { status: 'ok', prNumber: 7, outputHead: SHA('d'), gatesPassed: false }, 2)
}
const approved = (dir, reviewedHead = SHA('c'), extra = {}) =>
  put(dir, 'r0', 'review-phase', { pr: 7, reviewedHead, verdict: 'approved', findings: [], custody: { contractBreach: false }, readiness: { ready: true, remoteHead: reviewedHead }, ...extra })
const go = (dir, extra = {}) => resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'fresh', ...extra })
const pick = (o, ...ks) => Object.fromEntries(ks.map(k => [k, o[k]]))

// ── T-1: failure keys + stale rule (AC3) ──────────────────────────────────────────────────────

test('AC3: a failed-implement recorded on one base is STALE once the base moved — resolve re-derives an implement retry', () => {
  const dir = runDir()
  failedImplement(dir)
  let r = go(dir, { head: SHA('d'), baseHead: SHA('1') })
  assert.deepEqual([r.next.step, r.next.reason], ['blocked', 'failed-implement'])
  assert.deepEqual(r.next.failureKey, { prHead: SHA('d'), baseHead: SHA('1') })
  r = go(dir, { head: SHA('d'), baseHead: SHA('2') })
  assert.deepEqual(pick(r.next, 'step', 'mode', 'phase', 'attempt', 'stale'), { step: 'implement', mode: 'retry', phase: 'a0', attempt: 3, stale: true })
  // A stage's own Step 0 resolve passes no heads: the stale verdict is durable, never re-judged into a block.
  r = go(dir)
  assert.deepEqual(pick(r.next, 'step', 'attempt'), { step: 'implement', attempt: 3 })
})

test('AC3: the same failure under the SAME keys stays durable', () => {
  const dir = runDir()
  failedImplement(dir)
  go(dir, { head: SHA('d'), baseHead: SHA('1') })
  const r = go(dir, { head: SHA('d'), baseHead: SHA('1') })
  assert.deepEqual([r.next.step, r.next.reason], ['blocked', 'failed-implement'])
})

test('AC3: a moved PR head makes the failure stale too', () => {
  const dir = runDir()
  failedImplement(dir)
  go(dir, { head: SHA('d'), baseHead: SHA('1') })
  const r = go(dir, { head: SHA('e'), baseHead: SHA('1') })
  assert.equal(r.next.step, 'implement')
})

test('AC3: legacy — no heads ever given ⇒ today\'s durable failure, nothing recorded', () => {
  const dir = runDir()
  failedImplement(dir)
  const r = go(dir)
  assert.deepEqual([r.next.step, r.next.reason, r.next.budget], ['blocked', 'failed-implement', 'greenRetries'])
  assert.equal(existsSync(join(dir, 'recovery.json')), false)
})

test('AC3: failed-preparation re-derives a prepare attempt once stale', () => {
  const dir = runDir()
  put(dir, 'r1-g1', 'red-spec', { status: 'unprovable', reason: 'no witness', mode: 'remediation' })
  let r = go(dir, { head: SHA('c'), baseHead: SHA('1') })
  assert.deepEqual([r.next.step, r.next.reason], ['blocked', 'failed-preparation'])
  r = go(dir, { head: SHA('c'), baseHead: SHA('2') })
  assert.deepEqual(pick(r.next, 'step', 'phase', 'attempt', 'stale'), { step: 'prepare', phase: 'r1-g1', attempt: 2, stale: true })
})

test('AC3: failed-custody re-derives a re-verification once the base moved', () => {
  const dir = runDir()
  put(dir, 'r0', 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'changes-requested', findings: [], custody: { contractBreach: true, breaches: [{ code: 'out-of-scope' }] }, readiness: { ready: false } })
  let r = go(dir, { head: SHA('c'), baseHead: SHA('1') })
  assert.deepEqual([r.next.step, r.next.reason], ['blocked', 'failed-custody'])
  r = go(dir, { head: SHA('c'), baseHead: SHA('2') })
  assert.deepEqual(pick(r.next, 'step', 'mode', 'phase', 'stale'), { step: 'verify', mode: 're-review', phase: 'r1', stale: true })
})

// ── T-1: stale review handoff (AC4) ───────────────────────────────────────────────────────────

test('AC4: a terminal review whose reviewedHead is not the current PR head is not terminal — next is verify', () => {
  const dir = runDir()
  put(dir, 'r0', 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'changes-requested', findings: [], custody: { contractBreach: true, breaches: [] }, readiness: { ready: false } })
  const r = go(dir, { head: SHA('e') })
  assert.deepEqual(pick(r.next, 'step', 'mode', 'phase', 'base', 'headMoved'), { step: 'verify', mode: 're-review', phase: 'r1', base: SHA('c'), headMoved: true })
})

test('AC4 control: a review that asked a HUMAN decision keeps waiting for it even when the head moved', () => {
  const dir = runDir()
  put(dir, 'r0', 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'changes-requested', needsHumanDecision: true, findings: [{ id: 'r0-1', severity: 'Major', blocking: true, transition: 'open', kind: 'defect', location: 'a', description: 'd', recommendation: 'r' }], custody: { contractBreach: false }, readiness: { ready: false } })
  const r = go(dir, { head: SHA('e') })
  assert.deepEqual([r.next.step, r.next.reason], ['blocked', 'escalate'])
})

// ── T-2 / T-3: recovery budget, needs-human, defaults (AC8) ──────────────────────────────────

test('AC8: the KB defaults are autoRecoveryRounds 5 and maxFixRounds 10, returned with every resolve', () => {
  assert.equal(POLICY_DEFAULTS.autoRecoveryRounds, 5)
  assert.equal(POLICY_DEFAULTS.maxFixRounds, 10)
  const r = resolve({ dir: runDir(), workflowVersion: V, entry: 'fresh' })
  assert.deepEqual(pick(r.policy, 'autoRecoveryRounds', 'maxFixRounds'), { autoRecoveryRounds: 5, maxFixRounds: 10 })
})

test('AC8: recovery rounds are granted until autoRecoveryRounds is spent, then the card is needs-human with the reason', () => {
  const dir = runDir()
  const policy = { autoRecoveryRounds: 2 }
  assert.deepEqual(pick(recover({ dir, kind: 'gate-retry', detail: 'BLOCKED — 1 gates failing', policy }), 'allowed', 'round', 'budget'), { allowed: true, round: 1, budget: 2 })
  assert.equal(recover({ dir, kind: 'ci-rerun', detail: 'ci failed', policy }).allowed, true)
  const spent = recover({ dir, kind: 'base-sync', detail: 'conflict', policy })
  assert.equal(spent.allowed, false)
  assert.deepEqual(pick(spent.next, 'step', 'reason', 'budget'), { step: 'blocked', reason: 'needs-human', budget: 'autoRecoveryRounds' })
  assert.match(spent.next.detail, /autoRecoveryRounds \(2\) spent.*base-sync: conflict/)
  assert.equal(go(dir).recovery.spent, 2)
})

test('AC8 edge: budget 0 parks at once, with the reason', () => {
  const out = recover({ dir: runDir(), kind: 'ci-rerun', detail: 'ci failed', policy: { autoRecoveryRounds: 0 } })
  assert.equal(out.allowed, false)
  assert.match(out.next.detail, /autoRecoveryRounds \(0\) spent/)
})

test('AC8: maxFixRounds spent names needs-human and the budget', () => {
  const dir = runDir()
  for (let n = 1; n <= 3; n++) {
    put(dir, `r${n}-g1`, 'red-spec', { status: 'red', mode: 'remediation', contractPath: '/abs/c.json', contractHash: 'sha256:' + 'a'.repeat(64) })
    put(dir, `r${n}-g1`, 'red-verify', { verified: true, sealed: true, snapshot: SHA('b') })
    put(dir, `r${n}-g1`, 'green-fix', { fixed: true, outputHead: SHA('c') })
    put(dir, `r${n}`, 'review-phase', { pr: 7, reviewedHead: SHA('c'), verdict: 'changes-requested', findings: [{ id: `r${n}-1`, severity: 'Major', blocking: true, transition: 'open', kind: 'defect', location: 'a', description: 'd', recommendation: 'r' }], custody: { contractBreach: false }, readiness: { ready: false } })
  }
  const r = go(dir)
  assert.deepEqual(pick(r.next, 'step', 'budget'), { step: 'blocked', budget: 'maxFixRounds' })
  assert.match(r.next.needsHuman, /maxFixRounds \(3\) spent/)
})

// ── T-4: merge gate falls to the fix stage (AC2) ─────────────────────────────────────────────

test('AC2: a gate still red after the budget sends the approved card to the fix stage with the failing gates as findings', () => {
  const dir = runDir()
  approved(dir)
  assert.equal(go(dir).next.step, 'done')
  recordGateRed({ dir, reviewedHead: SHA('c'), gates: [{ name: 'lint', ok: false, lastLines: 'error  no-unused-vars' }, { name: 'test', ok: true }] })
  const r = go(dir)
  assert.deepEqual(pick(r.next, 'step', 'mode', 'phase', 'base'), { step: 'prepare', mode: 'remediation', phase: 'r1-g1', base: SHA('c') })
  assert.deepEqual(r.next.findings.map(f => [f.id, f.blocking, f.location]), [['gate-lint', true, 'gate:lint']])
  assert.match(r.next.findings[0].description, /no-unused-vars/)
})

test('AC2 control: gate findings recorded for another head are ignored', () => {
  const dir = runDir()
  approved(dir)
  recordGateRed({ dir, reviewedHead: SHA('e'), gates: [{ name: 'lint', ok: false, lastLines: 'x' }] })
  assert.equal(go(dir).next.step, 'done')
})

test('CLI: recover / gate-red / resolve --baseHead are wired', () => {
  const dir = runDir()
  failedImplement(dir)
  const run = (...a) => JSON.parse(spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' }).stdout)
  run('resolve', '--dir', dir, '--workflowVersion', V, '--entry', 'fresh', '--policy', JSON.stringify(POLICY), '--head', SHA('d'), '--baseHead', SHA('1'))
  assert.equal(run('resolve', '--dir', dir, '--workflowVersion', V, '--entry', 'fresh', '--policy', JSON.stringify(POLICY), '--head', SHA('d'), '--baseHead', SHA('2')).next.step, 'implement')
  assert.equal(run('recover', '--dir', dir, '--kind', 'gate-retry', '--detail', 'x', '--policy', '{"autoRecoveryRounds":1}').allowed, true)
  assert.equal(run('recover', '--dir', dir, '--kind', 'gate-retry', '--detail', 'x', '--policy', '{"autoRecoveryRounds":1}').allowed, false)
  assert.equal(run('gate-red', '--dir', dir, '--reviewedHead', SHA('c'), '--gates', '[{"name":"lint","ok":false,"lastLines":"x"}]').recorded, true)
})

// ── T-6: mechanical base sync (AC5) ───────────────────────────────────────────────────────────

const git = (cwd, ...a) => {
  const r = spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const write = (cwd, path, text) => {
  mkdirSync(join(cwd, path, '..'), { recursive: true })
  writeFileSync(join(cwd, path), text)
}
const commit = (cwd, msg, files) => {
  for (const [p, t] of Object.entries(files)) write(cwd, p, t)
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', msg)
  return git(cwd, 'rev-parse', 'HEAD')
}
// base `main` and story branch `story` sharing `shared.txt`, `.claude/mirror.md` and `t.test.mjs`.
const repo = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'basesync-'))
  git(cwd, 'init', '-q', '-b', 'main')
  commit(cwd, 'init', { 'shared.txt': 'one\n', '.claude/mirror.md': 'm\n', 'src/own.ts': 'a\n' })
  git(cwd, 'checkout', '-q', '-b', 'story')
  return cwd
}

test('AC5: a base that moved cleanly is merged with a Pair-Base-Sync trailer', () => {
  const cwd = repo()
  commit(cwd, '[#42] feat: own', { 'src/own.ts': 'b\n' })
  git(cwd, 'checkout', '-q', 'main')
  const base = commit(cwd, 'base', { 'other.txt': 'x\n' })
  git(cwd, 'checkout', '-q', 'story')
  const out = baseSync({ cwd, base: 'main', story: '42' })
  assert.deepEqual(pick(out, 'synced', 'conflicts'), { synced: true, conflicts: [] })
  assert.match(git(cwd, 'log', '-1', '--format=%B'), new RegExp(`Pair-Base-Sync: base=${base}`))
  assert.equal(git(cwd, 'merge-base', '--is-ancestor', base, 'HEAD'), '')
})

test('AC5: conflicts resolve mechanically — story-owned keeps ours, a generated mirror takes theirs', () => {
  const cwd = repo()
  commit(cwd, '[#42] feat: own', { 'shared.txt': 'story\n', '.claude/mirror.md': 'story mirror\n' })
  git(cwd, 'checkout', '-q', 'main')
  commit(cwd, 'base', { 'shared.txt': 'base\n', '.claude/mirror.md': 'base mirror\n' })
  git(cwd, 'checkout', '-q', 'story')
  const out = baseSync({ cwd, base: 'main', story: '42' })
  assert.equal(out.synced, true)
  assert.deepEqual(out.conflicts, [{ path: '.claude/mirror.md', side: 'theirs' }, { path: 'shared.txt', side: 'ours' }])
  assert.equal(readFileSync(join(cwd, 'shared.txt'), 'utf8'), 'story\n')
  assert.equal(readFileSync(join(cwd, '.claude/mirror.md'), 'utf8'), 'base mirror\n')
  assert.match(git(cwd, 'log', '-1', '--format=%B'), /Pair-Base-Sync: base=[0-9a-f]{40}; ours=shared\.txt; theirs=\.claude\/mirror\.md/)
})

test('AC5: a path outside the declared fixScope ownership is base-owned and takes theirs', () => {
  const cwd = repo()
  commit(cwd, '[#42] feat: own', { 'shared.txt': 'story\n', 'src/own.ts': 'story\n' })
  git(cwd, 'checkout', '-q', 'main')
  commit(cwd, 'base', { 'shared.txt': 'base\n', 'src/own.ts': 'base\n' })
  git(cwd, 'checkout', '-q', 'story')
  const out = baseSync({ cwd, base: 'main', story: '42', owned: ['src/'] })
  assert.deepEqual(out.conflicts, [{ path: 'shared.txt', side: 'theirs' }, { path: 'src/own.ts', side: 'ours' }])
})

test('AC5 edge: a conflict on a SEALED test is never auto-resolved — merge aborted, needs-human', () => {
  const cwd = repo()
  commit(cwd, 'seal\n\nPair-RED-Snapshot: pr=0; phase=a0; base=' + SHA('a') + '; manifest=.pair/red-snapshots/pr-0-a0.json', { 't.test.mjs': 'sealed\n' })
  git(cwd, 'checkout', '-q', 'main')
  commit(cwd, 'base', { 't.test.mjs': 'base\n' })
  git(cwd, 'checkout', '-q', 'story')
  const head = git(cwd, 'rev-parse', 'HEAD')
  const out = baseSync({ cwd, base: 'main', story: '42' })
  assert.deepEqual(pick(out, 'synced', 'needsHuman'), { synced: false, needsHuman: true })
  assert.deepEqual(out.sealedConflicts, ['t.test.mjs'])
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), head)
  assert.equal(git(cwd, 'status', '--porcelain'), '')
})

test('AC5: a branch already above the base is up to date — nothing done', () => {
  const cwd = repo()
  commit(cwd, '[#42] feat: own', { 'src/own.ts': 'b\n' })
  assert.deepEqual(pick(baseSync({ cwd, base: 'main', story: '42' }), 'synced', 'reason'), { synced: false, reason: 'up-to-date' })
})

// ── T-7: prerequisite state (AC6) ─────────────────────────────────────────────────────────────

const pm = cards => ({ pm: { readCard: (id, { fields } = {}) => {
  if (!(id in cards)) throw Object.assign(new Error('HTTP 502'), { kind: 'failed', detail: 'HTTP 502' })
  return fields ? cards[id] : { body: cards[id].body }
} } })

test('AC6: prerequisite state is read from the card, each one merged / open / parked; unreadable fails closed', () => {
  const host = pm({
    42: { body: '**Prerequisite Stories**: #572 (adapter), #573\n', state: 'OPEN', labels: [] },
    572: { state: 'CLOSED', labels: [] },
    573: { state: 'OPEN', labels: [{ name: 'needs-review' }] },
  })
  const out = prereqState({ story: '42', host })
  assert.deepEqual(out.prerequisites, [{ id: '572', state: 'merged' }, { id: '573', state: 'parked', reason: 'parked (needs-review)' }])
  assert.deepEqual(pick(out, 'blocked', 'blockedBy'), { blocked: true, blockedBy: { id: '573', reason: 'parked (needs-review)' } })
  const open = prereqState({ story: '42', host: pm({ 42: { body: '**Prerequisite Stories**: #9' }, 9: { state: 'OPEN', labels: [] } }) })
  assert.deepEqual(open.blockedBy, { id: '9', reason: 'not merged' })
  const closed = prereqState({ story: '42', host: pm({ 42: { body: '**Prerequisite Stories**: #9' } }) })
  assert.deepEqual(pick(closed, 'blocked'), { blocked: true })
  assert.match(closed.blockedBy.reason, /unreadable/)
  assert.deepEqual(pick(prereqState({ story: '42', host: pm({ 42: { body: '**Prerequisite Stories**: None' } }) }), 'blocked', 'prerequisites'), { blocked: false, prerequisites: [] })
})
