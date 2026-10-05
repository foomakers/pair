// Tests for the autonomous PREPARE phase's decision + writers (US-523 T-2, T-5): the full decision
// table, the `always` safety property, fail-closed inputs, and the escalate / complete writers over a
// fake host. RUNS FROM `.claude/workflows` ONLY (the dataset copy's `../../skills/...` imports resolve nowhere).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { decide, escalate, complete, parseArgs, assumptionsSection, escalationBody, openQuestionOf, ESCALATION_MARKER, ROUTES, BOUNDARIES, READINESS } from '../../skills/pair-workflow-cycle/scripts/cycle-prepare.mjs'
import github from '../../skills/pair-workflow-cycle/scripts/host/github.mjs'
import azure from '../../skills/pair-workflow-cycle/scripts/host/azure-devops.mjs'
import { PM_METHODS } from '../../skills/pair-workflow-cycle/scripts/host/adapter-kit.mjs'

const SCRIPT = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-prepare.mjs', import.meta.url))
const ALWAYS = { mode: 'always', has: [], lacks: [] }
const NEVER = { mode: 'never', has: [], lacks: [] }
const when = (has = [], lacks = []) => ({ mode: 'when', has, lacks })

// ── the full decision table: mode × has × lacks × attended × readiness × boundary ───────────
// Oracle written independently of the implementation: the rule, spelled per cell.
const GATES = [
  ['always', ALWAYS],
  ['never', NEVER],
  ['when has', when(['risk:red'])],
  ['when lacks', when([], ['triaged'])],
  ['when has+lacks', when(['risk:red'], ['triaged'])],
]
const LABELS = [
  ['none', []],
  ['triaged', ['triaged']],
  ['risk:red', ['risk:red']],
  ['both', ['risk:red', 'triaged']],
  ['needs-review+triaged', ['needs-review', 'triaged']],
]
function expected(gate, labels, attended, readiness) {
  if (!attended && labels.includes('needs-review')) return 'skip-escalated'
  if (readiness === 'ready') return 'nothing-to-prepare'
  if (gate.mode === 'always') return attended ? 'run-interactive' : 'skip-needs-human'
  if (gate.mode === 'never') return 'run-autonomous'
  const fires = gate.has.some(l => labels.includes(l)) || gate.lacks.some(l => !labels.includes(l))
  return fires ? 'escalate' : 'run-autonomous'
}

test('AC1-AC6/T-2: every cell of the decision table yields the specified route', () => {
  let cells = 0
  for (const [gn, gate] of GATES)
    for (const [ln, labels] of LABELS)
      for (const attended of [true, false])
        for (const readiness of READINESS)
          for (const boundary of BOUNDARIES) {
            const got = decide({ gate, labels, readiness, attended, boundary, source: 'argument' })
            assert.equal(got.route, expected(gate, labels, attended, readiness), `${gn} | ${ln} | attended=${attended} | ${readiness} | ${boundary}`)
            assert.ok(ROUTES.includes(got.route))
            assert.equal(got.boundary, boundary)
            assert.equal(got.source, 'argument')
            cells++
          }
  assert.equal(cells, 5 * 5 * 2 * 3 * 3)
})

test('AC2 safety property: `always` + unattended NEVER yields a route that runs a preparation skill or writes Ready', () => {
  for (const [, labels] of LABELS)
    for (const readiness of READINESS)
      for (const boundary of BOUNDARIES) {
        const { route } = decide({ gate: ALWAYS, labels, readiness, attended: false, boundary })
        assert.ok(['skip-needs-human', 'skip-escalated', 'nothing-to-prepare'].includes(route), route)
      }
})

test('`never` never escalates from labels, whatever the card carries', () => {
  for (const [, labels] of LABELS) assert.notEqual(decide({ gate: NEVER, labels, readiness: 'draft', attended: false, boundary: 'B1' }).route, 'escalate')
})

test('AC6: an escalation names the firing conditions (has: / lacks:)', () => {
  const d = decide({ gate: when(['risk:red'], ['triaged']), labels: ['risk:red'], readiness: 'draft', attended: false, boundary: 'B1', source: 'adoption' })
  assert.deepEqual(d.conditions, ['has:risk:red', 'lacks:triaged'])
  assert.equal(d.condition, 'has:risk:red, lacks:triaged')
  assert.equal(d.gate, 'when; has: risk:red; lacks: triaged')
})

test('AC6: a `when` gate with unreadable labels escalates (fail-safe), never proceeds on a guess', () => {
  const d = decide({ gate: when([], ['triaged']), labels: undefined, readiness: 'draft', attended: false, boundary: 'B0' })
  assert.equal(d.route, 'escalate')
  assert.deepEqual(d.conditions, ['labels-unreadable'])
})

test('AC7: a `needs-review` card is skipped as escalated unattended, workable attended', () => {
  assert.equal(decide({ gate: NEVER, labels: ['needs-review'], readiness: 'draft', attended: false, boundary: 'B0' }).route, 'skip-escalated')
  assert.equal(decide({ gate: ALWAYS, labels: ['needs-review'], readiness: 'draft', attended: true, boundary: 'B0' }).route, 'run-interactive')
})

