// Tests for the `merge` stage of the delivery cycle (US-490): `resolve` offering the stage only when
// `## Auto-Advance` admits the card's tier, and `cycle-merge.mjs` — the re-verified conjunction, the
// park path and the Story Closure sequence. No live host: fake adapters for the decision paths, a
// recorder `gh` stub for the CLI, real temporary git repositories for the branch/worktree cleanup.
// RUNS FROM `.claude/workflows` ONLY (the dataset copy's `../../skills/...` imports resolve nowhere).
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { publish, resolve, autoAdvancePolicyError, STEPS } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'
import { decideMerge, checkMerge, runMerge, closeStory, checkDodBoxes, parseArgs, readCurrentTier, readSignals, PARK_MARKER } from '../../skills/pair-workflow-cycle/scripts/cycle-merge.mjs'
import github from '../../skills/pair-workflow-cycle/scripts/host/github.mjs'
import azure from '../../skills/pair-workflow-cycle/scripts/host/azure-devops.mjs'

const CYCLE_MERGE = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-merge.mjs', import.meta.url))
const V = '3.0.0'
const SHA = c => c.repeat(40)
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
const GREEN = 'risk:green'
const RED = 'risk:red'
const OK = { headSha: SHA('a'), pairReview: 'success', explicitApproval: 'success' }
const base = { cardTier: GREEN, currentTier: GREEN, autoAdvanceTiers: [GREEN], reviewedHead: SHA('a'), signals: OK, gate: 'green', requireGate: true }

// ── AC1 / AC7: `resolve` offers `merge` only when Auto-Advance admits the tier ─────────────────
function doneRun() {
  const root = mkdtempSync(join(tmpdir(), 'merge-'))
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'), '## Assignment\n\n- `default-assignee`: `rucka` — the maintainer.\n')
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'tmp-r0.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'feature/US-42', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') }, mode: 'first' }))
  assert.equal(publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: V }).published, true)
  return dir
}
const resolveWith = (dir, extra = {}) => resolve({ dir, workflowVersion: V, entry: 'pr', pr: 7, ...extra })

test('AC1: a card at ready-for-merge whose tier is in Auto-Advance is offered the merge stage by resolve itself', () => {
  const dir = doneRun()
  const r = resolveWith(dir, { policy: { ...POLICY, autoAdvance: { tiers: [GREEN] } }, tier: GREEN })
  assert.equal(r.next.step, 'merge')
  assert.deepEqual({ reviewedHead: r.next.reviewedHead, tier: r.next.tier, pr: r.next.pr }, { reviewedHead: SHA('c'), tier: GREEN, pr: 7 })
  assert.equal(r.status, 'in-progress')
})

test('AC1: a tier NOT named in Auto-Advance gets the unchanged ready-for-merge terminal', () => {
  const dir = doneRun()
  for (const tier of [RED, 'risk:yellow', undefined]) {
    const r = resolveWith(dir, { policy: { ...POLICY, autoAdvance: { tiers: [GREEN] } }, tier })
    assert.equal(r.next.step, 'done', String(tier))
    assert.equal(r.status, 'completed')
  }
})

test('AC7: no Auto-Advance declaration — or an empty one — never yields merge, for any tier', () => {
  const dir = doneRun()
  for (const policy of [POLICY, { ...POLICY, autoAdvance: { tiers: [] } }])
    for (const tier of [GREEN, RED, 'risk:yellow']) assert.equal(resolveWith(dir, { policy, tier }).next.step, 'done')
})

test('a malformed Auto-Advance policy is refused, never read as off', () => {
  const dir = doneRun()
  for (const autoAdvance of [{}, { tiers: 'risk:green' }, { tiers: [GREEN, 'a b'] }, { tiers: [3] }, null, 'risk:green']) {
    assert.equal(autoAdvancePolicyError(autoAdvance), 'policy-auto-advance-invalid', JSON.stringify(autoAdvance))
    assert.equal(resolveWith(dir, { policy: { ...POLICY, autoAdvance }, tier: GREEN }).status, 'invalid')
  }
  assert.equal(autoAdvancePolicyError(undefined), null)
})

