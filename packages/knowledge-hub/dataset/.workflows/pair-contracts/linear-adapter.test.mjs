// US-577: the Linear PM adapter (scripts/host/linear.mjs) — every GraphQL call answered by a recorder
// `curl` stub over recorded response shapes (fixtures/linear/), no network.
// RUNS FROM `.claude/workflows` ONLY (like host-adapter.test.mjs).
for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bindHosts, resolveHosts, implementedHosts } from '../../skills/pair-workflow-cycle/scripts/host/index.mjs'
import linear from '../../skills/pair-workflow-cycle/scripts/host/linear.mjs'

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'linear')
const SECRET = 'lin_api_SENTINEL_never_echo_1234567890'
const WOW = '- `pm-tool`: `linear`\n- `linear-team`: `ENG`\n\n## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Todo | Ready |\n| In Progress | In Progress |\n| Done | Done |\n\n## Git Workflow\n\n- `code-host`: `github`\n'

function fake({ token = SECRET, limited = 0, wayOfWorking = WOW } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'linear-'))
  const world = join(dir, 'world.json')
  const log = join(dir, 'log.jsonl')
  const lim = join(dir, '429')
  copyFileSync(join(FIX, 'world.json'), world)
  writeFileSync(log, '')
  writeFileSync(lim, String(limited))
  const curlBin = join(dir, 'curl')
  writeFileSync(curlBin, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(FIX, 'fake-linear.mjs'))} "$@"\n`)
  chmodSync(curlBin, 0o755)
  Object.assign(process.env, { FAKE_LINEAR_WORLD: world, FAKE_LINEAR_LOG: log, FAKE_LINEAR_429_FILE: lim })
  if (token === null) delete process.env.LINEAR_API_KEY
  else process.env.LINEAR_API_KEY = token
  const pm = linear.instantiate({ curlBin, wayOfWorking, retryDelayMs: 0 })
  const calls = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
  const issue = id => JSON.parse(readFileSync(world, 'utf8')).issues.find(i => i.identifier === id)
  const labels = list => {
    const w = JSON.parse(readFileSync(world, 'utf8'))
    w.labels = [...w.labels.filter(l => l.name !== 'needs-review'), ...list]
    writeFileSync(world, JSON.stringify(w))
  }
  return { pm, calls, issue, labels }
}

test('AC1: pm-tool linear binds linear.mjs on the PM side and github on the code side, with every PM method', () => {
  assert.ok(implementedHosts().includes('linear'))
  const r = resolveHosts({ text: WOW })
  assert.deepEqual([r.pmTool, r.codeHost], ['linear', 'github'])
  const h = bindHosts({ binding: r, transport: { wayOfWorking: WOW } })
  assert.deepEqual([h.pm.errorPrefix, h.code.errorPrefix], ['linear', 'gh'])
  for (const m of ['readCard', 'cardHash', 'closeAndCascade', 'parseCardRef', 'findCards', 'readLabels', 'setBoardState', 'labelCard', 'unlabelCard', 'commentOnCard', 'createCard', 'updateCard']) assert.equal(typeof fake().pm[m], 'function', m)
  assert.deepEqual(resolveHosts({ text: '- `pm-tool`: `linear`\n' }).codeHost, null, 'linear alone hosts no code')
  assert.throws(() => fake().pm.prHead({ pr: 1 }), e => e.kind === 'unsupported')
})

test('AC2: parseCardRef accepts <TEAM>-<n> and linear.app issue URLs; anything else is invalid-input', () => {
  const { pm } = fake()
  assert.deepEqual(pm.parseCardRef('ENG-123'), { id: 'ENG-123', number: 'ENG-123', inScope: true })
  assert.equal(pm.parseCardRef('eng-7').id, 'ENG-7')
  assert.equal(pm.parseCardRef('https://linear.app/acme/issue/ENG-42/some-title').id, 'ENG-42')
  assert.equal(pm.parseCardRef('https://linear.app/acme/issue/ENG-42').id, 'ENG-42')
  assert.equal(pm.parseCardRef('OPS-1').inScope, false, 'another team parses, out of scope')
  for (const bad of ['123', '#572', 'ENG', 'ENG-', '-1', 'ENG-1a', 'ENG 1', '../ENG-1', 'https://linear.app/acme/project/ENG-1', 'https://evil.example/acme/issue/ENG-1', '']) assert.throws(() => pm.parseCardRef(bad), e => e.kind === 'invalid-input', bad)
})

test('AC3: setBoardState writes the team workflow state, macrostate resolved through ## State Mapping, read back', () => {
  const { pm, issue } = fake()
  assert.deepEqual(pm.setBoardState({ id: 'ENG-2', state: 'In Progress' }), { applied: 'In Progress', confirmed: true, error: null })
  assert.equal(issue('ENG-2').state, 'In Progress')
  assert.equal(pm.setBoardState({ id: 'ENG-2', state: 'Ready' }).applied, 'Todo', 'macrostate Ready → board Todo')
  assert.equal(issue('ENG-2').state, 'Todo')
  const miss = pm.setBoardState({ id: 'ENG-2', state: 'In Review' })
  assert.equal(miss.confirmed, false)
  assert.match(miss.error, /team ENG has no workflow state "In Review"/)
})

test('edge: an unmapped Linear state is read as a plain board name (out of process), never an error', () => {
  const { pm } = fake()
  assert.deepEqual(pm.readCard('ENG-4', { fields: ['state', 'projectItems'] }), { state: 'OPEN', projectItems: [{ status: { name: 'Triage' } }] })
})

test('AC4: closeAndCascade moves to Done; the parent closes only when every sub-issue is Done', () => {
  const { pm, issue } = fake()
  assert.deepEqual(pm.closeAndCascade({ id: 'ENG-2' }), { closed: ['ENG-2'], stoppedAt: 'ENG-1' })
  assert.equal(issue('ENG-1').state, 'In Progress', 'open sibling ENG-3 keeps the parent open')
  assert.deepEqual(pm.closeAndCascade({ id: 'ENG-3' }), { closed: ['ENG-3', 'ENG-1'], stoppedAt: null })
  assert.equal(issue('ENG-1').state, 'Done')
  assert.deepEqual(pm.readCard('ENG-1', { fields: ['state', 'stateReason'] }), { state: 'CLOSED', stateReason: 'COMPLETED' })
})

test('AC5: no LINEAR_API_KEY ⇒ host-unconfigured naming it, nothing sent; the key never surfaces in argv, output or errors', () => {
  const none = fake({ token: null })
  assert.throws(() => none.pm.readCard('ENG-2'), e => e.kind === 'host-unconfigured' && /LINEAR_API_KEY/.test(e.message))
  assert.equal(none.calls().length, 0, 'curl never ran')
  const { pm, calls } = fake()
  const out = [pm.readCard('ENG-2', { fields: ['title', 'body', 'url'] }), pm.setBoardState({ id: 'ENG-2', state: 'Done' }), pm.commentOnCard({ id: 'ENG-2', marker: '<!-- m -->', body: 'b' })]
  let err
  try {
    pm.readCard('ENG-404')
  } catch (e) {
    err = e
  }
  assert.ok(err && !`${err.message}${err.detail}${err.command}`.includes(SECRET))
  assert.ok(!JSON.stringify(out).includes(SECRET))
  assert.ok(calls().every(c => !c.args.some(a => a.includes(SECRET))), 'never an argv element')
  assert.ok(calls().every(c => c.auth), 'the key reaches curl as the Authorization header, through fd 3')
  assert.ok(!readFileSync(fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/host/linear.mjs', import.meta.url)), 'utf8').includes('process.env.LINEAR_API_KEY'), 'never read into JS')
})

test('edge: rate limit ⇒ one bounded retry, then failed:linear-rate-limited', () => {
  const once = fake({ limited: 1 })
  assert.equal(once.pm.readCard('ENG-2', { fields: ['title'] }).title, 'Login')
  assert.equal(once.calls().length, 2)
  const twice = fake({ limited: 2 })
  assert.throws(() => twice.pm.readCard('ENG-2'), e => e.kind === 'failed' && e.detail === 'linear-rate-limited')
  assert.equal(twice.calls().length, 2, 'exactly one retry')
})

test('edge: an issue of another team than the binding is refused naming both teams', () => {
  const { pm, calls } = fake()
  for (const call of [() => pm.readCard('OPS-1'), () => pm.updateCard({ id: 'OPS-1', body: 'x' }), () => pm.closeAndCascade({ id: 'OPS-1' })]) assert.throws(call, e => e.kind === 'invalid-input' && /OPS-1 belongs to team OPS, not the bound team ENG/.test(e.message))
  assert.equal(calls().length, 0)
})

test('T-2: readCard/cardHash, findCards, createCard, updateCard, labels and marker-keyed comments on the recorded shapes', () => {
  const { pm, issue } = fake()
  assert.deepEqual(pm.readCard('ENG-2', { fields: ['number', 'title', 'labels', 'state', 'url'] }), { number: 'ENG-2', title: 'Login', labels: [{ name: 'risk:yellow' }], state: 'OPEN', url: 'https://linear.app/acme/issue/ENG-2/login' })
  const h = pm.cardHash('ENG-2')
  assert.match(h, /^sha256:[0-9a-f]{64}$/)
  pm.setBoardState({ id: 'ENG-2', state: 'In Progress' })
  assert.equal(pm.cardHash('ENG-2'), h, 'a state write never changes the hash')
  assert.deepEqual(pm.findCards({ search: '<!-- pair:scope-decision:0123456789abcdef0123456789abcdef -->' }).map(c => c.number), ['ENG-2'])
  const made = pm.createCard({ title: 'New', body: 'b' })
  assert.deepEqual(made, { url: 'https://linear.app/acme/issue/ENG-5/new', number: 'ENG-5' })
  assert.equal(pm.parseCardRef(made.url).id, 'ENG-5')
  pm.updateCard({ id: 'ENG-5', body: 'b2' })
  assert.equal(issue('ENG-5').description, 'b2')
  assert.deepEqual(pm.labelCard({ id: 'ENG-2', label: 'needs-review' }), { applied: 'needs-review', confirmed: true, error: null })
  assert.deepEqual(pm.readLabels({ id: 'ENG-2' }), ['risk:yellow', 'needs-review'])
  assert.deepEqual(pm.unlabelCard({ id: 'ENG-2', label: 'needs-review' }), { removed: 'needs-review', confirmed: true, error: null })
  assert.match(pm.labelCard({ id: 'ENG-2', label: 'nope' }).error, /no Linear label "nope"/)
  assert.equal(pm.commentOnCard({ id: 'ENG-2', marker: '<!-- pair:pr -->', body: 'PR #1' }).action, 'created')
  assert.equal(pm.commentOnCard({ id: 'ENG-2', marker: '<!-- pair:pr -->', body: 'PR #2' }).action, 'updated')
  assert.equal(pm.commentOnCard({ id: 'ENG-2', marker: '<!-- pair:pr -->', body: 'PR #2' }).action, 'unchanged')
  assert.deepEqual(issue('ENG-2').comments.map(c => c.body), ['<!-- pair:pr -->\nPR #2'])
  assert.throws(() => fake({ wayOfWorking: '- `pm-tool`: `linear`\n' }).pm.createCard({ title: 't', body: 'b' }), e => e.kind === 'unsupported' && /linear-team/.test(e.message))
})

test('r0-1 W1: same-name labels scoped to OPS (first) and ENG ⇒ labelCard on an ENG issue adds the ENG label, confirmed', () => {
  const { pm, calls, issue, labels } = fake()
  labels([{ id: 'lb-ops-review', name: 'needs-review', team: 'OPS' }, { id: 'lb-eng-review', name: 'needs-review', team: 'ENG' }])
  assert.deepEqual(pm.labelCard({ id: 'ENG-2', label: 'needs-review' }), { applied: 'needs-review', confirmed: true, error: null })
  assert.deepEqual(calls().filter(c => c.op === 'PairAddLabel').map(c => c.variables.labelId), ['lb-eng-review'])
  assert.ok(issue('ENG-2').labels.includes('needs-review'))
})

test('r0-1 B1: the name exists only as another team\'s label ⇒ "no Linear label", never an add of the foreign id', () => {
  const { pm, calls, labels } = fake()
  labels([{ id: 'lb-ops-review', name: 'needs-review', team: 'OPS' }])
  const r = pm.labelCard({ id: 'ENG-2', label: 'needs-review' })
  assert.equal(r.confirmed, false)
  assert.match(r.error, /no Linear label "needs-review"/)
  assert.equal(calls().filter(c => c.op === 'PairAddLabel').length, 0)
})

test('r0-1 C1: a workspace label and an ENG-first pair both resolve to an addable label (controls)', () => {
  for (const list of [[{ id: 'lb-ws-review', name: 'needs-review' }], [{ id: 'lb-eng-review', name: 'needs-review', team: 'ENG' }, { id: 'lb-ops-review', name: 'needs-review', team: 'OPS' }]]) {
    const { pm, labels } = fake()
    labels(list)
    assert.deepEqual(pm.labelCard({ id: 'ENG-2', label: 'needs-review' }), { applied: 'needs-review', confirmed: true, error: null })
    assert.deepEqual(pm.unlabelCard({ id: 'ENG-2', label: 'needs-review' }), { removed: 'needs-review', confirmed: true, error: null })
  }
})