test('fail closed: malformed input throws, never a route', () => {
  const ok = { gate: NEVER, labels: [], readiness: 'draft', attended: false, boundary: 'B0' }
  for (const bad of [{ gate: undefined }, { gate: { mode: 'sometimes' } }, { gate: { mode: 'when' } }, { readiness: 'done' }, { readiness: undefined }, { boundary: 'B3' }, { boundary: undefined }, { attended: 'yes' }, { attended: undefined }]) assert.throws(() => decide({ ...ok, ...bad }), /must be|needs/, JSON.stringify(bad))
  assert.throws(() => decide(), /gate must be/)
})

test('determinism: same input, same output', () => {
  const input = { gate: when(['risk:red']), labels: ['risk:red'], readiness: 'draft', attended: false, boundary: 'B1', source: 'argument' }
  assert.deepEqual(decide(input), decide({ ...input }))
})

// ── CLI + argument parsing ─────────────────────────────────────────────────────────────────
const cli = args => {
  const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' })
  return { code: r.status, out: JSON.parse(r.stdout) }
}

test('CLI decide: prints the route JSON, exit 0', () => {
  const r = cli(['decide', '--gate', JSON.stringify(when([], ['triaged'])), '--readiness', 'draft', '--attended', 'false', '--boundary', 'B0', '--labels', '["triaged"]', '--source', 'adoption'])
  assert.equal(r.code, 0)
  assert.deepEqual({ route: r.out.route, source: r.out.source }, { route: 'run-autonomous', source: 'adoption' })
})

test('CLI decide: a malformed gate or flag is exit 2 with an error, never a route', () => {
  for (const args of [
    ['decide', '--gate', '{"mode":"when","has":[],"lacks":[]}', '--readiness', 'draft', '--attended', 'false', '--boundary', 'B0'],
    ['decide', '--gate', JSON.stringify(NEVER), '--readiness', 'draft', '--attended', 'maybe', '--boundary', 'B0'],
    ['decide', '--gate', JSON.stringify(NEVER), '--readiness', 'draft', '--attended', 'false', '--boundary', 'B0', '--bogus', 'x'],
    ['nope'],
  ]) {
    const r = cli(args)
    assert.equal(r.code, 2, args.join(' '))
    assert.equal(typeof r.out.error, 'string')
  }
})

test('parseArgs: escalate needs exactly one of --conditions / --openQuestion; complete needs --source', () => {
  const g = JSON.stringify(NEVER)
  assert.throws(() => parseArgs(['escalate', '--dir', '.', '--story', '5', '--boundary', 'B1', '--gate', g, '--source', 'argument']), /exactly one/)
  assert.throws(() => parseArgs(['escalate', '--dir', '.', '--story', '5', '--boundary', 'B1', '--gate', g, '--source', 'argument', '--conditions', '["a"]', '--openQuestion', 'q']), /exactly one/)
  assert.throws(() => parseArgs(['complete', '--dir', '.', '--story', '5', '--gate', g]), /--source is required/)
  const { opts } = parseArgs(['escalate', '--dir', '.', '--story', '5', '--boundary', 'B1', '--gate', g, '--source', 'argument', '--openQuestion', 'who pays?'])
  assert.equal(opts.story, 5)
  assert.equal(opts.openQuestion, 'who pays?')
})

// ── escalate / complete over a fake host ───────────────────────────────────────────────────
function fakeHosts({ labels = [], body = '', labelResult, board, readFails = false, commentFails = false } = {}) {
  const calls = []
  const comments = new Map()
  const state = { labels: [...labels], body }
  const pm = {
    readCard(id, { fields } = {}) {
      calls.push(['readCard', id])
      if (readFails) throw new Error('tracker unreachable')
      return fields ? { labels: state.labels.map(name => ({ name })) } : { body: state.body }
    },
    labelCard(a) {
      calls.push(['labelCard', a.label])
      if (labelResult) return labelResult
      state.labels.push(a.label)
      return { applied: a.label, confirmed: true, error: null }
    },
    commentOnCard({ marker, body: b }) {
      calls.push(['commentOnCard', marker])
      if (commentFails) throw new Error('comment refused')
      const edited = comments.has(marker)
      comments.set(marker, b)
      return { id: 1, edited }
    },
    setBoardState({ state: s }) {
      calls.push(['setBoardState', s])
      return board ?? { applied: s, confirmed: true, error: null }
    },
  }
  return { hosts: { pm }, calls, comments, state }
}
// r1-g1 / r0-3: a prepared body carries its `## Task Breakdown` (AC8: Ready only after B2) — the DoR inline signal, one checklist item.
const BREAKDOWN = '## Task Breakdown\n\n- [ ] **T-1**: do it\n\n'
const PREPARED = '## Story\n\nx\n\n' + BREAKDOWN + '## Assumptions\n\n- **Q**: scope? **A**: yes. Evidence: code. Overturn: edit.\n\n## Notes\n\nPrepared autonomously under prepare: never (argument) — ADR-028\n'

test('AC6/T-5: escalate adds needs-review, upserts ONE marker comment, writes NO board state', () => {
  const f = fakeHosts()
  const out = escalate({ hosts: f.hosts, story: 7, boundary: 'B1', gate: 'when; has: risk:red', source: 'adoption', conditions: ['has:risk:red'], assumptions: '- A1: x' })
  assert.deepEqual({ outcome: out.outcome, label: out.label.applied, posted: out.comment.posted }, { outcome: 'escalated', label: true, posted: true })
  assert.deepEqual(f.calls.map(c => c[0]), ['labelCard', 'commentOnCard'])
  const body = f.comments.get(ESCALATION_MARKER(7))
  for (const needle of ['has:risk:red', 'B1', 'when; has: risk:red', 'adoption', '- A1: x']) assert.ok(body.includes(needle), needle)
})

