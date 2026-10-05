// US-521 T-5: the cycle consumes the shared autonomy decision — `until`, the merge gate in `resolve` and
// `cycle-merge.mjs`, escalation per boundary, the `escalated` status and its idempotent card comment; and the
// default-off regression (no `policy.autonomy` => today's behaviour, legacy `--autoAdvance` call unchanged).
// RUNS FROM `.claude/workflows` ONLY (the dataset copy's `../../skills/...` imports resolve nowhere).
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publish, resolve, autonomyPolicyError, CYCLE_STATUSES, STEPS } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'
import { decideMerge, checkMerge, runMerge, escalate, parseArgs, readCurrentLabels, readEffectiveLabels } from '../../skills/pair-workflow-cycle/scripts/cycle-merge.mjs'
import { ESCALATION_MARKER, decide, effectiveLabels } from '../../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs'

const V = '3.0.0'
const SHA = c => c.repeat(40)
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
const GREEN = 'risk:green'
const OK = { headSha: SHA('a'), pairReview: 'success', explicitApproval: 'success' }
const gate = (mode, has = [], lacks = []) => ({ mode, has, lacks })

function approvedRun() {
  const root = mkdtempSync(join(tmpdir(), 'autonomy-'))
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'), '## Assignment\n\n- `default-assignee`: `rucka` — the maintainer.\n')
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'tmp-r0.json')
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'feature/US-42', phase: 'r0', skill: 'review-phase', inputHead: SHA('a'), reviewedHead: SHA('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA('c') }, mode: 'first' }))
  assert.equal(publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: V }).published, true)
  return dir
}
const freshDir = () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'autonomy-fresh-')), '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  return dir
}
const at = (dir, extra = {}) => resolve({ dir, workflowVersion: V, entry: 'pr', pr: 7, ...extra })
const auto = (until, merge, rest = {}) => ({ policy: { ...POLICY, autonomy: { until, merge } }, ...rest })

// ── AC5: the merge gate decides the merge stage ────────────────────────────────────────────
test('AC5: until merged — always parks (done), never/when offer merge; until pr|ready never reach merge', () => {
  const dir = approvedRun()
  assert.equal(at(dir, auto('merged', gate('always'), { labels: [GREEN] })).next.step, 'done')
  assert.equal(at(dir, auto('merged', gate('never'), { labels: [GREEN] })).next.step, 'merge')
  assert.equal(at(dir, auto('merged', gate('when', ['cost:red']), { labels: [GREEN], tier: GREEN })).next.step, 'merge')
  for (const until of ['pr', 'ready'])
    for (const g of [gate('never'), gate('when', ['cost:red'])]) {
      const r = at(dir, auto(until, g, { labels: [GREEN] }))
      assert.equal(r.next.step, 'done', `${until}/${g.mode}`)
      assert.equal(r.status, 'completed')
    }
})

// ── AC6: escalation at the boundary ────────────────────────────────────────────────────────
test('AC6: a has/lacks condition at ready-for-merge returns status escalated with conditions and stage', () => {
  const dir = approvedRun()
  const r = at(dir, auto('merged', gate('when', ['cost:red'], [GREEN]), { labels: ['cost:red'] }))
  assert.equal(r.status, 'escalated')
  assert.equal(r.next.step, 'blocked')
  assert.equal(r.next.reason, 'escalated')
  assert.deepEqual(r.next.conditions, ['has:cost:red', `lacks:${GREEN}`])
  assert.equal(r.next.stage, 'merge')
})

test('AC6: escalation fires before a stage dispatch too, and only under until merged', () => {
  const dir = freshDir()
  const esc = at(dir, { ...auto('merged', gate('when', ['cost:red']), { labels: ['cost:red'] }), entry: 'fresh', pr: undefined })
  assert.equal(esc.status, 'escalated')
  assert.ok(['prepare', 'validate', 'implement'].includes(esc.next.stage), esc.next.stage)
  const ok = at(dir, { ...auto('merged', gate('when', ['cost:red']), { labels: [GREEN] }), entry: 'fresh', pr: undefined })
  assert.equal(ok.status, 'empty')
  assert.notEqual(ok.next.step, 'blocked')
  const pr = at(dir, { ...auto('pr', gate('when', ['cost:red']), { labels: ['cost:red'] }), entry: 'fresh', pr: undefined })
  assert.notEqual(pr.status, 'escalated', 'the gate is evaluated ONLY under until: merged')
})

