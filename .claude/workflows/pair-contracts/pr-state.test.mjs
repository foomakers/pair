// Tests for pr-state.mjs — the final reviewer concludes the required `pair-review` commit status and
// synthesizes the `pr-state:*` label (T-9 fourth round, t9d-24). `gh` is the transport; a recorder
// stands in for it on PATH so the exact REST calls (status POST, label swap, read-back) are proven.
// The network boundary itself (GitHub) is exercised by the live canary, never stubbed here as proof.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { conclusionOf, stateLabelOf } from '../../skills/pair-workflow-review-phase/scripts/pr-state.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-review-phase/scripts/pr-state.mjs', import.meta.url))
const SHA = 'c'.repeat(40)

test('pr-state.mjs ships byte-identical inside review-phase (installed and dataset)', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  assert.equal(read('../../../packages/knowledge-hub/dataset/.skills/workflow/review-phase/scripts/pr-state.mjs'), read('../../skills/pair-workflow-review-phase/scripts/pr-state.mjs'), 'dataset copy drifted')
})

test('the verdict → check conclusion / state label mapping is the KB one (pr-state.sh review_check_conclusion + resolve_pr_state): approved ⇒ success + ready-to-merge, changes-requested ⇒ failure + not-approved, anything else ⇒ pending / nothing', () => {
  assert.deepEqual([conclusionOf('approved'), stateLabelOf('approved')], ['success', 'pr-state:ready-to-merge'])
  assert.deepEqual([conclusionOf('changes-requested'), stateLabelOf('changes-requested')], ['failure', 'pr-state:not-approved'])
  for (const v of ['pending', 'APPROVED', '', undefined, 'tech-debt']) assert.deepEqual([conclusionOf(v), stateLabelOf(v)], ['pending', null], String(v))
})

// A `gh api` recorder: labels and statuses live in a state file, every call is logged, and the two
// refusals the live host can answer (no `repo:status` scope, labels never provisioned) are switchable.
function fakeGh({ labels = [], refuseStatus = false, refuseLabels = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gh-state-'))
  const state = join(dir, 'state.json')
  const log = join(dir, 'calls.log')
  writeFileSync(state, JSON.stringify({ labels, statuses: [] }))
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n')
const st = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const save = () => fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(st))
const path = args.find(a => /^repos\\//.test(a))
const method = args.includes('-X') ? args[args.indexOf('-X') + 1] : 'GET'
const field = k => { const i = args.findIndex(a => a === '-f' && args[a === '-f' ? 0 : 0] !== undefined) ; for (let j = 0; j < args.length; j++) if (args[j] === '-f' && args[j + 1].startsWith(k + '=')) return args[j + 1].slice(k.length + 1); return undefined }
if (/\\/statuses\\//.test(path)) {
  if (${refuseStatus}) { process.stderr.write('HTTP 403: Resource not accessible by personal access token'); process.exit(1) }
  st.statuses.push({ sha: path.split('/').pop(), state: field('state'), context: field('context'), description: field('description') }); save()
  process.stdout.write(JSON.stringify({ id: 1, state: field('state'), context: field('context') })); process.exit(0)
}
if (/\\/commits\\/[0-9a-f]+\\/status$/.test(path)) { process.stdout.write(JSON.stringify({ statuses: st.statuses })); process.exit(0) }
if (/\\/labels(\\/|$)/.test(path)) {
  if (${refuseLabels}) { process.stderr.write('HTTP 404: Not Found'); process.exit(1) }
  if (method === 'GET') { process.stdout.write(JSON.stringify(st.labels.map(n => ({ name: n })))); process.exit(0) }
  if (method === 'DELETE') { const n = decodeURIComponent(path.split('/labels/')[1]); st.labels = st.labels.filter(x => x !== n); save(); process.stdout.write('[]'); process.exit(0) }
  if (method === 'POST') { const body = JSON.parse(fs.readFileSync(0, 'utf8')); for (const n of body.labels) if (!st.labels.includes(n)) st.labels.push(n); save(); process.stdout.write(JSON.stringify(st.labels.map(n => ({ name: n })))); process.exit(0) }
}
process.stderr.write('unexpected gh call: ' + args.join(' ')); process.exit(1)
`)
  chmodSync(join(dir, 'gh'), 0o755)
  return { dir, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []), state: () => JSON.parse(readFileSync(state, 'utf8')) }
}
const run = (fake, ...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${fake.dir}:${process.env.PATH}` } })
const out = r => JSON.parse(r.stdout.trim().split('\n').pop())