test('T-5: a re-run edits the comment in place (same marker), never a second comment', () => {
  const f = fakeHosts()
  const args = { hosts: f.hosts, story: 7, boundary: 'B1', gate: 'never', source: 'argument', openQuestion: 'who pays?' }
  escalate(args)
  escalate({ ...args, boundary: 'B2' })
  assert.equal(f.comments.size, 1)
  assert.ok(f.comments.get(ESCALATION_MARKER(7)).includes('B2'))
})

test('AC10: an open question is named in the comment', () => {
  const body = escalationBody({ story: 7, boundary: 'B0', gate: 'never', source: 'argument', openQuestion: 'which tenant model?' })
  assert.ok(body.includes('which tenant model?'))
})

test('T-5: a refused label write still posts the comment and reports the failure', () => {
  const f = fakeHosts({ labelResult: { applied: 'needs-review', confirmed: false, error: 'forbidden' } })
  const out = escalate({ hosts: f.hosts, story: 7, boundary: 'B0', gate: 'never', source: 'argument', conditions: ['x'] })
  assert.equal(out.outcome, 'escalated')
  assert.deepEqual({ applied: out.label.applied, error: out.label.error, posted: out.comment.posted }, { applied: false, error: 'forbidden', posted: true })
})

test('T-5: a failed comment never changes the outcome and is reported', () => {
  const f = fakeHosts({ commentFails: true })
  const out = escalate({ hosts: f.hosts, story: 7, boundary: 'B0', gate: 'never', source: 'argument', conditions: ['x'] })
  assert.equal(out.outcome, 'escalated')
  assert.deepEqual({ posted: out.comment.posted, error: out.comment.error }, { posted: false, error: 'comment refused' })
})

test('AC12/T-5: complete writes Ready once, after re-reading labels, when Assumptions + provenance are present', () => {
  const f = fakeHosts({ body: PREPARED, labels: ['triaged'] })
  const out = complete({ hosts: f.hosts, story: 7, gate: when([], ['triaged']), source: 'adoption' })
  assert.equal(out.completed, true)
  assert.deepEqual(f.calls.filter(c => c[0] === 'setBoardState'), [['setBoardState', 'Ready']])
})

test('T-5: complete honours the board state name the caller passes', () => {
  const f = fakeHosts({ body: PREPARED })
  complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument', state: 'Refined' })
  assert.deepEqual(f.calls.find(c => c[0] === 'setBoardState'), ['setBoardState', 'Refined'])
})

test('T-5: a B2 race (label appeared mid-phase) escalates instead of writing Ready', () => {
  const f = fakeHosts({ body: PREPARED, labels: ['risk:red'] })
  const out = complete({ hosts: f.hosts, story: 7, gate: when(['risk:red']), source: 'argument' })
  assert.equal(out.completed, false)
  assert.equal(out.reason, 'escalated-at-B2')
  assert.equal(out.escalation.outcome, 'escalated')
  assert.equal(f.calls.some(c => c[0] === 'setBoardState'), false)
})

test('T-5: missing/empty Assumptions or provenance ⇒ no Ready (fail closed)', () => {
  for (const [body, re] of [
    ['## Story\n\nx\n\n' + BREAKDOWN, /assumptions-missing/],
    [BREAKDOWN + '## Assumptions\n\n## Notes\n\nPrepared autonomously under prepare: never (argument)\n', /assumptions-missing/],
    [BREAKDOWN + '## Assumptions\n\n- A: b\n', /provenance-missing/],
  ]) {
    const f = fakeHosts({ body })
    const out = complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument' })
    assert.equal(out.completed, false)
    assert.match(out.reason, re)
    assert.equal(f.calls.some(c => c[0] === 'setBoardState'), false)
  }
})

test('T-5: unreadable card, unreadable labels under `when`, and an unconfirmed board write all fail closed', () => {
  const unreadable = fakeHosts({ readFails: true })
  assert.match(complete({ hosts: unreadable.hosts, story: 7, gate: NEVER, source: 'argument' }).reason, /card-unreadable/)
  const labels = fakeHosts({ readFails: true })
  assert.equal(complete({ hosts: labels.hosts, story: 7, gate: when([], ['triaged']), source: 'argument' }).reason, 'escalated-at-B2')
  const board = fakeHosts({ body: PREPARED, board: { applied: 'Ready', confirmed: false, error: 'no such option' } })
  assert.match(complete({ hosts: board.hosts, story: 7, gate: NEVER, source: 'argument' }).reason, /board-not-confirmed/)
})

test('AC2/T-5: complete under `always` never writes Ready (the gate refuses, whatever the body says)', () => {
  const f = fakeHosts({ body: PREPARED })
  const out = complete({ hosts: f.hosts, story: 7, gate: ALWAYS, source: 'default' })
  assert.equal(out.completed, false)
  assert.equal(f.calls.some(c => c[0] === 'setBoardState'), false)
})