test('AC6: label removed between boundaries — the next resolve resumes, no stale escalation', () => {
  const dir = approvedRun()
  const p = auto('merged', gate('when', ['cost:red']))
  assert.equal(at(dir, { ...p, labels: ['cost:red'] }).status, 'escalated')
  const again = at(dir, { ...p, labels: [GREEN] })
  assert.equal(again.status, 'in-progress')
  assert.equal(again.next.step, 'merge')
})

test('until: ready stops at the prepare->implement boundary: no implementation is dispatched', () => {
  const dir = freshDir()
  const r = at(dir, { ...auto('ready', gate('always'), { labels: [] }), entry: 'fresh', pr: undefined })
  assert.equal(r.next.step, 'done')
  assert.equal(r.next.target, 'ready')
  assert.equal(r.status, 'completed')
  assert.notEqual(r.next.step, 'implement')
})

test('the escalated status is distinct from the batch row status `escalate`', () => {
  assert.ok(CYCLE_STATUSES.includes('escalated'))
  assert.ok(!STEPS.includes('escalated') && !STEPS.includes('escalate'))
  assert.notEqual('escalated', 'escalate')
})

test('a malformed policy.autonomy is refused, never read as off', () => {
  const dir = approvedRun()
  for (const autonomy of [null, 'merged', { until: 'soon' }, { merge: { mode: 'always', has: ['x:y'], lacks: [] } }, { merge: { mode: 'sometimes' } }]) {
    const r = at(dir, { policy: { ...POLICY, autonomy } })
    assert.equal(r.status, 'invalid', JSON.stringify(autonomy))
    assert.equal(r.reason, 'policy-autonomy-invalid')
  }
  assert.equal(autonomyPolicyError(undefined), null)
  assert.equal(autonomyPolicyError({ until: 'merged', merge: gate('when', ['a:b']) }), null)
})

// ── default off: no autonomy => today's behaviour, byte for byte ────────────────────────────
test('default off: no policy.autonomy keeps the US-490 tier rule — merge offered only for an admitted tier', () => {
  const dir = approvedRun()
  assert.equal(at(dir, { policy: POLICY, tier: GREEN, labels: ['cost:red'] }).next.step, 'done')
  assert.equal(at(dir, { policy: { ...POLICY, autoAdvance: { tiers: [GREEN] } }, tier: GREEN }).next.step, 'merge')
  assert.equal(at(dir, { policy: { ...POLICY, autoAdvance: { tiers: [GREEN] } }, tier: 'risk:red' }).next.step, 'done')
  const fresh = at(freshDir(), { policy: POLICY, entry: 'fresh', pr: undefined })
  assert.ok(!['escalated', 'blocked'].includes(fresh.status))
  assert.equal(fresh.next.target, undefined)
})

// ── cycle-merge: the gate replaces only the tier-membership check ───────────────────────────
const base = { cardTier: GREEN, currentTier: GREEN, reviewedHead: SHA('a'), signals: OK, gate: 'green', requireGate: true }

test('decideMerge with a gate: always parks awaiting-human, never/when merge, escalation is its own park kind', () => {
  const always = decideMerge({ ...base, mergeGate: gate('always'), labels: [GREEN] })
  assert.deepEqual([always.mergeAllowed, always.parkKind, always.failed[0].code], [false, 'awaiting-human', 'tier-not-auto-advance'])
  for (const g of [gate('never'), gate('when', ['cost:red'])]) assert.equal(decideMerge({ ...base, mergeGate: g, labels: [GREEN] }).mergeAllowed, true)
  const esc = decideMerge({ ...base, mergeGate: gate('when', ['cost:red'], [GREEN]), labels: ['cost:red'] })
  assert.deepEqual([esc.mergeAllowed, esc.parkKind, esc.conditions], [false, 'escalated', ['has:cost:red', `lacks:${GREEN}`]])
})

