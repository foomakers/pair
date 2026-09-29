// Paired merge-decision canary (US-490, DoD "Paired canary", T-5). The merge rule used to live
// inline in `pair-loop.js`'s Advance phase; US-490 moved it into `cycle-merge.mjs` (`decideMerge`,
// reached through `checkMerge` then `runMerge`) as a behavior-preserving extraction. This file
// replays BOTH over the whole scenario space — tier x signals x gate x head — and fails on any
// decision diff.
//
// The OLD rule is not re-implemented here: `fixtures/pair-loop-advance.f9e48eb7.js.txt` is the
// verbatim text of `origin/main` at f9e48eb7 (blob ae097f69), lines 72 (`isLabelShape`) and
// 628-765 (the Advance phase), reproducible byte for byte with
//   git show f9e48eb7:.claude/workflows/pair-loop.js | sed -n '72p;628,765p'
// and evaluated as-is with its `agent()` calls answered from the scenario. The NEW side runs the
// real `cycle-merge.mjs` exports through fake PM / code-host adapters. No live host, no network,
// no git: deterministic and hermetic, part of `pnpm workflows:test`.
//
// The diff report is a committed oracle (`fixtures/merge-canary-report.md`): the rendered report
// must equal it byte for byte, so a changed scenario space or a changed decision fails too. To
// write the report for a PR: PAIR_MERGE_CANARY_REPORT=<path> node --test pair-contracts/merge-canary.test.mjs
// RUNS FROM `.claude/workflows` ONLY (its `../../skills/...` import resolves nowhere in the dataset).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

import { checkMerge, runMerge } from '../../skills/pair-workflow-cycle/scripts/cycle-merge.mjs'

const FIXTURE_URL = new URL('./fixtures/pair-loop-advance.f9e48eb7.js.txt', import.meta.url)
const REPORT_URL = new URL('./fixtures/merge-canary-report.md', import.meta.url)
const FIXTURE_SHA256 = '7ed8a32b2fec7083e7428e79a11c69d9fb890c1f9b6c95801ea27822d88e8f48'

const SHA = c => c.repeat(40)
const REVIEWED = SHA('a')
const MOVED = SHA('b')
const STORY = '42'
const PR = 7
const TIERS = ['risk:green', 'risk:yellow', 'risk:red']

// ── the scenario space ───────────────────────────────────────────────────────────────────────
// fresh: what the card's `risk:*` read returns at merge time. `old` is what the Advance agent
// returned; `labels` the card labels the new adapter read yields; `throws` an unreadable card.
const freshClasses = cardTier => [
  { id: 'same', old: { tier: cardTier }, labels: [cardTier] },
  ...TIERS.filter(t => t !== cardTier).map(t => ({ id: `changed:${t}`, old: { tier: t }, labels: [t] })),
  { id: 'untagged', old: { tier: 'untagged' }, labels: [] },
  { id: 'non-risk-labels-only', old: { tier: 'untagged' }, labels: ['bug'] },
  { id: 'unreadable', old: {}, throws: true },
  { id: 'malformed:risk:gr een', old: { tier: 'risk:gr een' }, labels: ['risk:gr een'] },
  { id: 'malformed:risk:a.b', old: { tier: 'risk:a.b' }, labels: ['risk:a.b'] },
]
// signals: the PR SIGNALS re-read on the remote head. `head` is resolved per scenario.
const SIGNAL_CLASSES = [
  { id: 'unreadable:host-error', unreadable: 'throws' },
  { id: 'unreadable:head-not-sha', unreadable: 'head', pairReview: 'success', explicitApproval: 'success' },
  { id: 'unreadable:pair-review-not-string', pairReview: 42, explicitApproval: 'success' },
  { id: 'unreadable:explicit-approval-not-string', pairReview: 'success', explicitApproval: 42 },
  ...['success', 'failure', 'pending', 'missing'].flatMap(pairReview =>
    ['success', 'failure', 'missing'].map(explicitApproval => ({ id: `pr:${pairReview},ea:${explicitApproval}`, pairReview, explicitApproval })),
  ),
]
const HEADS = ['reviewed', 'moved']
const GATES = ['green', 'red']

function scenarios() {
  const out = []
  for (const cardTier of TIERS)
    // A legal `## Auto-Advance` names nothing, or exactly the `## Eligibility` tier the card was
    // selected under (extractAutoAdvance HALTs on anything else before a card is touched).
    for (const autoAdvance of [[], [cardTier]])
      for (const fresh of freshClasses(cardTier))
        for (const signals of SIGNAL_CLASSES)
          for (const head of HEADS)
            for (const gate of GATES)
              out.push({ id: `${cardTier} aa=${JSON.stringify(autoAdvance)} fresh=${fresh.id} sig=${signals.id} head=${head} gate=${gate}`, cardTier, autoAdvance, fresh, signals, head, gate })
  return out
}

