// Tests for the autonomous PREPARE phase's decision + writers (US-523 T-2, T-5): the full decision
// table, the `always` safety property, fail-closed inputs, and the escalate / complete writers over a
// fake host. RUNS FROM `.claude/workflows` ONLY (the dataset copy's `../../skills/...` imports resolve nowhere).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { decide, escalate, complete, parseArgs, assumptionsSection, escalationBody, ESCALATION_MARKER, ROUTES, BOUNDARIES, READINESS } from '../../skills/pair-workflow-cycle/scripts/cycle-prepare.mjs'
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
  if (readiness === 'ready') return 'nothing-to-prepare'
  if (!attended && labels.includes('needs-review')) return 'skip-escalated'
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
const PREPARED = '## Story\n\nx\n\n## Assumptions\n\n- **Q**: scope? **A**: yes. Evidence: code. Overturn: edit.\n\n## Notes\n\nPrepared autonomously under prepare: never (argument) — ADR-028\n'

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
    ['## Story\n\nx\n', /assumptions-missing/],
    ['## Assumptions\n\n## Notes\n\nPrepared autonomously under prepare: never (argument)\n', /assumptions-missing/],
    ['## Assumptions\n\n- A: b\n', /provenance-missing/],
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

import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
const h = ${handler.toString()}
let out = ''
let err = null
try { out = h(args, st) ?? '' } catch (e) { err = e }
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