test('merge: never does NOT bypass #490 signals: head moved, pair-review, approval and gate stay mandatory', () => {
  const g = { mergeGate: gate('never'), labels: [GREEN] }
  assert.deepEqual(decideMerge({ ...base, ...g, signals: { ...OK, headSha: SHA('b') } }).failed.map(f => f.code), ['head-moved'])
  assert.deepEqual(decideMerge({ ...base, ...g, signals: { ...OK, pairReview: 'failure' } }).failed.map(f => f.code), ['pair-review'])
  assert.deepEqual(decideMerge({ ...base, ...g, signals: { ...OK, explicitApproval: 'missing' }, effectiveTier: 'risk:red' }).failed.map(f => f.code), ['explicit-approval'])
  assert.deepEqual(decideMerge({ ...base, ...g, gate: undefined }).failed.map(f => f.code), ['gate-unverified'])
  assert.deepEqual(decideMerge({ ...base, ...g, currentTier: 'risk:red' }).failed.map(f => f.code), ['tier-changed'])
  assert.equal(decideMerge({ ...base, ...g, signals: null }).failed[0].code, 'signals-unreadable')
})

test('legacy autoAdvanceTiers path is byte-for-byte unchanged (no gate given)', () => {
  assert.equal(decideMerge({ ...base, autoAdvanceTiers: [GREEN] }).mergeAllowed, true)
  const d = decideMerge({ ...base, autoAdvanceTiers: [] })
  assert.deepEqual([d.failed[0].code, d.parkKind, d.conditions], ['tier-not-auto-advance', 'awaiting-human', undefined])
})

const fakeHosts = (o = {}) => {
  const calls = []
  const pm = {
    readCard: (id, opts) => {
      calls.push(['readCard', id])
      if (o.unreadable) throw new Error('offline')
      return opts?.fields ? { labels: (o.labels ?? [GREEN]).map(name => ({ name })) } : { body: '' }
    },
    commentOnCard: args => {
      calls.push(['commentOnCard', args])
      if (o.commentFails) throw new Error('rate limited')
      return { action: 'created', id: 1 }
    },
    updateCard: () => ({}),
    closeAndCascade: () => ({ closed: [42] }),
    setBoardState: () => ({ confirmed: true }),
  }
  const code = { readLabels: () => { if (o.prUnreadable) throw new Error('offline'); return o.prLabels ?? [GREEN] }, prHead: () => SHA('a'), readCheck: ({ context }) => 'success' && (context ? 'success' : null), readCheckRun: () => null, merge: () => ({ merged: true }) }
  return { calls, hosts: { pm, code } }
}
const input = (h, extra) => ({ hosts: h.hosts, story: 42, pr: 7, repo: 'o/r', reviewedHead: SHA('a'), cardTier: GREEN, ...extra })

test('checkMerge under a gate reads labels live and posts the ONE escalation comment (not the park comment)', () => {
  const h = fakeHosts({ labels: [GREEN, 'cost:red'] })
  const out = checkMerge(input(h, { mergeGate: gate('when', ['cost:red']) }))
  assert.equal(out.mergeAllowed, false)
  assert.equal(out.parkKind, 'escalated')
  const posted = h.calls.filter(c => c[0] === 'commentOnCard')
  assert.equal(posted.length, 1)
  assert.equal(posted[0][1].marker, ESCALATION_MARKER(42))
  assert.match(posted[0][1].body, /`merge`/)
  assert.match(posted[0][1].body, /`has:cost:red`/)
  // idempotent: a second run posts with the SAME marker (the host adapter edits in place)
  checkMerge(input(h, { mergeGate: gate('when', ['cost:red']) }))
  assert.ok(h.calls.filter(c => c[0] === 'commentOnCard').every(c => c[1].marker === ESCALATION_MARKER(42)))
})

test('unreadable labels under a `when` gate escalate fail-safe (decideMerge); the live read reports null', () => {
  const d = decideMerge({ ...base, mergeGate: gate('when', ['cost:red']), labels: undefined })
  assert.deepEqual([d.parkKind, d.conditions], ['escalated', ['labels-unreadable']])
  assert.equal(decideMerge({ ...base, mergeGate: gate('never'), labels: undefined }).mergeAllowed, true)
  const h = fakeHosts({ unreadable: true })
  assert.equal(readCurrentLabels({ pm: h.hosts.pm, story: 42 }), null)
  // an unreadable card also reads as risk:red (tier-changed) — still never merged
  assert.equal(checkMerge(input(h, { mergeGate: gate('when', ['cost:red']) })).mergeAllowed, false)
})