const headOf = s => (s.signals.unreadable === 'head' ? 'not-a-sha' : s.head === 'reviewed' ? REVIEWED : MOVED)
const oldSignals = s => (s.signals.unreadable === 'throws' ? null : { headSha: headOf(s), pairReview: s.signals.pairReview, explicitApproval: s.signals.explicitApproval })

// ── OLD: the frozen Advance block, evaluated verbatim ──────────────────────────────────────────
const fixture = readFileSync(FIXTURE_URL, 'utf8')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const oldAdvance = new AsyncFunction('agent', 'phase', 'batchResult', 'batch', 'runLog', 'haltedCardIds', 'iteration', 'policy', 'approvalArgsFor', fixture)

async function oldDecision(s) {
  const runLog = []
  const agent = async prompt => {
    if (prompt.includes('what is its CURRENT `risk:*` label')) return s.fresh.old
    if (prompt.includes('PR SIGNALS on the code host right now')) return oldSignals(s)
    if (prompt.includes('Merge contract')) return s.gate === 'green' ? { merged: true, cascaded: true, reason: 'merged' } : { merged: false, reason: 'gate set red' }
    if (prompt.includes('Post a comment on issue')) return { posted: true }
    throw new Error(`canary: the frozen Advance block issued an unexpected agent call: ${prompt.slice(0, 80)}`)
  }
  await oldAdvance(
    agent,
    () => {},
    { batch: [{ id: STORY, status: 'ready-for-merge', reviewedHead: REVIEWED, verdict: 'APPROVED', prNumber: PR }] },
    [{ id: STORY, tier: s.cardTier }],
    runLog,
    new Set(),
    0,
    { autoAdvance: { tiers: s.autoAdvance } },
    () => '',
  )
  const row = runLog.filter(r => r.id === STORY && 'autoAdvance' in r).at(-1)
  if (!row) throw new Error(`canary: the frozen Advance block recorded no decision for ${s.id}`)
  if (row.autoAdvance === true && !row.parked) return { merged: true, parkKind: null, code: null, detail: null }
  const reason = String(row.reason ?? '')
  const parkKind = reason.startsWith('awaiting human — ') ? 'awaiting-human' : reason.startsWith('halted — ') ? 'halted' : 'unknown'
  const detail = reason.replace(/^(awaiting human|halted) — /, '')
  const code = OLD_CODES.find(([re]) => re.test(detail))?.[1] ?? 'unknown'
  return { merged: false, parkKind, code, detail: code === 'gate-red' ? null : detail }
}
const OLD_CODES = [
  [/^tier changed /, 'tier-changed'],
  [/^tier .* not in Auto-Advance$/, 'tier-not-auto-advance'],
  [/^PR SIGNALS unreadable /, 'signals-unreadable'],
  [/^PR head moved /, 'head-moved'],
  [/^pair-review conclusion /, 'pair-review'],
  [/^pair-explicit-approval conclusion /, 'explicit-approval'],
  [/gate re-verification came back red/, 'gate-red'],
]

// ── NEW: checkMerge, then runMerge with the gate (the path pair-loop.js now takes) ───────────────
function fakeHosts(s) {
  const pm = {
    readCard: (id, opts) => {
      if (opts?.fields) {
        if (s.fresh.throws) throw new Error('board unreadable')
        return { labels: s.fresh.labels.map(name => ({ name })) }
      }
      return { body: '## Definition of Done\n\n- [x] done\n' }
    },
    updateCard: () => ({}),
    closeAndCascade: () => ({ closed: [Number(STORY)], stoppedAt: null }),
    setBoardState: () => ({ applied: 'Done', confirmed: true, error: null }),
    commentOnCard: () => ({ action: 'created', id: 1 }),
  }
  const conclusion = context => (context === 'pair-review' ? s.signals.pairReview : s.signals.explicitApproval)
  const code = {
    prHead: () => {
      if (s.signals.unreadable === 'throws') throw new Error('host unreachable')
      return headOf(s)
    },
    readCheck: ({ context }) => (conclusion(context) === 'missing' ? null : conclusion(context)),
    readCheckRun: () => null,
    merge: () => ({ merged: true }),
  }
  return { pm, code }
}
const git = args => (args[0] === 'rev-parse' ? { status: 1, stdout: '', stderr: '' } : { status: 0, stdout: '', stderr: '' })
const fs = { exists: () => false, rm: () => {} }