// ── r1-g1 (US-523 round 1) ──────────────────────────────────────────────────────────────────
// r0-3 — AC8 + business rule "Ready after B2": `complete` fails closed without a non-empty `## Task Breakdown`. Oracle:
// definition-of-ready-and-done.md "Inline task-breakdown signal" — a `## Task Breakdown` section with at least one checklist item.
const PROVENANCE_ONLY = '## Story\n\nx\n\n## Assumptions\n\n- **Q**: scope? **A**: yes. Evidence: code. Overturn: edit.\n\n## Notes\n\nPrepared autonomously under prepare: never (argument) — ADR-028\n'
test('r0-3 [r1g1-w6] [r1g1-w7] [r1g1-w8]: complete without a task breakdown (absent / empty heading / prose, no checklist item) ⇒ completed false, breakdown-missing, no board write', () => {
  for (const [name, body] of [
    ['absent', PROVENANCE_ONLY],
    ['empty heading', '## Task Breakdown\n\n' + PROVENANCE_ONLY],
    ['prose only', '## Task Breakdown\n\nTasks to be defined.\n\n' + PROVENANCE_ONLY],
  ]) {
    const f = fakeHosts({ body })
    const out = complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument' })
    assert.equal(out.completed, false, name)
    assert.match(String(out.reason), /breakdown-missing/, name)
    assert.equal(f.calls.some(c => c[0] === 'setBoardState'), false, name)
  }
})

test('r0-3 [r1g1-c3]: a breakdown with a checklist item (`- [ ]`, `- [x]`, `* [ ]`) completes', () => {
  for (const item of ['- [ ] **T-1**: a', '- [x] **T-1**: a', '* [ ] T-1 a']) {
    const f = fakeHosts({ body: `## Task Breakdown\n\n${item}\n\n` + PROVENANCE_ONLY })
    assert.equal(complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument' }).completed, true, item)
  }
})

test('r0-3 [r1g1-i1]: breakdown present but Assumptions missing still fails closed (the checks compose, none displaces another)', () => {
  const f = fakeHosts({ body: BREAKDOWN + '## Notes\n\nPrepared autonomously under prepare: never (argument)\n' })
  const out = complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument' })
  assert.equal(out.completed, false)
  assert.match(out.reason, /assumptions-missing/)
})

// r0-4 — the B2 re-check inside `complete` uses the entry's REAL attendance (as B0 did), carried as `attended`.
test('r0-4 [r1g1-w9]: complete({ attended: true }) on a `needs-review` card under `never` writes Ready — no re-escalation, no label/comment write', () => {
  const f = fakeHosts({ body: PREPARED, labels: ['needs-review'] })
  const out = complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument', attended: true })
  assert.equal(out.completed, true)
  assert.deepEqual(f.calls.filter(c => c[0] !== 'readCard').map(c => c[0]), ['setBoardState'])
})

test('r0-4 [r1g1-w10]: the CLI `complete` accepts --attended true|false (as `decide` does)', () => {
  const g = JSON.stringify(NEVER)
  assert.equal(parseArgs(['complete', '--dir', '.', '--story', '5', '--gate', g, '--source', 'argument', '--attended', 'true']).opts.attended, true)
  assert.equal(parseArgs(['complete', '--dir', '.', '--story', '5', '--gate', g, '--source', 'argument', '--attended', 'false']).opts.attended, false)
})

test('r0-4 [r1g1-c4]: unattended (attended omitted or false) a `needs-review` card never reaches Ready through complete', () => {
  for (const extra of [{}, { attended: false }]) {
    const f = fakeHosts({ body: PREPARED, labels: ['needs-review'] })
    const out = complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument', ...extra })
    assert.equal(out.completed, false, JSON.stringify(extra))
    assert.equal(f.calls.some(c => c[0] === 'setBoardState'), false)
  }
})

test('r0-4 [r1g1-c5]: attended, a `when` gate that FIRES at B2 still escalates — attendance lifts only the needs-review skip', () => {
  const f = fakeHosts({ body: PREPARED, labels: ['risk:red'] })
  const out = complete({ hosts: f.hosts, story: 7, gate: when(['risk:red']), source: 'argument', attended: true })
  assert.equal(out.completed, false)
  assert.equal(out.reason, 'escalated-at-B2')
  assert.equal(f.calls.some(c => c[0] === 'setBoardState'), false)
})

test('r0-4 [r1g1-b1]: the CLI `complete` rejects a non-boolean --attended (fail closed)', () => {
  assert.throws(() => parseArgs(['complete', '--dir', '.', '--story', '5', '--gate', JSON.stringify(NEVER), '--source', 'argument', '--attended', 'maybe']))
})

// r0-5 — AC10 re-run: the escalation comment for an open question tells the human WHERE it lives (`## Open Questions`),
// so removing the label alone (and re-running) is not presented as the remedy.
test('r0-5 [r1g1-w11]: an open-question escalation body names the `## Open Questions` section', () => {
  const body = escalationBody({ story: 7, boundary: 'B1', gate: 'never', source: 'argument', openQuestion: 'which tenant model?' })
  assert.ok(body.includes('## Open Questions'), body)
})

test('r0-5 [r1g1-w12]: the comment escalate() posts for an open question names `## Open Questions`', () => {
  const f = fakeHosts()
  escalate({ hosts: f.hosts, story: 7, boundary: 'B1', gate: 'never', source: 'argument', openQuestion: 'who pays?' })
  assert.ok(f.comments.get(ESCALATION_MARKER(7)).includes('## Open Questions'))
})

test('assumptionsSection: reads up to the next heading; absent ⇒ null', () => {
  assert.equal(assumptionsSection('## A\n\n## Assumptions\n\n- x\n\n## B\n\ny'), '- x')
  assert.equal(assumptionsSection('## A\n'), null)
})

// ── the host adapters' labelCard ───────────────────────────────────────────────────────────
test('both host adapters declare labelCard on the PM side', () => {
  assert.ok(PM_METHODS.includes('labelCard'))
  for (const a of [github, azure]) assert.equal(typeof a.instantiate({ ghBin: 'gh', azBin: 'az' }).labelCard, 'function', a.id)
})

test('github labelCard: creates the label on first use, adds it, reads it back', () => {
  const bin = fakeBin((args, st) => {
    if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ labels: [{ name: 'needs-review' }] })
    return ''
  })
  const r = github.instantiate({ ghBin: bin }).labelCard({ id: 9, label: 'needs-review', repo: 'o/r' })
  assert.deepEqual({ applied: r.applied, confirmed: r.confirmed }, { applied: 'needs-review', confirmed: true })
  const calls = stateOf(bin).calls.map(c => c.join(' '))
  assert.ok(calls[0].startsWith('label create needs-review'))
  assert.ok(calls.some(c => c.startsWith('issue edit 9 --add-label needs-review')))
})