test('conclude approved: ONE `pair-review` success status on the exact sha, `pr-state:ready-to-merge` applied, every other pr-state:* removed, labels read back — exit 0', () => {
  const fake = fakeGh({ labels: ['risk:green', 'pr-state:to-be-reviewed'] })
  const r = run(fake, 'conclude', '--pr', '7', '--sha', SHA, '--verdict', 'approved', '--repo', 'foomakers/pair', '--description', 'APPROVED on r1 — 0 blocking findings')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const o = out(r)
  assert.deepEqual(o.check, { context: 'pair-review', sha: SHA, state: 'success', published: true, error: null })
  assert.deepEqual({ applied: o.label.applied, removed: o.label.removed, confirmed: o.label.confirmed }, { applied: 'pr-state:ready-to-merge', removed: ['pr-state:to-be-reviewed'], confirmed: true })
  const st = fake.state()
  assert.deepEqual(st.statuses, [{ sha: SHA, state: 'success', context: 'pair-review', description: 'APPROVED on r1 — 0 blocking findings' }])
  assert.deepEqual(st.labels.sort(), ['pr-state:ready-to-merge', 'risk:green'])
  const statusCall = fake.calls().find(c => c.some(a => /\/statuses\//.test(a)))
  assert.ok(statusCall.includes('POST') && statusCall.some(a => a === `repos/foomakers/pair/statuses/${SHA}`), JSON.stringify(statusCall))
})

test('conclude changes-requested: `pair-review` failure + `pr-state:not-approved`; a 141+ char description is capped at 140 (API limit)', () => {
  const fake = fakeGh({ labels: ['pr-state:ready-to-merge'] })
  const r = run(fake, 'conclude', '--pr', '7', '--sha', SHA, '--verdict', 'changes-requested', '--repo', 'foomakers/pair', '--description', 'x'.repeat(200))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const o = out(r)
  assert.equal(o.check.state, 'failure')
  assert.equal(o.label.applied, 'pr-state:not-approved')
  assert.deepEqual(fake.state().labels, ['pr-state:not-approved'])
  assert.equal(fake.state().statuses[0].description.length, 140)
})

test('a verdict that is not a decision publishes NOTHING — the pending status stays, the merge stays blocked (exit 2, usage)', () => {
  const fake = fakeGh({ labels: ['pr-state:to-be-reviewed'] })
  const r = run(fake, 'conclude', '--pr', '7', '--sha', SHA, '--verdict', 'pending', '--repo', 'foomakers/pair')
  assert.equal(r.status, 2)
  assert.match(out(r).error, /not a decision/)
  assert.equal(fake.calls().length, 0, 'no call reached gh')
  assert.equal(run(fake, 'conclude', '--pr', '7', '--sha', 'not-a-sha', '--verdict', 'approved').status, 2)
})

test('degradation is reported, never faked: a status POST the token cannot make ⇒ check.published=false with the error, the label is still synthesized (advisory, exit 0); labels never provisioned ⇒ label.confirmed=false, the check still lands (exit 0); both refused ⇒ exit 1', () => {
  const noScope = fakeGh({ labels: ['pr-state:to-be-reviewed'], refuseStatus: true })
  let r = run(noScope, 'conclude', '--pr', '7', '--sha', SHA, '--verdict', 'approved', '--repo', 'foomakers/pair')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  let o = out(r)
  assert.equal(o.check.published, false)
  assert.match(o.check.error, /403/)
  assert.deepEqual({ applied: o.label.applied, confirmed: o.label.confirmed }, { applied: 'pr-state:ready-to-merge', confirmed: true })
  assert.equal(o.advisory, true)
  const noLabels = fakeGh({ refuseLabels: true })
  r = run(noLabels, 'conclude', '--pr', '7', '--sha', SHA, '--verdict', 'approved', '--repo', 'foomakers/pair')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  o = out(r)
  assert.equal(o.check.published, true)
  assert.equal(o.label.confirmed, false)
  assert.match(o.label.error, /404/)
  const both = fakeGh({ refuseStatus: true, refuseLabels: true })
  r = run(both, 'conclude', '--pr', '7', '--sha', SHA, '--verdict', 'approved', '--repo', 'foomakers/pair')
  assert.equal(r.status, 1)
})

test('conclude is idempotent: the same conclusion on a head that already carries it changes nothing and reports `unchanged`; find is read-only', () => {
  const fake = fakeGh({ labels: ['pr-state:ready-to-merge'] })
  writeFileSync(join(fake.dir, 'state.json'), JSON.stringify({ labels: ['pr-state:ready-to-merge'], statuses: [{ sha: SHA, state: 'success', context: 'pair-review', description: 'd' }] }))
  const f = run(fake, 'find', '--pr', '7', '--sha', SHA, '--repo', 'foomakers/pair')
  assert.equal(f.status, 0, f.stdout + f.stderr)
  assert.deepEqual(out(f), { check: 'success', label: 'pr-state:ready-to-merge' })
  const r = run(fake, 'conclude', '--pr', '7', '--sha', SHA, '--verdict', 'approved', '--repo', 'foomakers/pair')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(out(r).action, 'unchanged')
  assert.equal(fake.calls().filter(c => c.includes('POST') || c.includes('DELETE')).length, 0, 'nothing written twice')
})