function newDecision(s) {
  const input = { hosts: fakeHosts(s), story: Number(STORY), pr: PR, repo: 'o/r', reviewedHead: REVIEWED, cardTier: s.cardTier, autoAdvanceTiers: s.autoAdvance }
  const checked = checkMerge(input)
  const d = checked.mergeAllowed ? runMerge({ ...input, gate: s.gate, message: 'm', branch: 'feature/US-42-canary', root: '/canary-root', git, fs }) : checked
  if (d.merged === true) return { merged: true, parkKind: null, code: null, detail: null }
  const first = d.failed?.[0] ?? {}
  return { merged: false, parkKind: d.parkKind, code: first.code ?? 'unknown', detail: first.code === 'gate-red' ? null : (first.detail ?? null) }
}

// ── the report ─────────────────────────────────────────────────────────────────────────────
function renderReport(rows) {
  const diffs = rows.filter(r => r.diff)
  const tally = new Map()
  for (const r of rows) {
    const key = r.old.merged ? 'merge | — | —' : `park | ${r.old.parkKind} | ${r.old.code}`
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
  const cell = d => (d.merged ? 'merge' : `park ${d.parkKind} \`${d.code}\``)
  return [
    '# Paired merge-decision canary (US-490)',
    '',
    '- Oracle: the removed `pair-loop.js` Advance block, frozen verbatim from `origin/main` f9e48eb7',
    `  (lines 72 and 628-765, sha256 \`${FIXTURE_SHA256}\`), evaluated as-is`,
    '- Subject: `cycle-merge.mjs` `checkMerge` then `runMerge` (`decideMerge`) through fake adapters',
    '- Compared: merge or park, park kind, first failed condition, its detail text (the gate detail excepted)',
    '- Reproduce: `cd .claude/workflows && node --test pair-contracts/merge-canary.test.mjs`',
    '',
    '## Scenario space',
    '',
    '| dimension | classes |',
    '| --- | --- |',
    `| card tier | ${TIERS.join(', ')} |`,
    '| Auto-Advance | `[]`, `[<card tier>]` |',
    `| tier re-read | ${freshClasses('<card tier>')
      .map(f => f.id.replace(/risk:(green|yellow|red)/, '<other tier>'))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ')} |`,
    `| signals | ${SIGNAL_CLASSES.map(c => c.id).join(', ')} |`,
    `| head | ${HEADS.join(', ')} |`,
    `| gate | ${GATES.join(', ')} |`,
    '',
    `Scenarios: ${rows.length}`,
    '',
    `Decision diffs: ${diffs.length}`,
    '',
    '## Outcomes (old rule)',
    '',
    '| decision | park kind | first failed condition | scenarios |',
    '| --- | --- | --- | --- |',
    ...[...tally.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => `| ${k} | ${n} |`),
    '',
    '## Decision diffs',
    '',
    ...(diffs.length === 0 ? ['None.'] : ['| scenario | old | new |', '| --- | --- | --- |', ...diffs.map(r => `| ${r.id} | ${cell(r.old)} | ${cell(r.new)} |`)]),
    '',
  ].join('\n')
}

// ── the canary ─────────────────────────────────────────────────────────────────────────────
test('canary: the frozen oracle is the verbatim origin/main Advance block', () => {
  assert.equal(createHash('sha256').update(fixture).digest('hex'), FIXTURE_SHA256)
  assert.match(fixture, /^const isLabelShape = /)
  assert.match(fixture, /phase\('Advance'\)/)
})

test('canary: old pair-loop.js merge rule vs decideMerge — zero decision diffs over tier x signals x gate x head', async t => {
  const rows = []
  for (const s of scenarios()) {
    const old = await oldDecision(s)
    const neu = newDecision(s)
    rows.push({ id: s.id, old, new: neu, diff: JSON.stringify(old) !== JSON.stringify(neu) })
  }
  const report = renderReport(rows)
  if (process.env.PAIR_MERGE_CANARY_REPORT) writeFileSync(process.env.PAIR_MERGE_CANARY_REPORT, report)
  const diffs = rows.filter(r => r.diff)
  t.diagnostic(`${rows.length} scenarios, ${diffs.length} decision diffs`)
  assert.ok(!rows.some(r => r.old.code === 'unknown' || r.new.code === 'unknown'), 'a decision the canary cannot classify')
  // Compact on failure: the count, then the first rows in full (the whole list is in the report).
  const shown = diffs.slice(0, 3).map(r => `  ${r.id}\n    old ${JSON.stringify(r.old)}\n    new ${JSON.stringify(r.new)}`)
  assert.equal(diffs.length, 0, `${diffs.length} decision diffs over ${rows.length} scenarios; first ${shown.length}:\n${shown.join('\n')}`)
  const expected = readFileSync(REPORT_URL, 'utf8')
  const at = report.split('\n').findIndex((line, i) => line !== expected.split('\n')[i])
  assert.ok(report === expected, `the rendered report differs from the committed fixtures/merge-canary-report.md at line ${at + 1}: ${JSON.stringify(report.split('\n')[at])}`)
})