test('merge is not a stage that resolve offers before ready-for-merge: an unfinished cycle keeps its own step', () => {
  const root = mkdtempSync(join(tmpdir(), 'merge-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  const r = resolve({ dir, workflowVersion: V, policy: { ...POLICY, autoAdvance: { tiers: [GREEN] } }, entry: 'fresh', tier: GREEN })
  assert.equal(r.next.step, 'implement')
  assert.ok(STEPS.includes('merge'))
})

test('the resolve CLI takes --tier, and the merge step reaches a shell caller', () => {
  const dir = doneRun()
  const cli = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-state.mjs', import.meta.url))
  const run = tier => JSON.parse(spawnSync(process.execPath, [cli, 'resolve', '--dir', dir, '--workflowVersion', V, '--entry', 'pr', '--pr', '7', '--policy', JSON.stringify({ ...POLICY, autoAdvance: { tiers: [GREEN] } }), ...(tier ? ['--tier', tier] : [])], { encoding: 'utf8' }).stdout)
  assert.equal(run(GREEN).next.step, 'merge')
  assert.equal(run(RED).next.step, 'done')
  assert.equal(run().next.step, 'done')
})

// ── AC2: the conjunction, each condition failing individually ───────────────────────────────────
test('AC2: all six conditions true -> mergeAllowed', () => {
  const d = decideMerge(base)
  assert.deepEqual({ ok: d.mergeAllowed, failed: d.failed, reason: d.reason, parkKind: d.parkKind }, { ok: true, failed: [], reason: null, parkKind: null })
})

const single = [
  ['tier raised mid-run', { currentTier: RED, autoAdvanceTiers: [GREEN, RED] }, 'tier-changed', 'halted'],
  ['tier no longer in Auto-Advance', { autoAdvanceTiers: [] }, 'tier-not-auto-advance', 'awaiting-human'],
  ['signals unreadable (null)', { signals: null }, 'signals-unreadable', 'halted'],
  ['signals unreadable (no 40-hex head)', { signals: { ...OK, headSha: 'abc' } }, 'signals-unreadable', 'halted'],
  ['signals unreadable (non-string conclusion)', { signals: { ...OK, pairReview: undefined } }, 'signals-unreadable', 'halted'],
  ['head moved since the review', { signals: { ...OK, headSha: SHA('b') } }, 'head-moved', 'halted'],
  ['pair-review failure', { signals: { ...OK, pairReview: 'failure' } }, 'pair-review', 'halted'],
  ['pair-review pending', { signals: { ...OK, pairReview: 'pending' } }, 'pair-review', 'halted'],
  ['pair-review empty', { signals: { ...OK, pairReview: '' } }, 'pair-review', 'halted'],
  ['explicit approval not success (D10)', { signals: { ...OK, explicitApproval: 'failure' } }, 'explicit-approval', 'halted'],
  ['gate red', { gate: 'red' }, 'gate-red', 'halted'],
  ['gate evidence absent', { gate: undefined }, 'gate-unverified', 'halted'],
  ['gate evidence malformed', { gate: 'yes' }, 'gate-unverified', 'halted'],
]
for (const [name, patch, code, parkKind] of single)
  test(`AC2: ${name} -> not allowed, naming ${code}`, () => {
    const d = decideMerge({ ...base, ...patch })
    assert.equal(d.mergeAllowed, false)
    assert.deepEqual(d.failed.map(f => f.code), [code])
    assert.equal(d.parkKind, parkKind)
    assert.ok(d.reason && d.reason === d.failed[0].detail)
  })

// D3 (autonomous run 493): a MISSING/pending human approval is a park that AWAITS A PERSON (exit 0, no on-halt),
// not a problem; a rejected one (`failure`) or any other failing condition beside it stays `halted`.
for (const conclusion of ['missing', 'pending'])
  test(`D3: explicit approval ${conclusion} (only failure) -> awaiting-human`, () => {
    const d = decideMerge({ ...base, signals: { ...OK, explicitApproval: conclusion } })
    assert.equal(d.mergeAllowed, false)
    assert.deepEqual(d.failed.map(f => f.code), ['explicit-approval'])
    assert.equal(d.parkKind, 'awaiting-human')
  })

test('D3: explicit approval missing BESIDE another failure (head moved) -> halted', () => {
  const d = decideMerge({ ...base, signals: { ...OK, headSha: SHA('b'), explicitApproval: 'missing' } })
  assert.equal(d.parkKind, 'halted')
})

test('AC2: an explicit approval on a different head than the remote head is not a success for THIS head', () => {
  // the adapter reads the conclusion ON the remote head: a stale approval reads as `missing`.
  const d = decideMerge({ ...base, signals: { ...OK, explicitApproval: 'missing' } })
  assert.deepEqual(d.failed.map(f => f.code), ['explicit-approval'])
})

test('AC2: precedence is the one pair-loop applied — tier first, then signals, head, conclusions, gate', () => {
  const d = decideMerge({ ...base, currentTier: RED, signals: { headSha: SHA('b'), pairReview: 'failure', explicitApproval: 'failure' }, gate: 'red' })
  assert.deepEqual(d.failed.map(f => f.code), ['tier-changed', 'tier-not-auto-advance', 'head-moved', 'pair-review', 'explicit-approval', 'gate-red'])
  assert.match(d.reason, /^tier changed risk:green -> risk:red mid-run/)
})

test('check mode does not require the gate; run mode does', () => {
  assert.equal(decideMerge({ ...base, gate: undefined, requireGate: false }).mergeAllowed, true)
  assert.equal(decideMerge({ ...base, gate: undefined, requireGate: true }).mergeAllowed, false)
})

// ── live reads through the adapters ─────────────────────────────────────────────────────────────
const fakeHosts = (o = {}) => {
  const calls = []
  const rec = (name, fn) => (...a) => {
    calls.push([name, ...a])
    return fn(...a)
  }
  const pm = {
    readCard: rec('readCard', (id, opts) => (opts?.fields ? { labels: o.labels ?? [{ name: GREEN }] } : { body: o.body ?? '## Definition of Done Checklist\n\n- [ ] one\n- [x] two\n\n## Notes\n\n- [ ] keep\n' })),
    updateCard: rec('updateCard', () => ({})),
    closeAndCascade: rec('closeAndCascade', () => o.close ?? { closed: [42], stoppedAt: null }),
    setBoardState: rec('setBoardState', ({ id }) => o.board?.(id) ?? { applied: 'Done', confirmed: true, error: null }),
    commentOnCard: rec('commentOnCard', () => o.comment ?? { action: 'created', id: 1 }),
  }
  const code = {
    prHead: rec('prHead', () => o.head ?? SHA('a')),
    readCheck: rec('readCheck', ({ context }) => (o.checks ?? { 'pair-review': 'success', 'pair-explicit-approval': 'success' })[context] ?? null),
    readCheckRun: rec('readCheckRun', ({ context }) => (o.runs ?? {})[context] ?? null),
    merge: rec('merge', args => {
      if (o.mergeThrows) throw new Error(o.mergeThrows)
      return { merged: true, ...args }
    }),
  }
  return { calls, hosts: { pm, code } }
}
const input = h => ({ hosts: h.hosts, story: 42, pr: 7, repo: 'o/r', reviewedHead: SHA('a'), cardTier: GREEN, autoAdvanceTiers: [GREEN] })

test('readCurrentTier: one risk label is the tier; untagged, ambiguous or unreadable is red', () => {
  const pm = labels => fakeHosts({ labels }).hosts.pm
  assert.equal(readCurrentTier({ pm: pm([{ name: 'bug' }, { name: GREEN }]), story: 42 }), GREEN)
  assert.equal(readCurrentTier({ pm: pm([{ name: 'bug' }]), story: 42 }), RED)
  assert.equal(readCurrentTier({ pm: pm([{ name: GREEN }, { name: 'risk:yellow' }]), story: 42 }), RED)
  assert.equal(readCurrentTier({ pm: { readCard: () => { throw new Error('boom') } }, story: 42 }), RED)
})

// Paired-canary finding: the tier grammar is the removed `pair-loop.js` `isLabelShape`
// (`/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/i`), which normalised any other shape to red. A label that
// only the looser `TIER_RE` accepts must read as unreadable -> `risk:red`, never verbatim (verbatim
// turned a risk:red card's re-read into `tier-changed` and parked a merge the old rule made).
test('readCurrentTier: a risk label outside the family:tier grammar is unreadable and fails safe to red', async t => {
  const pm = labels => fakeHosts({ labels }).hosts.pm
  for (const shape of ['risk:a.b', 'risk:a/b', 'risk:a_b', 'risk:a:b', 'risk:1x', 'risk:'])
    await t.test(`witness ${shape}`, () => assert.equal(readCurrentTier({ pm: pm([{ name: 'bug' }, { name: shape }]), story: 42 }), RED))
  for (const tier of [GREEN, 'risk:yellow', RED])
    await t.test(`control ${tier}`, () => assert.equal(readCurrentTier({ pm: pm([{ name: tier }]), story: 42 }), tier))
})

test('readSignals: conclusions come from the remote head; a check run is the fallback; anything unreadable is null', () => {
  const h = fakeHosts({ checks: { 'pair-review': 'success' }, runs: { 'pair-explicit-approval': 'success' } })
  assert.deepEqual(readSignals({ code: h.hosts.code, pr: 7 }), OK)
  const none = fakeHosts({ checks: {}, runs: {} })
  assert.deepEqual(readSignals({ code: none.hosts.code, pr: 7 }), { headSha: SHA('a'), pairReview: 'missing', explicitApproval: 'missing' })
  assert.equal(readSignals({ code: { prHead: () => { throw new Error('offline') } }, pr: 7 }), null)
})

// ── AC4: park — never a HALT, never a silent no-op ─────────────────────────────────────────────
test('AC4: check parks with ONE marker-keyed comment on the card naming the failed condition', () => {
  const h = fakeHosts({ checks: { 'pair-review': 'failure', 'pair-explicit-approval': 'success' } })
  const out = checkMerge(input(h))
  assert.equal(out.mergeAllowed, false)
  assert.deepEqual(out.failed.map(f => f.code), ['pair-review'])
  assert.deepEqual(out.comment, { posted: true })
  const post = h.calls.find(c => c[0] === 'commentOnCard')[1]
  assert.equal(post.id, 42)
  assert.equal(post.marker, PARK_MARKER(7))
  assert.match(post.body, /not\*\* merged automatically/)
  assert.match(post.body, /`pair-review` — pair-review conclusion on head a{40} is failure/)
  assert.equal(h.calls.some(c => c[0] === 'merge'), false)
})

test('AC4: a comment that cannot be posted is reported, not swallowed', () => {
  const h = fakeHosts({ headSha: SHA('b'), head: SHA('b') })
  h.hosts.pm.commentOnCard = () => { throw new Error('rate limited') }
  const out = checkMerge(input(h))
  assert.equal(out.mergeAllowed, false)
  assert.deepEqual(out.comment, { posted: false, error: 'rate limited' })
})

test('AC4: every single failing condition parks with a comment naming it (run mode)', () => {
  const cases = [
    [{ labels: [{ name: RED }] }, 'tier-changed'],
    [{ head: SHA('b') }, 'head-moved'],
    [{ checks: { 'pair-review': 'pending', 'pair-explicit-approval': 'success' } }, 'pair-review'],
    [{ checks: { 'pair-review': 'success' } }, 'explicit-approval'],
  ]
  for (const [o, code] of cases) {
    const h = fakeHosts(o)
    const out = runMerge({ ...input(h), gate: 'green', message: 'm' })
    assert.equal(out.merged, false, code)
    assert.equal(out.failed[0].code, code)
    assert.equal(h.calls.some(c => c[0] === 'merge'), false, `${code}: merged`)
    assert.match(h.calls.find(c => c[0] === 'commentOnCard')[1].body, new RegExp(`\`${code}\``))
  }
  const red = fakeHosts()
  assert.equal(runMerge({ ...input(red), gate: 'red', message: 'm' }).failed[0].code, 'gate-red')
  assert.equal(red.calls.some(c => c[0] === 'merge'), false)
})

test('AC4: a code host that refuses the merge parks with merge-failed, and nothing after the merge runs', () => {
  const h = fakeHosts({ mergeThrows: 'required check missing' })
  const out = runMerge({ ...input(h), gate: 'green', message: 'm' })
  assert.deepEqual({ merged: out.merged, cascaded: out.cascaded, code: out.failed[0].code }, { merged: false, cascaded: false, code: 'merge-failed' })
  assert.equal(h.calls.some(c => c[0] === 'closeAndCascade'), false)
  assert.ok(h.calls.some(c => c[0] === 'commentOnCard'))
})

// ── AC3: merge, then the Story Closure sequence ─────────────────────────────────────────────────
function gitFixture() {
  const root = mkdtempSync(join(tmpdir(), 'merge-git-'))
  const sh = (cwd, ...a) => {
    const r = spawnSync('git', a, { cwd, encoding: 'utf8' })
    assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`)
    return r.stdout
  }
  const remote = join(root, 'remote.git')
  const main = join(root, 'main')
  mkdirSync(main)
  sh(root, 'init', '--bare', '-q', remote)
  sh(main, 'init', '-q', '-b', 'main')
  sh(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
  sh(main, 'remote', 'add', 'origin', remote)
  sh(main, 'push', '-q', 'origin', 'main')
  sh(main, 'branch', 'feature/US-42-x')
  sh(main, 'push', '-q', 'origin', 'feature/US-42-x')
  const wt = join(root, 'wt')
  sh(main, 'worktree', 'add', '-q', wt, 'feature/US-42-x')
  mkdirSync(join(main, '.pair', 'working', 'checkpoints'), { recursive: true })
  writeFileSync(join(main, '.pair', 'working', 'checkpoints', '42.md'), 'cp')
  return { main, wt, remote, sh }
}

test('AC3: all green -> squash merge with the message, DoD boxes, close+cascade, board Done, branch (worktree first), checkpoint — in order', () => {
  const g = gitFixture()
  const h = fakeHosts({ close: { closed: [42, 9], stoppedAt: 3 } })
  const out = runMerge({ ...input(h), gate: 'green', message: '[#42] feat: thing\n\nbody', branch: 'feature/US-42-x', root: g.main })
  assert.deepEqual({ merged: out.merged, cascaded: out.cascaded, mergeAllowed: out.mergeAllowed }, { merged: true, cascaded: true, mergeAllowed: true }, JSON.stringify(out))
  assert.deepEqual(h.calls.map(c => c[0]).filter(n => n !== 'readCard' && n !== 'prHead' && n !== 'readCheck' && n !== 'readCheckRun'), ['merge', 'updateCard', 'closeAndCascade', 'setBoardState', 'setBoardState'])
  assert.deepEqual(h.calls.find(c => c[0] === 'merge')[1], { pr: 7, repo: 'o/r', strategy: 'squash', message: '[#42] feat: thing\n\nbody', headSha: SHA('a') })
  assert.deepEqual(h.calls.filter(c => c[0] === 'setBoardState').map(c => c[1].id), [42, 9]) // the story AND every closed parent
  assert.equal(h.calls.some(c => c[0] === 'commentOnCard'), false)
  assert.equal(existsSync(g.wt), false, 'worktree removed')
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/feature/US-42-x'], { cwd: g.main }).status, 1, 'local branch deleted')
  assert.equal(spawnSync('git', ['ls-remote', '--exit-code', '--heads', g.remote, 'feature/US-42-x']).status, 2, 'remote branch deleted')
  assert.equal(existsSync(join(g.main, '.pair', 'working', 'checkpoints', '42.md')), false, 'checkpoint removed')
})

test('AC3: checkDodBoxes ticks only the Definition of Done section', () => {
  const out = checkDodBoxes('## Tasks\n\n- [ ] a\n\n## Definition of Done Checklist\n\n### Dev\n\n- [ ] one\n  - [ ] nested\n- [x] two\n\n## Notes\n\n- [ ] keep\n')
  assert.equal(out, '## Tasks\n\n- [ ] a\n\n## Definition of Done Checklist\n\n### Dev\n\n- [x] one\n  - [x] nested\n- [x] two\n\n## Notes\n\n- [ ] keep\n')
  assert.equal(checkDodBoxes('no sections'), 'no sections')
})

test('AC3 edge: a branch already gone is not a failure; every other step still completes', () => {
  const g = gitFixture()
  g.sh(g.main, 'worktree', 'remove', g.wt)
  g.sh(g.main, 'push', '-q', 'origin', '--delete', 'feature/US-42-x')
  g.sh(g.main, 'branch', '-D', 'feature/US-42-x')
  const out = closeStory({ hosts: fakeHosts().hosts, story: 42, repo: 'o/r', branch: 'feature/US-42-x', root: g.main })
  assert.equal(out.cascaded, true, JSON.stringify(out))
  assert.deepEqual(out.steps.branch.notes, ['remote branch already gone', 'local branch already gone'])
})

test('AC3 edge: a merge that landed with a closure step unfinished is { merged: true, cascaded: false } and PARKED naming the step', () => {
  const g = gitFixture()
  const h = fakeHosts({ board: () => ({ applied: 'Done', confirmed: false, error: 'not a project item' }) })
  writeFileSync(join(g.wt, 'dirty.txt'), 'x') // an untracked file: `git worktree remove` refuses, and is never forced
  const out = runMerge({ ...input(h), gate: 'green', message: 'm', branch: 'feature/US-42-x', root: g.main })
  assert.equal(out.merged, true)
  assert.equal(out.cascaded, false)
  assert.match(out.reason, /board \(#42: not a project item\)/)
  assert.match(out.reason, /branch \(worktree .* not removed/)
  assert.equal(out.cascade.checkpoint.removed, true, 'later steps still ran')
  assert.equal(existsSync(g.wt), true, 'a dirty worktree is never forced away')
  const post = h.calls.find(c => c[0] === 'commentOnCard')[1]
  assert.match(post.body, /MERGED, but the story is not fully closed/)
  assert.match(post.body, /cascade-incomplete/)
})

test('AC3 edge: an unsafe or absent branch is reported, never handed to git', () => {
  const g = gitFixture()
  for (const branch of ['-D main', 'a b', '--upload-pack=x'])
    assert.equal(closeStory({ hosts: fakeHosts().hosts, story: 42, repo: 'o/r', branch, root: g.main }).steps.branch.ok, false, branch)
  assert.equal(closeStory({ hosts: fakeHosts().hosts, story: 42, repo: 'o/r', root: g.main }).steps.branch.ok, false)
})

// ── CLI contract ────────────────────────────────────────────────────────────────────────────────
const argv = (cmd, extra = {}) => {
  const o = { dir: '/x', story: '42', pr: '7', reviewedHead: SHA('a'), cardTier: GREEN, autoAdvance: '["risk:green"]', ...extra }
  return [cmd, ...Object.entries(o).filter(([, v]) => v !== undefined).flatMap(([k, v]) => [`--${k}`, v])]
}

test('parseArgs: every value that reaches gh/git is validated as a safe segment', () => {
  assert.equal(parseArgs(argv('check')).opts.story, 42)
  const bad = [
    ['check', { story: '42; rm -rf /' }, /--story/],
    ['check', { pr: 'x' }, /--pr/],
    ['check', { reviewedHead: 'abc' }, /40-hex/],
    ['check', { cardTier: 'risk:green $(x)' }, /--cardTier/],
    ['check', { autoAdvance: 'risk:green' }, /JSON array/],
    ['check', { autoAdvance: '["a b"]' }, /label-shaped/],
    ['check', { repo: 'o/r; x' }, /owner\/name/],
    ['check', { nope: '1' }, /unknown flag/],
    ['run', {}, /--gate is required/],
    ['run', { gate: 'green' }, /--message is required/],
    ['run', { gate: 'maybe', message: 'm' }, /green \| red/],
  ]
  for (const [cmd, extra, re] of bad) assert.throws(() => parseArgs(argv(cmd, extra)), re, JSON.stringify(extra))
  assert.throws(() => parseArgs(['merge']), /unknown command/)
})

// A recorder `gh`: answers exactly the calls the merge stage makes, logs every argv.
function fakeGh(seed = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gh-fake-'))
  const log = join(dir, 'calls.log')
  const merged = join(dir, 'merged.log')
  writeFileSync(log, '')
  writeFileSync(merged, '')
  const cfg = { labels: [GREEN], head: SHA('a'), statuses: [{ context: 'pair-review', state: 'success' }, { context: 'pair-explicit-approval', state: 'success' }], ...seed }
  writeFileSync(
    join(dir, 'gh'),
    `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n')
const cfg = ${JSON.stringify(cfg)}
const j = a.join(' ')
const out = v => { process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v)); process.exit(0) }
if (a[0] === 'issue' && a[1] === 'view' && j.includes('--json labels')) out({ labels: cfg.labels.map(name => ({ name })) })
if (a[0] === 'issue' && a[1] === 'view') out('## Definition of Done Checklist\\n\\n- [ ] x\\n')
if (a[0] === 'pr' && a[1] === 'view') out(cfg.head + '\\n')
if (a[0] === 'api' && /commits\\/[0-9a-f]{40}\\/status$/.test(a[1])) out({ statuses: cfg.statuses })
if (a[0] === 'api' && a[1].includes('check-runs')) out({ check_runs: [] })
if (a[0] === 'api' && a.includes('--paginate')) out('[]')
if (a[0] === 'api' && a.includes('POST') && a[a.indexOf('POST') - 1] === '-X' && /comments$/.test(a[a.indexOf('POST') + 1])) out({ id: 900, html_url: 'https://github.com/o/r/issues/42#issuecomment-900' })
if (a[0] === 'api' && /\\/parent$/.test(a[1])) { process.stderr.write('gh: Not Found (HTTP 404)'); process.exit(1) }
if (a[0] === 'api' && a[1] === 'graphql' && j.includes('projectItems')) out({ data: { repository: { issue: { projectItems: { nodes: [{ id: 'PVTI_1', project: { id: 'PVT_1', title: 'Board', fields: { nodes: [{ id: 'PVTSSF_1', name: 'Status', options: [{ id: 'opt-done', name: 'Done' }] }] } } }] } } } } })
if (a[0] === 'api' && a[1] === 'graphql') out({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_1', fieldValueByName: { name: 'Done' } } } } })
// gh pr merge semantics: --match-head-commit <sha> is refused when the remote head is not <sha>;
// without it the CURRENT remote head (mergeHead: a push that landed after pr view) is merged.
if (a[0] === 'pr' && a[1] === 'merge') {
  const now = cfg.mergeHead ?? cfg.head
  const i = a.indexOf('--match-head-commit')
  if (i !== -1 && a[i + 1] !== now) { process.stderr.write('GraphQL: Head branch was modified. Review and try the merge again. (mergePullRequest)'); process.exit(1) }
  fs.appendFileSync(${JSON.stringify(merged)}, now + '\\n')
  out('')
}
if (a[0] === 'issue' && (a[1] === 'close' || a[1] === 'edit')) out('')
process.stderr.write('fake gh: unhandled ' + j); process.exit(1)
`,
  )
  chmodSync(join(dir, 'gh'), 0o755)
  return { bin: join(dir, 'gh'), calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)), merged: () => readFileSync(merged, 'utf8').split('\n').filter(Boolean) }
}

function runCli(cmd, gh, extra = {}) {
  const g = gitFixture()
  const args = argv(cmd, { dir: join(g.main, '.pair', 'working', 'runs', 'story-42', '42'), repo: 'o/r', ...extra })
  const r = spawnSync(process.execPath, [CYCLE_MERGE, ...args], { encoding: 'utf8', cwd: g.main, env: { ...process.env, PAIR_GH_BIN: gh.bin } })
  return { out: JSON.parse(r.stdout), status: r.status, g }
}

test('CLI check: all-green signals through the real GitHub adapter -> mergeAllowed, exit 0, nothing written', () => {
  const gh = fakeGh()
  const { out, status } = runCli('check', gh)
  assert.equal(status, 0)
  assert.deepEqual({ mergeAllowed: out.mergeAllowed, failed: out.failed }, { mergeAllowed: true, failed: [] }, JSON.stringify(out))
  assert.equal(gh.calls().some(c => c[0] === 'pr' && c[1] === 'merge'), false)
})

test('CLI check: a moved head parks with a POSTed comment on the CARD (issues/42), not the PR', () => {
  const gh = fakeGh({ head: SHA('b') })
  const { out } = runCli('check', gh)
  assert.equal(out.mergeAllowed, false)
  assert.equal(out.failed[0].code, 'head-moved')
  assert.equal(out.comment.posted, true)
  const post = gh.calls().find(c => c.includes('POST'))
  assert.ok(post.some(x => x.endsWith('/issues/42/comments')), JSON.stringify(post))
})

test('CLI run: all green -> gh pr merge --squash with the subject, the card closed, the board written', () => {
  const gh = fakeGh()
  const { out, status, g } = runCli('run', gh, { gate: 'green', message: '[#42] feat: thing', branch: 'feature/US-42-x' })
  assert.equal(status, 0)
  assert.equal(out.merged, true, JSON.stringify(out))
  const calls = gh.calls()
  assert.ok(calls.some(c => c[0] === 'pr' && c[1] === 'merge' && c.includes('--squash') && c.includes('[#42] feat: thing')))
  assert.ok(calls.some(c => c[0] === 'issue' && c[1] === 'close'))
  assert.ok(calls.some(c => c[0] === 'api' && c[1] === 'graphql' && c.some(x => x === 'option=opt-done')))
  assert.equal(out.cascade.board.per[0].confirmed, true)
  assert.equal(out.cascaded, true, JSON.stringify(out.cascade)) // root defaults to the cwd: the main checkout
  assert.equal(existsSync(g.wt), false)
})

test('CLI run: a red gate never reaches gh pr merge', () => {
  const gh = fakeGh()
  const { out } = runCli('run', gh, { gate: 'red', message: 'm' })
  assert.equal(out.merged, false)
  assert.equal(out.failed[0].code, 'gate-red')
  assert.equal(gh.calls().some(c => c[0] === 'pr' && c[1] === 'merge'), false)
})

test('CLI: a usage error is exit 2 with a JSON error, before any host call', () => {
  const gh = fakeGh()
  const r = spawnSync(process.execPath, [CYCLE_MERGE, ...argv('check', { story: 'x' })], { encoding: 'utf8', env: { ...process.env, PAIR_GH_BIN: gh.bin } })
  assert.equal(r.status, 2)
  assert.match(JSON.parse(r.stdout).error, /--story/)
  assert.equal(gh.calls().length, 0)
})

// ── the two new PM-side adapter methods ────────────────────────────────────────────────────────
test('github.setBoardState: variables never interpolated; read back from the mutation payload; every refusal typed in the result', () => {
  const gh = fakeGh()
  const a = github.instantiate({ ghBin: gh.bin })
  const ok = a.setBoardState({ id: 42, state: 'Done', repo: 'o/r' })
  assert.deepEqual(ok, { applied: 'Done', confirmed: true, error: null })
  const mutation = gh.calls().find(c => c.some(x => x.startsWith('query=mutation')))
  assert.ok(mutation.includes('option=opt-done') && mutation.includes('item=PVTI_1') && mutation.includes('project=PVT_1') && mutation.includes('field=PVTSSF_1'))
  const missing = a.setBoardState({ id: 42, state: 'Nope', repo: 'o/r' })
  assert.equal(missing.confirmed, false)
  assert.match(missing.error, /no Status option "Nope"/)
})

test('github.commentOnCard: a marker-keyed create on the card thread; a re-run edits in place', () => {
  const gh = fakeGh()
  const a = github.instantiate({ ghBin: gh.bin })
  const r = a.commentOnCard({ id: 42, marker: '<!-- m -->', body: 'hello', repo: 'o/r' })
  assert.equal(r.action, 'created')
  assert.ok(gh.calls().some(c => c.includes('POST') && c.some(x => x === 'repos/o/r/issues/42/comments')))
})

test('github.readCheckRun: the most recent run of the name; in-flight is pending; absent is null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gh-runs-'))
  const bin = join(dir, 'gh')
  writeFileSync(bin, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ check_runs: [{ name: 'pair-explicit-approval', status: 'completed', conclusion: 'failure', started_at: '2026-01-01' }, { name: 'pair-explicit-approval', status: 'completed', conclusion: 'success', started_at: '2026-01-02' }, { name: 'other', status: 'completed', conclusion: 'failure', started_at: '2026-01-03' }] }))\n`)
  chmodSync(bin, 0o755)
  const a = github.instantiate({ ghBin: bin })
  assert.equal(a.readCheckRun({ sha: SHA('a'), repo: 'o/r', context: 'pair-explicit-approval' }), 'success')
  assert.equal(a.readCheckRun({ sha: SHA('a'), repo: 'o/r', context: 'missing' }), null)
})

// ── r0-1: the merge is PINNED to the reviewed head (gh pr merge --match-head-commit) ────────────
const mergeCall = gh => gh.calls().find(c => c[0] === 'pr' && c[1] === 'merge')
const pinOf = c => (c && c.indexOf('--match-head-commit') !== -1 ? c[c.indexOf('--match-head-commit') + 1] : null)

test('r1-g1-w1: runMerge hands the adapter merge the reviewed head as headSha', () => {
  const h = fakeHosts()
  const out = runMerge({ ...input(h), gate: 'green', message: 'm' })
  assert.equal(out.merged, true, JSON.stringify(out))
  assert.equal(h.calls.find(c => c[0] === 'merge')[1].headSha, SHA('a'))
})

test('r1-g1-w2: github.merge with headSha pins the merge: --match-head-commit <headSha>', () => {
  const gh = fakeGh()
  const a = github.instantiate({ ghBin: gh.bin })
  assert.deepEqual(a.merge({ pr: 7, repo: 'o/r', strategy: 'squash', message: 'm', headSha: SHA('a') }), { merged: true, pr: 7, strategy: 'squash' })
  assert.equal(pinOf(mergeCall(gh)), SHA('a'), JSON.stringify(mergeCall(gh)))
})

test('r1-g1-w3: github.merge refuses a malformed headSha before any gh call', () => {
  const gh = fakeGh()
  const a = github.instantiate({ ghBin: gh.bin })
  for (const headSha of ['', 'abc', SHA('A'), `${SHA('a')} --admin`, 42]) assert.throws(() => a.merge({ pr: 7, repo: 'o/r', strategy: 'squash', message: 'm', headSha }), e => e?.name === 'HostError', JSON.stringify(headSha))
  assert.equal(gh.calls().length, 0)
})

test('r1-g1-c1: github.merge without headSha keeps the unpinned argv (the adapter interface stays backward compatible)', () => {
  const gh = fakeGh()
  const a = github.instantiate({ ghBin: gh.bin })
  a.merge({ pr: 7, repo: 'o/r', strategy: 'squash', message: 'm' })
  assert.deepEqual(mergeCall(gh), ['pr', 'merge', '7', '--squash', '--repo', 'o/r', '--subject', 'm'])
})

test('r1-g1-w4: CLI run all green -> the gh pr merge argv carries --match-head-commit equal to --reviewedHead', () => {
  const gh = fakeGh()
  const { out } = runCli('run', gh, { gate: 'green', message: 'm', branch: 'feature/US-42-x' })
  assert.equal(out.merged, true, JSON.stringify(out))
  assert.equal(pinOf(mergeCall(gh)), SHA('a'), JSON.stringify(mergeCall(gh)))
  assert.deepEqual(gh.merged(), [SHA('a')])
})

test('r1-g1-w5: CLI run — a push landing between the signals read and gh pr merge is refused by the host: merged:false, merge-failed, parked, nothing closed', () => {
  const gh = fakeGh({ head: SHA('a'), mergeHead: SHA('b') })
  const { out, status } = runCli('run', gh, { gate: 'green', message: 'm', branch: 'feature/US-42-x' })
  assert.equal(status, 0)
  assert.deepEqual(gh.merged(), [], 'the unreviewed head was never merged')
  assert.deepEqual({ merged: out.merged, cascaded: out.cascaded, code: out.failed?.[0]?.code, parkKind: out.parkKind }, { merged: false, cascaded: false, code: 'merge-failed', parkKind: 'halted' }, JSON.stringify(out))
  assert.equal(gh.calls().some(c => c[0] === 'issue' && c[1] === 'close'), false)
  assert.equal(out.comment?.posted, true)
})

test('r1-g1-c2: CLI run — a head already moved at the signals read parks head-moved and never reaches gh pr merge', () => {
  const gh = fakeGh({ head: SHA('a'), mergeHead: SHA('b') })
  const { out } = runCli('run', gh, { gate: 'green', message: 'm', reviewedHead: SHA('b') })
  assert.equal(out.merged, false)
  assert.equal(out.failed[0].code, 'head-moved')
  assert.equal(mergeCall(gh), undefined)
})

// An `az` recorder: one PR whose source head is `head`. Completion is recorded ONLY when it happens —
// through `repos pr update --status completed`, or a REST PATCH whose lastMergeSourceCommit (when
// given) matches the head (Azure DevOps refuses a stale one). `raceTo` models the r0-1 race window:
// every read (`repos pr show`, any non-PATCH `devops invoke`) keeps reporting the seeded head, while the
// real source head becomes `raceTo` at the first read or the first completion call, whichever comes first.
function fakeAzPr(seed = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'az-fake-'))
  const state = join(dir, 'state.json')
  writeFileSync(state, JSON.stringify({ head: seed.head ?? SHA('a'), readHead: seed.head ?? SHA('a'), raceTo: seed.raceTo ?? null, status: 'active', completedHead: null }))
  writeFileSync(
    join(dir, 'az'),
    `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
const S = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const save = () => fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(S))
const opt = k => a[a.indexOf(k) + 1]
const out = v => { process.stdout.write(JSON.stringify(v)); process.exit(0) }
const pr = () => ({ pullRequestId: 3, lastMergeSourceCommit: { commitId: S.raceTo === null ? S.head : S.readHead }, status: S.status, repository: { webUrl: 'https://dev.azure.com/acme/Proj/_git/app' } })
const race = () => { if (S.raceTo !== null && S.head !== S.raceTo) { S.head = S.raceTo; save() } }
if (a[0] === 'repos' && a[1] === 'pr' && a[2] === 'show') { const r = pr(); race(); out(r) }
if (a[0] === 'repos' && a[1] === 'pr' && a[2] === 'update') { if (opt('--status') === 'completed') { race(); S.status = 'completed'; S.completedHead = S.head; save() } out(pr()) }
if (a[0] === 'devops' && a[1] === 'invoke' && a.includes('PATCH') && a.includes('--in-file')) {
  race()
  const body = JSON.parse(fs.readFileSync(opt('--in-file'), 'utf8'))
  const pin = body && body.lastMergeSourceCommit && body.lastMergeSourceCommit.commitId
  if (pin && pin !== S.head) { process.stderr.write('TF401181: The pull request cannot be completed: the source branch was updated.'); process.exit(1) }
  if (body && body.status === 'completed') { S.status = 'completed'; S.completedHead = S.head; save() }
  out(pr())
}
if (a[0] === 'devops' && a[1] === 'invoke') { const r = pr(); race(); out(r) }
process.stderr.write('fake az: unhandled ' + a.join(' ')); process.exit(1)
`,
  )
  chmodSync(join(dir, 'az'), 0o755)
  return { bin: join(dir, 'az'), state: () => JSON.parse(readFileSync(state, 'utf8')) }
}