test('github labelCard: an existing label is not an error; a refused add is reported, never thrown', () => {
  const exists = fakeBin(args => {
    if (args[0] === 'label') throw new Error('already exists')
    if (args[1] === 'view') return JSON.stringify({ labels: [{ name: 'needs-review' }] })
    return ''
  })
  assert.equal(github.instantiate({ ghBin: exists }).labelCard({ id: 9, label: 'needs-review' }).confirmed, true)
  const refused = fakeBin(args => {
    if (args[1] === 'edit') throw new Error('forbidden')
    return ''
  })
  const r = github.instantiate({ ghBin: refused }).labelCard({ id: 9, label: 'needs-review' })
  assert.equal(r.confirmed, false)
  assert.match(r.error, /forbidden/)
})

test('azure labelCard: adds the tag to System.Tags once, reads it back', () => {
  const bin = fakeBin((args, st) => {
    if (args.includes('update')) {
      st.tags = args[args.indexOf('--fields') + 1].replace('System.Tags=', '')
      return JSON.stringify({})
    }
    return JSON.stringify({ id: 9, fields: { 'System.Tags': st.tags ?? 'a; b' } })
  })
  const a = azure.instantiate({ azBin: bin })
  assert.equal(a.labelCard({ id: 9, label: 'needs-review' }).confirmed, true)
  const updates = () => stateOf(bin).calls.filter(c => c.includes('update'))
  assert.equal(updates().length, 1)
  assert.ok(updates()[0].includes('System.Tags=a; b; needs-review'))
  a.labelCard({ id: 9, label: 'needs-review' })
  assert.equal(updates().length, 1)
})

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// A recorder CLI: a node script that logs every call into a state file, runs the handler (args, state) and prints its
// return — or fails with its message on stderr. The state file is how a test sees what a child process did.
function fakeBin(handler) {
  const dir = mkdtempSync(join(tmpdir(), 'prep-bin-'))
  const file = join(dir, 'fake')
  const stateFile = join(dir, 'state.json')
  writeFileSync(stateFile, JSON.stringify({ calls: [] }))
  const src = `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
const f = ${JSON.stringify(stateFile)}
const st = JSON.parse(readFileSync(f, 'utf8'))
const args = process.argv.slice(2)
st.calls.push(args)
let input = ''
try { input = readFileSync(0, 'utf8') } catch {}
;(st.inputs ??= []).push(input)
const h = ${handler.toString()}
let out = ''
let err = null
try { out = h(args, st, input) ?? '' } catch (e) { err = e }
writeFileSync(f, JSON.stringify(st))
if (err) { process.stderr.write(String(err.message)); process.exit(1) }
process.stdout.write(out)
`
  writeFileSync(file + '.mjs', src)
  writeFileSync(file, `#!/bin/sh\nexec node "${file}.mjs" "$@"\n`)
  chmodSync(file, 0o755)
  fakeBins.set(file, stateFile)
  return file
}
const fakeBins = new Map()
const stateOf = bin => JSON.parse(readFileSync(fakeBins.get(bin), 'utf8'))

// ── review r2: the full CLI over a stubbed `gh` (PAIR_GH_BIN) — nothing here can reach a real tracker ─────────────
// A tracker in a file: the card's labels/body, its board and its comment thread. Self-contained (it is stringified).
const GH = (args, st, input) => {
  const a = args.join(' ')
  if (args[0] === 'issue' && args[1] === 'view') return a.includes('--json body') ? st.body : JSON.stringify({ labels: st.labels.map(name => ({ name })) })
  if (args[0] === 'label') return ''
  if (args[0] === 'issue' && args[1] === 'edit') {
    const add = args.indexOf('--add-label')
    if (add > 0) st.labels.push(args[add + 1])
    const rm = args.indexOf('--remove-label')
    if (rm > 0) st.labels = st.labels.filter(l => l !== args[rm + 1])
    return ''
  }
  if (args[0] === 'api' && args.includes('graphql')) {
    const q = args.find(x => x.startsWith('query='))
    if (q.includes('mutation')) return JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { fieldValueByName: { name: 'Ready' } } } } })
    return JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [{ id: 'I', project: { id: 'P', title: 'B', fields: { nodes: [{ id: 'F', name: 'Status', options: [{ id: 'O', name: 'Ready' }] }] } } }] } } } } })
  }
  if (args[0] === 'api' && args.includes('POST')) return JSON.stringify({ id: 1, html_url: 'u' })
  if (args[0] === 'api') return '[]'
  return ''
}
function tracker({ labels = [], body = '' } = {}) {
  const bin = fakeBin(GH)
  const dir = join(mkdtempSync(join(tmpdir(), 'prep-run-')), '7')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.host-binding.json'), JSON.stringify({ schemaVersion: 1, pmTool: 'github', codeHost: 'github' }))
  const sf = fakeBins.get(bin)
  writeFileSync(sf, JSON.stringify({ calls: [], labels, body, inputs: [] }))
  const run = args => {
    const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, PAIR_GH_BIN: bin } })
    return { code: r.status, out: JSON.parse(r.stdout) }
  }
  return { run, dir, state: () => stateOf(bin), bin }
}
const gateArg = g => ['--gate', JSON.stringify(g)]
const HUMAN_REFINED = '## Story\n\nx\n\n' + BREAKDOWN