test('runMerge under a gate never merges when the gate escalates; a failed comment post is reported, not hidden', () => {
  const h = fakeHosts({ labels: [GREEN, 'cost:red'], commentFails: true })
  const out = runMerge({ ...input(h, { mergeGate: gate('when', ['cost:red']) }), gate: 'green', message: 'm', branch: 'b', root: '/x' })
  assert.equal(out.merged, false)
  assert.equal(out.parkKind, 'escalated')
  assert.equal(out.comment.posted, false)
  assert.match(out.comment.error, /rate limited/)
})

test('escalate(): names stage and conditions; a post failure is data, not a throw', () => {
  const h = fakeHosts({ commentFails: true })
  const r = escalate({ hosts: h.hosts, story: 42, repo: 'o/r', stage: 'green', conditions: ['lacks:risk:green'] })
  assert.equal(r.posted, false)
  const ok = escalate({ hosts: fakeHosts().hosts, story: 42, stage: 'green', conditions: ['x:y'] })
  assert.equal(ok.posted, true)
})

// ── CLI surface ─────────────────────────────────────────────────────────────────────────────
test('parseArgs: --autoAdvance (legacy, pair-loop) or --mergeGate, exactly one; escalate command validated', () => {
  const o = { dir: '/x', story: '42', pr: '7', reviewedHead: SHA('a'), cardTier: GREEN }
  const flat = x => ['check', ...Object.entries(x).flatMap(([k, v]) => [`--${k}`, v])]
  assert.deepEqual(parseArgs(flat({ ...o, autoAdvance: '["risk:green"]' })).opts.autoAdvanceTiers, [GREEN])
  assert.deepEqual(parseArgs(flat({ ...o, mergeGate: JSON.stringify(gate('when', ['a:b'])) })).opts.mergeGate, gate('when', ['a:b']))
  assert.throws(() => parseArgs(flat(o)), /exactly one of/)
  assert.throws(() => parseArgs(flat({ ...o, autoAdvance: '["a:b"]', mergeGate: '{}' })), /exactly one of/)
  assert.throws(() => parseArgs(flat({ ...o, mergeGate: JSON.stringify(gate('always', ['a:b'])) })), /only with `when`/)
  assert.throws(() => parseArgs(flat({ ...o, mergeGate: 'x' })), /JSON gate object/)
  const e = parseArgs(['escalate', '--dir', '/x', '--story', '42', '--stage', 'green', '--conditions', '["has:cost:red"]'])
  assert.deepEqual(e.opts.conditions, ['has:cost:red'])
  assert.throws(() => parseArgs(['escalate', '--dir', '/x', '--story', '42', '--stage', 'green', '--conditions', '[]']), /non-empty/)
  assert.throws(() => parseArgs(['escalate', '--dir', '/x', '--story', '42', '--stage', 'Green;', '--conditions', '["a:b"]']), /step name/)
})

// ── D5 (autonomous run 493): the merge gate reads the EFFECTIVE labels — card labels with the PR's risk:* tier (written by
// the review, authoritative — ADL 2026-09-25, pr-states.md) replacing the card's. A card still tagged risk:green whose PR
// the review raised to risk:yellow must escalate under `lacks: risk:green` BEFORE cycle-merge parks on anything else.
const YELLOW = 'risk:yellow'
const LACKS_GREEN = gate('when', ['needs-review'], [GREEN])

test('D5: effectiveLabels — the PR risk tier replaces the card tier; no PR / no PR tier keeps the card; several or none-at-merge is red', () => {
  assert.deepEqual(effectiveLabels({ labels: [GREEN, 'bug'], prLabels: [YELLOW, 'x'] }), ['bug', YELLOW])
  assert.deepEqual(effectiveLabels({ labels: [GREEN, 'bug'], prLabels: undefined }), [GREEN, 'bug'])
  assert.deepEqual(effectiveLabels({ labels: [GREEN, 'bug'], prLabels: ['x'] }), [GREEN, 'bug'])
  assert.deepEqual(effectiveLabels({ labels: [GREEN, 'bug'], prLabels: [GREEN, YELLOW] }), ['bug', 'risk:red'])
  assert.deepEqual(effectiveLabels({ labels: [GREEN], prLabels: ['x'], atMerge: true }), ['risk:red'])
  assert.equal(effectiveLabels({ labels: undefined, prLabels: [YELLOW] }), undefined)
})