test('r1-g1-w6: azure-devops merge with a headSha that is not the PR source head never completes the PR', () => {
  const az = fakeAzPr({ head: SHA('b') })
  const a = azure.instantiate({ azBin: az.bin })
  assert.throws(() => a.merge({ pr: 3, repo: 'Proj/app', strategy: 'squash', message: 'm', headSha: SHA('a') }), e => e?.name === 'HostError')
  assert.deepEqual({ status: az.state().status, completedHead: az.state().completedHead }, { status: 'active', completedHead: null })
})

test('r1-g1-c3: azure-devops merge with the matching headSha completes the PR on that head', () => {
  const az = fakeAzPr({ head: SHA('a') })
  const a = azure.instantiate({ azBin: az.bin })
  assert.equal(a.merge({ pr: 3, repo: 'Proj/app', strategy: 'squash', message: 'm', headSha: SHA('a') }).merged, true)
  assert.deepEqual({ status: az.state().status, completedHead: az.state().completedHead }, { status: 'completed', completedHead: SHA('a') })
})

test('r1-g1-w6-race: azure-devops merge — head reads as the reviewed head, a push lands before completion: HostError, the PR stays active', () => {
  const az = fakeAzPr({ head: SHA('a'), raceTo: SHA('b') })
  const a = azure.instantiate({ azBin: az.bin })
  assert.throws(() => a.merge({ pr: 3, repo: 'Proj/app', strategy: 'squash', message: 'm', headSha: SHA('a') }), e => e?.name === 'HostError')
  assert.deepEqual({ status: az.state().status, completedHead: az.state().completedHead }, { status: 'active', completedHead: null })
})