test('r2-1: a human-refined card (no ## Assumptions, no provenance line) completes through the real CLI path, Ready written once', () => {
  const t = tracker({ body: HUMAN_REFINED })
  const r = t.run(['complete', '--dir', t.dir, '--story', '7', ...gateArg(NEVER), '--source', 'argument', '--repo', 'o/r', '--refinedAutonomously', 'false'])
  assert.equal(r.code, 0)
  assert.equal(r.out.completed, true, JSON.stringify(r.out))
  assert.equal(t.state().calls.filter(c => c.includes('graphql') && c.some(x => String(x).includes('mutation'))).length, 1)
})

test('r2-1: the same card is refused when the refinement WAS autonomous (default fail-closed: assumptions + provenance owed)', () => {
  const t = tracker({ body: HUMAN_REFINED })
  for (const extra of [[], ['--refinedAutonomously', 'true']]) {
    const r = t.run(['complete', '--dir', t.dir, '--story', '7', ...gateArg(NEVER), '--source', 'argument', '--repo', 'o/r', ...extra])
    assert.equal(r.out.completed, false)
    assert.match(r.out.reason, /^assumptions-missing/)
  }
  assert.equal(parseArgs(['complete', '--dir', '.', '--story', '5', ...gateArg(NEVER), '--source', 'a', '--refinedAutonomously', 'false']).opts.refinedAutonomously, false)
  assert.throws(() => parseArgs(['complete', '--dir', '.', '--story', '5', ...gateArg(NEVER), '--source', 'a', '--refinedAutonomously', 'maybe']), /true \| false/)
})