test('D5: decide reads prLabels — card risk:green + PR risk:yellow escalates at every stage boundary and at merge', () => {
  const policy = { until: 'merged', merge: LACKS_GREEN }
  for (const boundary of [{ kind: 'merge' }, { kind: 'stage', stage: 'verify' }, { kind: 'stage', stage: 'green' }]) {
    const d = decide({ boundary, labels: [GREEN], prLabels: [YELLOW], policy })
    assert.deepEqual([d.decision, d.conditions], ['escalate', ['lacks:risk:green']], JSON.stringify(boundary))
    assert.equal(decide({ boundary, labels: [GREEN], prLabels: [GREEN], policy }).decision, boundary.kind === 'merge' ? 'proceed' : 'proceed')
  }
})

test('D5: resolve at ready-for-merge escalates on the PR tier (not offered merge) and carries the stage', () => {
  const dir = approvedRun()
  const r = at(dir, auto('merged', LACKS_GREEN, { labels: [GREEN], prLabels: [YELLOW], tier: GREEN }))
  assert.deepEqual([r.status, r.next.step, r.next.reason, r.next.conditions], ['escalated', 'blocked', 'escalated', ['lacks:risk:green']])
  assert.equal(at(dir, auto('merged', LACKS_GREEN, { labels: [GREEN], prLabels: [GREEN], tier: GREEN })).next.step, 'merge')
})

test('D5: checkMerge escalates (escalation comment, no park comment) on the PR tier before any signal is judged', () => {
  const h = fakeHosts({ labels: [GREEN], prLabels: [YELLOW] })
  const out = checkMerge(input(h, { mergeGate: LACKS_GREEN }))
  assert.deepEqual([out.mergeAllowed, out.parkKind, out.conditions], [false, 'escalated', ['lacks:risk:green']])
  assert.equal(out.failed[0].code, 'escalated')
  const posted = h.calls.filter(c => c[0] === 'commentOnCard')
  assert.deepEqual(posted.map(c => c[1].marker), [ESCALATION_MARKER(42)])
})

test('D5: PR tier unreadable under a `when` gate escalates fail-safe; readEffectiveLabels reports null', () => {
  const h = fakeHosts({ prUnreadable: true })
  assert.equal(readEffectiveLabels({ pm: h.hosts.pm, code: h.hosts.code, story: 42, pr: 7 }), null)
  const out = checkMerge(input(h, { mergeGate: LACKS_GREEN }))
  assert.deepEqual([out.parkKind, out.conditions], ['escalated', ['labels-unreadable']])
})

test('D5: a PR with no risk tier at merge is red (pr-states.md fail-safe) — escalates under lacks: risk:green', () => {
  const h = fakeHosts({ labels: [GREEN], prLabels: ['pr-state:ready-to-merge'] })
  const out = checkMerge(input(h, { mergeGate: LACKS_GREEN }))
  assert.deepEqual([out.parkKind, out.conditions], ['escalated', ['lacks:risk:green']])
})

test('D5 control: card and PR both risk:green and gate lacks risk:green -> merge allowed', () => {
  const h = fakeHosts({ labels: [GREEN], prLabels: [GREEN] })
  assert.equal(checkMerge(input(h, { mergeGate: gate('when', [], [GREEN]) })).mergeAllowed, true)
})

test('D4 through checkMerge: yellow PR, approval check absent, review success -> merge allowed under never', () => {
  const h = fakeHosts({ labels: [YELLOW], prLabels: [YELLOW] })
  h.hosts.code.readCheck = ({ context }) => (context === 'pair-review' ? 'success' : null)
  const out = checkMerge({ ...input(h, { mergeGate: gate('never') }), cardTier: YELLOW })
  assert.deepEqual([out.mergeAllowed, out.failed], [true, []])
  const red = fakeHosts({ labels: [YELLOW], prLabels: ['risk:red'] })
  red.hosts.code.readCheck = h.hosts.code.readCheck
  const parked = checkMerge({ ...input(red, { mergeGate: gate('never') }), cardTier: YELLOW })
  assert.deepEqual([parked.mergeAllowed, parked.parkKind, parked.failed.map(f => f.code)], [false, 'awaiting-human', ['explicit-approval']])
})