// ── spaced label conditions + run-dir guard on `escalate` ───────────────────────────────────────────────────────
const SPACED_COND = 'has:good first issue'
test('parseArgs escalate: accepts every label the gate grammar accepts (spaces), still refuses quote / $( / backtick', () => {
  assert.deepEqual(parseArgs(['escalate', '--dir', '/x/42', '--story', '42', '--stage', 'merge', '--conditions', JSON.stringify([SPACED_COND])]).opts.conditions, [SPACED_COND])
  for (const bad of ["has:x'; rm -rf /", 'has:$(id)', 'has:`id`', 'has:a"b', 'has:a\\b', 'has:a;b']) assert.throws(() => parseArgs(['escalate', '--dir', '/x/42', '--story', '42', '--stage', 'merge', '--conditions', JSON.stringify([bad])]), /conditions/, bad)
})
test('CLI escalate: a spaced label condition posts the ONE comment through a stubbed gh', () => {
  const gh = fakeGh()
  const { out, status } = runCli('escalate', gh, { stage: 'merge', conditions: JSON.stringify([SPACED_COND]), pr: undefined, reviewedHead: undefined, cardTier: undefined, autoAdvance: undefined })
  assert.equal(status, 0, JSON.stringify(out))
  assert.equal(out.comment.posted, true)
  assert.ok(gh.calls().some(c => c.includes('POST') && c.some(x => String(x).endsWith('/issues/42/comments'))))
})
test('CLI escalate: a run dir that does not belong to --story is refused — exit non-zero, no gh call', () => {
  for (const dir of ['/x/43', '/x/anything']) {
    const gh = fakeGh()
    const { out, status } = runCli('escalate', gh, { dir, stage: 'merge', conditions: JSON.stringify(['has:cost:red']), pr: undefined, reviewedHead: undefined, cardTier: undefined, autoAdvance: undefined })
    assert.notEqual(status, 0)
    assert.match(out.error, /run dir/)
    assert.equal(gh.calls().length, 0)
  }
})