test('r2-1: a human-refined card still needs its task breakdown (the breakdown check is not relaxed)', () => {
  const f = fakeHosts({ body: '## Story\n\nx\n' })
  assert.match(complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument', refinedAutonomously: false }).reason, /^breakdown-missing/)
})

const SPACED = ['when', 'has: good first issue', 'lacks: needs triage']
test('r2-2: a gate label with spaces (`when; has: good first issue`) escalates through the real CLI at B0, B1 and B2 — label + comment, never a throw', () => {
  const gate = { mode: 'when', has: ['good first issue'], lacks: [] }
  for (const boundary of ['B0', 'B1', 'B2']) {
    const t = tracker({ labels: ['good first issue'] })
    const d = t.run(['decide', ...gateArg(gate), '--readiness', boundary === 'B0' ? 'draft' : 'refined-no-breakdown', '--attended', 'false', '--boundary', boundary, '--labels', JSON.stringify(['good first issue']), '--source', 'adoption'])
    assert.equal(d.out.route, 'escalate')
    assert.deepEqual(d.out.conditions, ['has:good first issue'])
    const r = t.run(['escalate', '--dir', t.dir, '--story', '7', '--boundary', boundary, ...gateArg(gate), '--source', 'adoption', '--conditions', JSON.stringify(d.out.conditions), '--repo', 'o/r'])
    assert.equal(r.code, 0, `${boundary}: ${JSON.stringify(r.out)}`)
    assert.equal(r.out.outcome, 'escalated')
    assert.equal(r.out.label.applied, true)
    assert.equal(r.out.comment.posted, true)
    assert.ok(t.state().inputs.some(i => i.includes('has:good first issue')), boundary)
  }
})

test('r2-2: complete at B2 under a spaced-label gate escalates (label + comment) instead of throwing', () => {
  const t = tracker({ labels: ['good first issue'], body: PREPARED })
  const r = t.run(['complete', '--dir', t.dir, '--story', '7', ...gateArg({ mode: 'when', has: ['good first issue'], lacks: [] }), '--source', 'adoption', '--repo', 'o/r'])
  assert.equal(r.out.reason, 'escalated-at-B2')
  assert.equal(r.out.escalation.label.applied, true)
  assert.equal(r.out.escalation.comment.posted, true)
})

test('r2-2: conditions stay inert text: control characters and backticks are still refused', () => {
  const g = JSON.stringify(NEVER)
  // the shared `conditionError` grammar: no shell fragment, 50-char host cap — not the looser own check
  for (const bad of ["has:x'y", 'a;b', 'lacks:a$(id)', 'a|b', 'x'.repeat(60)]) assert.throws(() => parseArgs(['escalate', '--dir', '.', '--story', '5', '--boundary', 'B1', '--gate', g, '--source', 's', '--conditions', JSON.stringify([bad])]), /--conditions/, bad)
  for (const ok of ['has:risk:red', 'lacks: needs triage', 'labels-unreadable']) assert.doesNotThrow(() => parseArgs(['escalate', '--dir', '.', '--story', '5', '--boundary', 'B1', '--gate', g, '--source', 's', '--conditions', JSON.stringify([ok])]), ok)
  for (const bad of ['a`b', 'a\nb', '']) assert.throws(() => parseArgs(['escalate', '--dir', '.', '--story', '5', '--boundary', 'B1', '--gate', g, '--source', 's', '--conditions', JSON.stringify([bad])]), /--conditions/)
})

// ── needs-review lifecycle ────────────────────────────────────────────────────────────────────────────────────────
test('r2-3: needs-review blocks an unattended pick whatever the readiness (Ready included); attended is never blocked', () => {
  for (const readiness of READINESS) {
    assert.equal(decide({ gate: NEVER, labels: ['needs-review'], readiness, attended: false, boundary: 'B0' }).route, 'skip-escalated', readiness)
    assert.notEqual(decide({ gate: NEVER, labels: ['needs-review'], readiness, attended: true, boundary: 'B0' }).route, 'skip-escalated', readiness)
  }
  assert.equal(decide({ gate: NEVER, labels: [], readiness: 'ready', attended: false, boundary: 'B0' }).route, 'nothing-to-prepare')
})

test('r2-3: an attended `complete` removes needs-review (read back); an unattended one never reaches Ready', () => {
  const f = fakeHosts({ body: PREPARED, labels: ['needs-review'] })
  f.hosts.pm.unlabelCard = a => {
    f.calls.push(['unlabelCard', a.label])
    f.state.labels = f.state.labels.filter(l => l !== a.label)
    return { removed: a.label, confirmed: true, error: null }
  }
  const out = complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument', attended: true })
  assert.equal(out.completed, true)
  assert.deepEqual(out.needsReview, { cleared: true })
  assert.deepEqual(f.state.labels, [])
  const g = fakeHosts({ body: PREPARED, labels: ['triaged'] })
  assert.equal(complete({ hosts: g.hosts, story: 7, gate: NEVER, source: 'argument', attended: true }).needsReview, undefined)
})

test('r2-3: the clearing through the real CLI path removes the label on the tracker; a refused removal never undoes Ready', () => {
  const t = tracker({ labels: ['needs-review', 'risk:green'], body: PREPARED })
  const r = t.run(['complete', '--dir', t.dir, '--story', '7', ...gateArg(NEVER), '--source', 'argument', '--repo', 'o/r', '--attended', 'true'])
  assert.equal(r.out.completed, true, JSON.stringify(r.out))
  assert.deepEqual(t.state().labels, ['risk:green'])
  const f = fakeHosts({ body: PREPARED, labels: ['needs-review'] })
  f.hosts.pm.unlabelCard = () => { throw new Error('forbidden') }
  const out = complete({ hosts: f.hosts, story: 7, gate: NEVER, source: 'argument', attended: true })
  assert.equal(out.completed, true)
  assert.equal(out.needsReview.cleared, false)
})

test('r2-3: both host adapters implement unlabelCard (PM side), with a read-back', () => {
  assert.ok(PM_METHODS.includes('unlabelCard'))
  const bin = fakeBin((args, st) => {
    if (args[1] === 'view') return JSON.stringify({ labels: st.removed ? [] : [{ name: 'needs-review' }] })
    if (args[1] === 'edit') st.removed = true
    return ''
  })
  const r = github.instantiate({ ghBin: bin }).unlabelCard({ id: 9, label: 'needs-review', repo: 'o/r' })
  assert.equal(r.confirmed, true)
  assert.ok(stateOf(bin).calls.some(c => c.join(' ').startsWith('issue edit 9 --remove-label needs-review')))
  const az = fakeBin((args, st) => {
    if (args.includes('update')) {
      st.tags = args[args.indexOf('--fields') + 1].replace('System.Tags=', '')
      return JSON.stringify({})
    }
    return JSON.stringify({ id: 9, fields: { 'System.Tags': st.tags ?? 'a; needs-review' } })
  })
  assert.equal(azure.instantiate({ azBin: az }).unlabelCard({ id: 9, label: 'needs-review' }).confirmed, true)
  assert.ok(stateOf(az).calls.some(c => c.includes('System.Tags=a')))
})

// ── open questions: what "answered" means ────────────────────────────────────────────────────────────────────────────
test('r2-6: an open question is an entry not ticked `- [x]` and not `none`; a written answer under a ticked entry no longer re-escalates', () => {
  const sec = t => `## Story\n\nx\n\n## Open Questions\n\n${t}\n\n## Notes\n\nn\n`
  assert.equal(openQuestionOf('## Story\n\nx\n'), undefined)
  assert.equal(openQuestionOf(sec('')), undefined)
  assert.equal(openQuestionOf(sec('- none')), undefined)
  assert.equal(openQuestionOf(sec('None')), undefined)
  // `none` is an answer only as the WHOLE entry (case-insensitive, optional trailing period).
  assert.equal(openQuestionOf(sec('- NONE.')), undefined)
  assert.equal(openQuestionOf(sec('none.')), undefined)
  const q = '- None of the current tiers fit enterprise users: which tier do they get? — product call'
  assert.equal(openQuestionOf(sec(q)), q)
  assert.equal(openQuestionOf(sec('None of the above?')), 'None of the above?')
  assert.equal(openQuestionOf(sec('- [x] Who pays?\n  Answer: the team (see ## Assumptions)')), undefined)
  assert.equal(openQuestionOf(sec('- [ ] Who pays?')), '- [ ] Who pays?')
  assert.equal(openQuestionOf(sec('- Who pays?')), '- Who pays?')
  assert.equal(openQuestionOf(sec('- [x] Done one\n- Still open\n  more detail')), '- Still open more detail')
})

// ── untrusted card text never travels through a shell line ───────────────────────────────────────────────────────────
const HOSTILE = `Is it $(touch /tmp/pwned-prepare) \`id\` won't it "quote"?`
test('r2-7: `escalate --openQuestionFromCard true` reads the question from the card itself — quotes, $(…) and backticks arrive verbatim', () => {
  const t = tracker({ body: `## Story\n\nx\n\n## Open Questions\n\n- ${HOSTILE}\n` })
  const r = t.run(['escalate', '--dir', t.dir, '--story', '7', '--boundary', 'B1', ...gateArg(NEVER), '--source', 'argument', '--openQuestionFromCard', 'true', '--repo', 'o/r'])
  assert.equal(r.code, 0, JSON.stringify(r.out))
  assert.equal(r.out.comment.posted, true)
  assert.ok(t.state().inputs.some(i => i && JSON.parse(i).body?.includes(HOSTILE)))
})

test('r2-7: --openQuestionFromCard on a card with no open question fails closed (exit 2), writing nothing', () => {
  const t = tracker({ body: '## Story\n\nx\n\n## Open Questions\n\n- [x] settled\n' })
  const r = t.run(['escalate', '--dir', t.dir, '--story', '7', '--boundary', 'B1', ...gateArg(NEVER), '--source', 'argument', '--openQuestionFromCard', 'true', '--repo', 'o/r'])
  assert.equal(r.code, 2)
  assert.match(r.out.error, /no open question/)
  assert.equal(t.state().calls.filter(c => c[0] === 'issue' && c[1] === 'edit').length, 0)
})

test('r2-7: `decide --story` reads the card\'s CURRENT labels itself (a label like `won\'t fix` needs no shell quoting)', () => {
  const t = tracker({ labels: ["won't fix", 'good first issue'] })
  const r = t.run(['decide', ...gateArg(when([], ['triaged'])), '--readiness', 'draft', '--attended', 'false', '--boundary', 'B0', '--dir', t.dir, '--story', '7', '--repo', 'o/r', '--source', 'adoption'])
  assert.equal(r.code, 0, JSON.stringify(r.out))
  assert.equal(r.out.route, 'escalate')
  assert.deepEqual(r.out.conditions, ['lacks:triaged'])
  const ok = tracker({ labels: ["won't fix", 'triaged'] })
  assert.equal(ok.run(['decide', ...gateArg(when([], ['triaged'])), '--readiness', 'draft', '--attended', 'false', '--boundary', 'B0', '--dir', ok.dir, '--story', '7', '--repo', 'o/r']).out.route, 'run-autonomous')
  assert.throws(() => parseArgs(['decide', ...gateArg(NEVER), '--readiness', 'draft', '--attended', 'false', '--boundary', 'B0', '--story', '7', '--labels', '[]']), /mutually exclusive/)
})

// ── run-dir / story / repo guard: a write for --story never lands in a repo the run does not belong to ─────────
const ESC_ARGS = (dir, extra = []) => ['escalate', '--dir', dir, '--story', '7', '--boundary', 'B1', ...gateArg(NEVER), '--source', 'argument', '--conditions', '["x"]', ...extra]
const COMPLETE_ARGS = (dir, extra = []) => ['complete', '--dir', dir, '--story', '7', ...gateArg(NEVER), '--source', 'argument', '--refinedAutonomously', 'false', ...extra]
function runDirAt(name, handoffs = []) {
  const root = mkdtempSync(join(tmpdir(), 'prep-guard-'))
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.host-binding.json'), JSON.stringify({ schemaVersion: 1, pmTool: 'github', codeHost: 'github' }))
  handoffs.forEach((h, i) => writeFileSync(join(dir, `a${i}-r0.json`), JSON.stringify(h)))
  return dir
}
test('guard: escalate/complete refuse a run dir that does not belong to --story — exit non-zero, no host call', () => {
  for (const mk of [() => runDirAt('8'), () => runDirAt('story-x', [{ story: '8' }]), () => runDirAt('anything')]) {
    for (const args of [ESC_ARGS, COMPLETE_ARGS]) {
      const t = tracker({ body: HUMAN_REFINED })
      const r = t.run(args(mk()))
      assert.notEqual(r.code, 0)
      assert.match(r.out.error, /run dir/)
      assert.equal(t.state().calls.length, 0)
    }
  }
})
test('guard: a dir named for the story, or whose handoffs carry the story, is accepted', () => {
  for (const dir of [runDirAt('7'), runDirAt('weird', [{ story: '7' }, { story: 7 }])]) {
    const t = tracker({ body: HUMAN_REFINED })
    const r = t.run(ESC_ARGS(dir))
    assert.equal(r.code, 0, JSON.stringify(r.out))
  }
})
test('guard: a recorded run repo that differs from --repo is refused with no write; a matching one proceeds', () => {
  const t = tracker({ body: HUMAN_REFINED })
  const bad = t.run(ESC_ARGS(runDirAt('7', [{ story: '7', repo: 'other/repo' }]), ['--repo', 'o/r']))
  assert.notEqual(bad.code, 0)
  assert.match(bad.out.error, /repo/)
  assert.equal(t.state().calls.length, 0)
  assert.equal(t.run(ESC_ARGS(runDirAt('7', [{ story: '7', repo: 'o/r' }]), ['--repo', 'o/r'])).code, 0)
})
