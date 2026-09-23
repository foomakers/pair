// Tests for the PM/code-host adapter (US-492): scripts/host/ — the interface, the shared card-hash
// canonicalization, the GitHub extraction's new methods, the Azure DevOps adapter, resolution and
// the once-per-coordinator binding, the host-unsupported HALT, CLI-first and credential guards, the
// host-literal grep over the cycle scripts, and the extension guide's worked example.
// Every host CLI here is a RECORDER stub on a path of its own — no live GitHub or Azure DevOps call.
// RUNS FROM `.claude/workflows` ONLY (t9d-31): the dataset copy is byte-identical, but its
// `../../skills/pair-workflow-*` imports resolve nowhere in the dataset tree.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  INTERFACE_METHODS,
  REQUIRED_METHODS,
  canonicalCardHash,
  defineAdapter,
  implementedHosts,
  resolveHosts,
  bindHosts,
  writeBinding,
  loadAdapters,
  BINDING_FILE,
} from '../../skills/pair-workflow-review-phase/scripts/host/index.mjs'
import github from '../../skills/pair-workflow-review-phase/scripts/host/github.mjs'
import azure from '../../skills/pair-workflow-review-phase/scripts/host/azure-devops.mjs'
import { cardHash, applyScopeDecisions, publish, scopeBaselineHashOf } from '../../skills/pair-workflow-review-phase/scripts/cycle-state.mjs'
import { createHash } from 'node:crypto'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const HOST_DIR = join(REPO, '.claude', 'skills', 'pair-workflow-review-phase', 'scripts', 'host')
const CYCLE_STATE = join(REPO, '.claude', 'skills', 'pair-workflow-cycle', 'scripts', 'cycle-state.mjs')
const PR_STATE = join(REPO, '.claude', 'skills', 'pair-workflow-review-phase', 'scripts', 'pr-state.mjs')
const PR_COMMENT = join(REPO, '.claude', 'skills', 'pair-workflow-review-phase', 'scripts', 'pr-comment.mjs')
const SKILLS = ['cycle', 'green-fix', 'implement-phase', 'red-spec', 'red-verify', 'review-phase']
const SHA = 'a'.repeat(40)
const SHA2 = 'b'.repeat(40)

// ── recorder stubs ────────────────────────────────────────────────────────────────────────────
// A stateful `az` recorder: work items, PRs (threads, statuses, labels, iterations) in a JSON file;
// every argv logged. It answers the exact `az boards` / `az repos` / `az devops invoke` shapes.
function fakeAz(seed = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'az-fake-'))
  const state = join(dir, 'state.json')
  const log = join(dir, 'calls.log')
  writeFileSync(state, JSON.stringify({ workItems: {}, prs: {}, next: 500, ...seed }))
  writeFileSync(log, '')
  writeFileSync(
    join(dir, 'az'),
    `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: a, env: Object.keys(process.env).filter(k => /TOKEN|PAT/.test(k)) }) + '\\n')
const S = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const save = () => fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(S))
const opt = k => { const i = a.indexOf(k); return i === -1 ? undefined : a[i + 1] }
const out = v => { process.stdout.write(JSON.stringify(v)); process.exit(0) }
const wiOut = id => { const w = S.workItems[id]; if (!w) { process.stderr.write('TF401232: work item ' + id + ' does not exist'); process.exit(1) } return { id: Number(id), url: 'https://dev.azure.com/acme/_apis/wit/workItems/' + id, fields: w.fields, relations: w.relations || [] } }
if (a[0] === 'boards' && a[1] === 'work-item' && a[2] === 'show') out(wiOut(opt('--id')))
if (a[0] === 'boards' && a[1] === 'work-item' && a[2] === 'update') {
  const w = S.workItems[opt('--id')]; if (!w) { process.stderr.write('TF401232'); process.exit(1) }
  if (opt('--state') !== undefined) w.fields['System.State'] = opt('--state')
  if (opt('--description') !== undefined) w.fields['System.Description'] = opt('--description')
  save(); out(wiOut(opt('--id')))
}
if (a[0] === 'boards' && a[1] === 'work-item' && a[2] === 'create') {
  const id = String(S.next++)
  S.workItems[id] = { fields: { 'System.Title': opt('--title'), 'System.Description': opt('--description'), 'System.TeamProject': opt('--project'), 'System.WorkItemType': opt('--type'), 'System.State': 'New' } }
  save(); out(wiOut(id))
}
if (a[0] === 'boards' && a[1] === 'query') {
  const w = opt('--wiql'); const needle = /CONTAINS '((?:[^']|'')*)'$/.exec(w)[1].replace(/''/g, "'")
  out(Object.entries(S.workItems).filter(([, x]) => String(x.fields['System.Description'] || '').includes(needle)).map(([id]) => wiOut(id)))
}
const pr = n => { const p = S.prs[n]; if (!p) { process.stderr.write('TF401180: pull request ' + n + ' not found'); process.exit(1) } return p }
if (a[0] === 'repos' && a[1] === 'pr' && a[2] === 'show') { const p = pr(opt('--id')); out({ pullRequestId: Number(opt('--id')), lastMergeSourceCommit: { commitId: p.head }, repository: { webUrl: 'https://dev.azure.com/acme/Proj/_git/app' }, status: p.status || 'active' }) }
if (a[0] === 'repos' && a[1] === 'pr' && a[2] === 'update') { const p = pr(opt('--id')); p.status = opt('--status'); p.squash = opt('--squash'); p.message = opt('--merge-commit-message'); save(); out({ status: p.status }) }
if (a[0] === 'devops' && a[1] === 'invoke') {
  const i = a.indexOf('--route-parameters'); const route = {}
  for (let j = i + 1; j < a.length && !a[j].startsWith('--'); j++) { const [k, ...v] = a[j].split('='); route[k] = v.join('=') }
  const res = opt('--resource'); const m = opt('--http-method'); const f = opt('--in-file'); const body = f ? JSON.parse(fs.readFileSync(f, 'utf8')) : undefined
  if (route.project !== 'Proj' || route.repositoryId !== 'app') { process.stderr.write('TF401019: repository not found'); process.exit(1) }
  const p = pr(route.pullRequestId)
  p.threads = p.threads || []; p.statuses = p.statuses || []; p.labels = p.labels || []
  if (res === 'pullRequestThreads' && m === 'GET' && route.threadId) { const t = p.threads.find(t => String(t.id) === route.threadId); if (!t) { process.stderr.write('404'); process.exit(1) } out(t) }
  if (res === 'pullRequestThreads' && m === 'GET') out({ value: p.threads, count: p.threads.length })
  if (res === 'pullRequestThreads' && m === 'POST') { const t = { id: S.next++, comments: [{ id: 1, content: body.comments[0].content, author: { uniqueName: 'bot@acme.test', descriptor: 'aad.bot' } }] }; p.threads.push(t); save(); out(t) }
  if (res === 'pullRequestThreadComments' && m === 'PATCH') { const t = p.threads.find(t => String(t.id) === route.threadId); const c = t.comments.find(c => String(c.id) === route.commentId); c.content = body.content; save(); out(c) }
  if (res === 'pullRequestIterations') out({ value: (p.iterations || []).map((sha, k) => ({ id: k + 1, sourceRefCommit: { commitId: sha } })) })
  if (res === 'pullRequestStatuses' && m === 'GET') out({ value: p.statuses })
  if (res === 'pullRequestStatuses' && m === 'POST') { if (p.refuseStatus) { process.stderr.write('TF401027: permission'); process.exit(1) } p.statuses.push({ id: p.statuses.length + 1, ...body }); save(); out(body) }
  if (res === 'pullRequestLabels' && m === 'GET') out({ value: p.labels.map(name => ({ name, active: true })) })
  if (res === 'pullRequestLabels' && m === 'POST') { p.labels.push(body.name); save(); out({ name: body.name }) }
  if (res === 'pullRequestLabels' && m === 'DELETE') { p.labels = p.labels.filter(l => l !== decodeURIComponent(route.labelIdOrName)); save(); process.exit(0) }
}
process.stderr.write('unexpected az call: ' + a.join(' ')); process.exit(3)
`,
  )
  chmodSync(join(dir, 'az'), 0o755)
  const read = () => JSON.parse(readFileSync(state, 'utf8'))
  return {
    dir,
    azBin: join(dir, 'az'),
    state: read,
    calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)),
  }
}

// A minimal stateful `gh` recorder for the three methods GitHub gained (prHead, merge, closeAndCascade)
// and the card read the shared hash consumes.
function fakeGh(seed = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gh-fake-'))
  const state = join(dir, 'state.json')
  const log = join(dir, 'calls.log')
  writeFileSync(state, JSON.stringify({ issues: {}, prs: {}, ...seed }))
  writeFileSync(log, '')
  writeFileSync(
    join(dir, 'gh'),
    `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n')
const S = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const save = () => fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(S))
if (a[0] === 'issue' && a[1] === 'view') { const i = S.issues[a[2]]; if (!i) { process.stderr.write('Could not resolve to an issue'); process.exit(1) } process.stdout.write(i.body); process.exit(0) }
if (a[0] === 'issue' && a[1] === 'close') { S.issues[a[2]].state = 'closed'; save(); process.exit(0) }
if (a[0] === 'pr' && a[1] === 'view') { process.stdout.write(S.prs[a[2]].head + '\\n'); process.exit(0) }
if (a[0] === 'pr' && a[1] === 'merge') { S.prs[a[2]].merged = a.slice(3); save(); process.exit(0) }
if (a[0] === 'api') {
  const m = /issues\\/(\\d+)\\/(parent|sub_issues)$/.exec(a[1])
  if (m && m[2] === 'parent') { const p = S.issues[m[1]].parent; if (!p) { process.stderr.write('gh: Not Found (HTTP 404)'); process.exit(1) } process.stdout.write(JSON.stringify({ number: p })); process.exit(0) }
  if (m && m[2] === 'sub_issues') { process.stdout.write(JSON.stringify(Object.entries(S.issues).filter(([, i]) => i.parent === Number(m[1])).map(([n, i]) => ({ number: Number(n), state: i.state || 'open' })))); process.exit(0) }
}
process.stderr.write('unexpected gh call: ' + a.join(' ')); process.exit(3)
`,
  )
  chmodSync(join(dir, 'gh'), 0o755)
  return { dir, ghBin: join(dir, 'gh'), state: () => JSON.parse(readFileSync(state, 'utf8')), calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) }
}

const wowDir = text => {
  const root = mkdtempSync(join(tmpdir(), 'wow-'))
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'), text)
  const runDir = join(root, '.pair', 'working', 'runs', 'story-9', '9')
  mkdirSync(runDir, { recursive: true })
  return { root, runDir, wow: join(root, '.pair', 'adoption', 'tech', 'way-of-working.md') }
}
const AZURE_WOW = '# Way of Working\n\n- Azure DevOps is adopted for project management.\n  Organization: acme. Project: Proj.\n'
const SPLIT_WOW = '# Way of Working\n\n- Azure DevOps is adopted for project management.\n\n## Git Workflow\n\n- `code-host`: `github` — repository `acme/app`.\n'

// ── T-1: the interface + the shared canonicalization ─────────────────────────────────────────
test('AC1/T-1: the interface is exactly the eight named methods, and both shipped adapters implement every one', () => {
  assert.deepEqual(INTERFACE_METHODS, ['readCard', 'cardHash', 'prHead', 'upsertComment', 'concludeCheck', 'setPrState', 'merge', 'closeAndCascade'])
  assert.deepEqual(implementedHosts(), ['azure-devops', 'github'])
  for (const a of [github, azure]) {
    const inst = a.instantiate({})
    for (const m of INTERFACE_METHODS) assert.equal(typeof inst[m], 'function', `${a.id}.${m}`)
  }
})

test('AC5: cardHash is ONE shared canonicalization over readCard — the same body hashes alike through both adapters, and an adapter may not bring its own', () => {
  const body = '## Story\n\nAC-1: works\n'
  const gh = fakeGh({ issues: { 7: { body } } })
  const az = fakeAz({ workItems: { 7: { fields: { 'System.Description': body, 'System.TeamProject': 'Proj' } } } })
  const viaGh = github.instantiate({ ghBin: gh.ghBin }).cardHash(7)
  const viaAz = azure.instantiate({ azBin: az.azBin }).cardHash(7)
  assert.equal(viaGh, canonicalCardHash(body))
  assert.equal(viaAz, viaGh, 'only the fetch differs, never the hash')
  assert.match(viaGh, /^sha256:[0-9a-f]{64}$/)
  const rogue = defineAdapter({ id: 'rogue', binaries: ['true'], create: () => ({ ...Object.fromEntries(REQUIRED_METHODS.map(m => [m, () => {}])), cardHash: () => 'mine' }) })
  assert.throws(() => rogue.instantiate(), /must not define cardHash/)
})

test('AC5: the pre-US-492 hash is preserved — sha256 of the raw `gh issue view -q .body` output, so stamped handoffs still compare equal', () => {
  const gh = fakeGh({ issues: { 42: { body: 'card body of story 42\n' } } })
  const { acHash } = cardHash({ story: 42, ghBin: gh.ghBin })
  assert.equal(acHash, 'sha256:' + createHashHex('card body of story 42\n'))
  assert.deepEqual(gh.calls()[0], ['issue', 'view', '42', '--json', 'body', '-q', '.body'], 'argv unchanged by the extraction')
})
function createHashHex(s) {
  return createHash('sha256').update(s).digest('hex')
}

// ── T-2: the GitHub methods the scripts had no call site for ─────────────────────────────────
test('T-2: github prHead / merge / closeAndCascade speak the documented gh shapes, and the cascade stops at a parent with an open child', () => {
  const gh = fakeGh({ prs: { 12: { head: SHA } }, issues: { 5: { body: 'e', parent: 1 }, 6: { body: 's', parent: 5 }, 7: { body: 's', parent: 5 }, 1: { body: 'i' }, 2: { body: 'i2', parent: 1 }, 3: { body: 'lone' } } })
  const h = github.instantiate({ ghBin: gh.ghBin })
  assert.equal(h.prHead({ pr: 12 }), SHA)
  assert.deepEqual(h.merge({ pr: 12, strategy: 'squash', message: '[#6] feat: x\n\nbody line' }), { merged: true, pr: 12, strategy: 'squash' })
  assert.deepEqual(gh.state().prs[12].merged, ['--squash', '--subject', '[#6] feat: x', '--body', 'body line'])
  assert.throws(() => h.merge({ pr: 12, strategy: 'fast-forward' }), /merge strategy/)
  // 6 closes; its sibling 7 is still open → the epic 5 is not closed
  assert.deepEqual(h.closeAndCascade({ id: 6 }), { closed: [6], stoppedAt: 5 })
  // 7 closes → epic 5 has all sub-issues closed → closes; initiative 1 still has 2 open → stops there
  assert.deepEqual(h.closeAndCascade({ id: 7 }), { closed: [7, 5], stoppedAt: 1 })
  assert.equal(gh.state().issues[5].state, 'closed')
  assert.notEqual(gh.state().issues[1].state, 'closed')
  // the last open child of the initiative closes → the initiative closes too, and it has no parent
  assert.deepEqual(h.closeAndCascade({ id: 2 }), { closed: [2, 1], stoppedAt: null })
  // a card with no parent at all: the 404 means "no parent", never an error
  assert.deepEqual(h.closeAndCascade({ id: 3 }), { closed: [3], stoppedAt: null })
})

// ── T-5 / AC3: Azure DevOps, all eight methods ─────────────────────────────────────────────────
test('AC3: azure-devops readCard/cardHash/closeAndCascade drive Azure Boards through az boards, cascading up the hierarchy', () => {
  const az = fakeAz({
    workItems: {
      10: { fields: { 'System.Title': 'Epic', 'System.Description': 'epic', 'System.TeamProject': 'Proj', 'System.State': 'Active' }, relations: [{ rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/acme/_apis/wit/workItems/11' }, { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/acme/_apis/wit/workItems/12' }] },
      11: { fields: { 'System.Title': 'S1', 'System.Description': 'AC-1: a', 'System.TeamProject': 'Proj', 'System.State': 'Active' }, relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/acme/_apis/wit/workItems/10' }] },
      12: { fields: { 'System.Title': 'S2', 'System.Description': 'b', 'System.TeamProject': 'Proj', 'System.State': 'Done' }, relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/acme/_apis/wit/workItems/10' }] },
    },
  })
  const h = azure.instantiate({ azBin: az.azBin })
  assert.deepEqual(h.readCard(11), { body: 'AC-1: a' })
  assert.deepEqual(h.readCard(11, { fields: ['number', 'url', 'title'] }), { number: 11, url: 'https://dev.azure.com/acme/Proj/_workitems/edit/11', title: 'S1' })
  assert.equal(h.cardHash('https://dev.azure.com/acme/Proj/_workitems/edit/11'), canonicalCardHash('AC-1: a'), 'a card URL resolves to its id')
  assert.deepEqual(h.closeAndCascade({ id: 11 }), { closed: [11, 10], stoppedAt: null })
  assert.equal(az.state().workItems[10].fields['System.State'], 'Done')
  assert.ok(az.calls().every(c => c.args[0] === 'boards'), 'card operations stay on Azure Boards')
})

test('AC3: azure-devops PR side — prHead, marker-keyed upsert (create / unchanged / update / ambiguity), check on the exact head, one state label, merge', () => {
  const az = fakeAz({ prs: { 3: { head: SHA, iterations: [SHA2, SHA], labels: ['pr-state:to-be-reviewed', 'risk:red'] } } })
  const h = azure.instantiate({ azBin: az.azBin })
  const repo = 'Proj/app'
  assert.equal(h.prHead({ pr: 3, repo }), SHA)
  const marker = '<!-- pair:first-review #9 PR#3 -->'
  const c1 = h.upsertComment({ pr: 3, repo, marker, body: 'first' })
  assert.equal(c1.action, 'created')
  assert.match(c1.url, /^https:\/\/dev\.azure\.com\/acme\/Proj\/_git\/app\/pullrequest\/3\?discussionId=\d+#1$/)
  assert.equal(h.upsertComment({ pr: 3, repo, marker, body: 'first' }).action, 'unchanged')
  const c3 = h.upsertComment({ pr: 3, repo, marker, body: 'second' })
  assert.deepEqual([c3.action, c3.id], ['updated', c1.id], 'edited in place, never a second thread')
  assert.equal(az.state().prs[3].threads.length, 1)
  assert.equal(az.state().prs[3].threads[0].comments[0].content, `${marker}\nsecond`)
  assert.equal(h.upsertComment({ pr: 3, repo, marker, body: 'x'.repeat(70000) }).error, 'body-too-long')

  const check = h.concludeCheck({ pr: 3, repo, sha: SHA, state: 'success', description: 'approved' })
  assert.deepEqual(check, { context: 'pair-review', sha: SHA, state: 'success', published: true, error: null })
  const st = az.state().prs[3].statuses[0]
  assert.deepEqual([st.state, st.context, st.iterationId], ['succeeded', { name: 'pair-review', genre: 'pair' }, 2], 'bound to the iteration whose source commit is the verified head')
  assert.equal(h.readCheck({ pr: 3, repo, sha: SHA }), 'success')
  assert.equal(h.readCheck({ pr: 3, repo, sha: SHA2 }), null, 'a conclusion on another head is not this head\'s')
  assert.equal(h.concludeCheck({ pr: 3, repo, sha: 'c'.repeat(40), state: 'success' }).published, false, 'a sha that is no iteration of the PR is reported, never posted')

  const label = h.setPrState({ pr: 3, repo, label: 'pr-state:ready-to-merge' })
  assert.deepEqual(label, { applied: 'pr-state:ready-to-merge', removed: ['pr-state:to-be-reviewed'], confirmed: true, error: null })
  assert.deepEqual(az.state().prs[3].labels.sort(), ['pr-state:ready-to-merge', 'risk:red'], 'non-state labels untouched')

  assert.deepEqual(h.merge({ pr: 3, strategy: 'squash', message: '[#9] feat: y' }), { merged: true, pr: 3, strategy: 'squash' })
  assert.deepEqual([az.state().prs[3].status, az.state().prs[3].squash, az.state().prs[3].message], ['completed', 'true', '[#9] feat: y'])
  assert.throws(() => h.merge({ pr: 3, strategy: 'rebase' }), /not supported/, 'a genuine parity gap is a stated, typed limitation')
})

test('AC3: a refused Azure status write degrades to advisory (reported), a malformed repo is refused before any call', () => {
  const az = fakeAz({ prs: { 4: { head: SHA, iterations: [SHA], refuseStatus: true } } })
  const h = azure.instantiate({ azBin: az.azBin })
  const out = h.concludeCheck({ pr: 4, repo: 'Proj/app', sha: SHA, state: 'failure' })
  assert.equal(out.published, false)
  assert.match(out.error, /TF401027/)
  const before = az.calls().length
  assert.throws(() => h.listComments({ pr: 4, repo: 'Proj' }), /<project>\/<repository>/)
  assert.equal(az.calls().length, before)
})

test('AC3: the scope-decision path runs unchanged on Azure DevOps — the maintainer\'s PR comment is read back through the code host and the card is extended on Azure Boards', () => {
  const { runDir } = wowDir(AZURE_WOW + '\n## Assignment\n\n- `default-assignee`: `rucka@acme.test`\n')
  const scopeChanges = [{ id: 'sc-1', type: 'new-requirement', proposal: 'p', status: 'pending', discoveredAtReviewId: 'r0', baselineEvidenceRefs: [] }]
  const draft = join(runDir, 'tmp-r0.json')
  writeFileSync(draft, JSON.stringify({ run: 'story-9', story: '9', pr: 3, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: SHA, reviewedHead: SHA, verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: SHA }, mode: 'first', scopeChanges }))
  assert.equal(publish({ dir: runDir, file: draft, phase: 'r0', skill: 'review-phase', workflowVersion: '4.0.1' }).published, true)
  const decision = '```json\n' + JSON.stringify({ schemaVersion: 1, scopeBaselineHash: scopeBaselineHashOf(scopeChanges), decisions: [{ id: 'sc-1', action: 'extend-current-card', approvedDelta: { ac: [{ id: 'AC-2', description: 'also this' }] } }] }) + '\n```'
  const az = fakeAz({
    workItems: { 9: { fields: { 'System.Title': 'S', 'System.Description': '- **AC-1**: base\n', 'System.TeamProject': 'Proj' } } },
    prs: { 3: { head: SHA, threads: [{ id: 77, comments: [{ id: 1, content: decision, author: { uniqueName: 'rucka@acme.test', descriptor: 'aad.rucka' } }] }, { id: 78, comments: [{ id: 1, content: decision, author: { uniqueName: 'build@acme.test', descriptor: 'svc.build' } }] }] } },
  })
  const bySvc = applyScopeDecisions({ dir: runDir, decisionRef: 'https://dev.azure.com/acme/Proj/_git/app/pullrequest/3?discussionId=78#1', repo: 'Proj/app', pr: 3, workflowVersion: '4.0.1', azBin: az.azBin })
  assert.deepEqual([bySvc.applied, bySvc.reason], [false, 'author-not-a-user'], 'a service identity is never the maintainer')
  assert.equal(applyScopeDecisions({ dir: runDir, decisionRef: 'https://dev.azure.com/acme/Other/_git/app/pullrequest/3?discussionId=77#1', repo: 'Proj/app', pr: 3, workflowVersion: '4.0.1', azBin: az.azBin }).reason, 'decisionRef-repo-mismatch')
  const out = applyScopeDecisions({ dir: runDir, decisionRef: 'https://dev.azure.com/acme/Proj/_git/app/pullrequest/3?discussionId=77#1', repo: 'Proj/app', pr: 3, workflowVersion: '4.0.1', azBin: az.azBin })
  assert.equal(out.applied, true, JSON.stringify(out))
  assert.match(az.state().workItems[9].fields['System.Description'], /AC-2.*also this/)
  assert.ok(az.state().workItems[9].fields['System.Description'].includes('- **AC-1**: base'), 'the card is extended, never replaced')
})

// ── T-3 / AC2: resolution once, binding, split routing ─────────────────────────────────────────
test('ADR-018 resolution: default GitHub (this repo), Azure DevOps single-tool, an explicit pm-tool key, a split project, and nothing declared', () => {
  const wow = readFileSync(join(REPO, '.pair', 'adoption', 'tech', 'way-of-working.md'), 'utf8')
  assert.deepEqual(resolveHosts({ text: wow }), { pmTool: 'github', codeHost: 'github', declared: { pmTool: 'Github Projects', codeHost: null } })
  assert.deepEqual(resolveHosts({ text: AZURE_WOW }).codeHost, 'azure-devops', 'a repository-hosting PM tool is its own code host')
  assert.deepEqual(resolveHosts({ text: SPLIT_WOW }), { pmTool: 'azure-devops', codeHost: 'github', declared: { pmTool: 'Azure DevOps', codeHost: 'github' } })
  assert.equal(resolveHosts({ text: '- `pm-tool`: `azure-boards`\n' }).pmTool, 'azure-devops', 'aliases collapse to the product')
  assert.deepEqual(resolveHosts({ text: '' }), { pmTool: 'github', codeHost: 'github', declared: { pmTool: null, codeHost: null } }, 'D21: nothing declared keeps the one default adapter')
})

test('AC4: a declared host without scripts/host/<name>.mjs HALTs host-unsupported, naming it and the implemented set — never a GitHub fallback', () => {
  for (const [text, side, declared] of [
    ['- Jira is adopted for project management.\n', 'pm-tool', 'Jira'],
    ['- Github Projects is adopted for project management.\n\n## Git Workflow\n\n- `code-host`: `gitlab`\n', 'code-host', 'gitlab'],
  ]) {
    assert.throws(
      () => resolveHosts({ text }),
      e => e.kind === 'host-unsupported' && JSON.parse(e.detail).declared === declared && JSON.parse(e.detail).side === side && /implemented: azure-devops, github/.test(e.message),
    )
  }
  // through the coordinator entry: typed, exit 1, nothing bound
  const { runDir } = wowDir('- Linear is adopted for project management.\n\n## Git Workflow\n\n- `code-host`: `github`\n')
  const r = spawnSync(process.execPath, [CYCLE_STATE, 'bind-hosts', '--dir', runDir], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  const out = JSON.parse(r.stdout)
  assert.deepEqual([out.halt, out.side, out.declared, out.implemented], ['host-unsupported', 'pm-tool', 'Linear', ['azure-devops', 'github']])
  assert.match(out.detail, /implemented: azure-devops, github/)
  assert.equal(existsSync(join(runDir, BINDING_FILE)), false)
  // a split project whose PM tool hosts no code and declares no code host: PR operations fail typed
  const { runDir: d2 } = wowDir('- `pm-tool`: `github`\n')
  assert.ok(bindHosts({ dir: d2 }).code, 'github hosts code')
})

test('AC2: the coordinator binds ONCE — bind-hosts writes the binding, a changed way-of-working afterwards is NOT re-resolved for that run', () => {
  const { runDir, wow } = wowDir(AZURE_WOW)
  const first = spawnSync(process.execPath, [CYCLE_STATE, 'bind-hosts', '--dir', runDir], { encoding: 'utf8' })
  assert.equal(first.status, 0, first.stdout)
  assert.deepEqual([JSON.parse(first.stdout).action, JSON.parse(first.stdout).binding.pmTool], ['bound', 'azure-devops'])
  writeFileSync(wow, '- Github Projects is adopted for project management.\n') // mid-cycle edit
  const again = JSON.parse(spawnSync(process.execPath, [CYCLE_STATE, 'bind-hosts', '--dir', runDir], { encoding: 'utf8' }).stdout)
  assert.deepEqual([again.action, again.binding.pmTool], ['reused', 'azure-devops'])
  // every later call naming the run directory uses the bound adapter: the card is read through az
  const az = fakeAz({ workItems: { 9: { fields: { 'System.Description': 'az body', 'System.TeamProject': 'Proj' } } } })
  const gh = fakeGh({ issues: { 9: { body: 'gh body' } } })
  const h = cardHash({ story: 9, dir: runDir, azBin: az.azBin, ghBin: gh.ghBin })
  assert.equal(h.acHash, canonicalCardHash('az body'))
  assert.equal(gh.calls().length, 0, 'the edited way-of-working never reached a call')
  const viaCli = spawnSync(process.execPath, [CYCLE_STATE, 'ac-hash', '--story', '9', '--dir', runDir], { encoding: 'utf8', env: { ...process.env, PAIR_AZ_BIN: az.azBin, PAIR_GH_BIN: gh.ghBin } })
  assert.equal(JSON.parse(viaCli.stdout).acHash, canonicalCardHash('az body'))
})

test('AC2: inside one process the resolution is memoized — a way-of-working edit after the first call does not switch adapters mid-invocation', () => {
  const { runDir, wow } = wowDir(AZURE_WOW)
  const one = bindHosts({ dir: runDir })
  writeFileSync(wow, '- Github Projects is adopted for project management.\n')
  const two = bindHosts({ dir: runDir })
  assert.deepEqual([one.pmTool, two.pmTool], ['azure-devops', 'azure-devops'])
})

test('T-3: a split project routes card operations to the pm-tool adapter and PR operations to the code-host adapter', () => {
  const { runDir } = wowDir(SPLIT_WOW)
  writeBinding({ dir: runDir })
  const az = fakeAz({ workItems: { 9: { fields: { 'System.Description': 'card', 'System.TeamProject': 'Proj' } } } })
  const gh = fakeGh({ prs: { 5: { head: SHA } } })
  const host = bindHosts({ dir: runDir, transport: { azBin: az.azBin, ghBin: gh.ghBin } })
  assert.deepEqual([host.pmTool, host.codeHost], ['azure-devops', 'github'])
  assert.equal(host.pm.cardHash(9), canonicalCardHash('card'))
  assert.equal(host.code.prHead({ pr: 5 }), SHA)
  assert.deepEqual([az.calls().length > 0, gh.calls().map(c => c[0])], [true, ['pr']], 'each call reached only its own side')
  assert.throws(() => host.pm.prHead({ pr: 5 }), e => e.kind === 'wrong-side')
  assert.throws(() => host.code.readCard(9), e => e.kind === 'wrong-side')
})

test('T-3: pr-comment and pr-state take the run directory binding (--dir) and publish through the bound code host', () => {
  const { runDir } = wowDir(AZURE_WOW)
  writeBinding({ dir: runDir })
  const az = fakeAz({ prs: { 3: { head: SHA, iterations: [SHA], labels: [] } } })
  const env = { ...process.env, PAIR_AZ_BIN: az.azBin, PATH: `${az.dir}:${process.env.PATH}` }
  const body = join(runDir, 'body.md')
  writeFileSync(body, 'hello')
  const c = spawnSync(process.execPath, [PR_COMMENT, 'upsert', '--pr', '3', '--marker', '<!-- pair:first-review #9 PR#3 -->', '--body-file', body, '--repo', 'Proj/app', '--dir', runDir], { encoding: 'utf8', env })
  assert.equal(JSON.parse(c.stdout).action, 'created', c.stdout)
  const s = spawnSync(process.execPath, [PR_STATE, 'conclude', '--pr', '3', '--sha', SHA, '--verdict', 'approved', '--repo', 'Proj/app', '--dir', runDir], { encoding: 'utf8', env })
  const out = JSON.parse(s.stdout)
  assert.deepEqual([out.action, out.check.published, out.label.confirmed], ['concluded', true, true], s.stdout)
  assert.deepEqual(az.state().prs[3].labels, ['pr-state:ready-to-merge'])
})

// ── edge case: a partially implemented adapter ─────────────────────────────────────────────────
test('edge: an adapter missing a method is refused naming it; one that throws is an adapter bug reported with the method name', () => {
  const partial = defineAdapter({ id: 'partial', binaries: ['true'], create: () => Object.fromEntries(REQUIRED_METHODS.filter(m => m !== 'closeAndCascade').map(m => [m, () => {}])) })
  assert.throws(() => partial.instantiate(), /missing closeAndCascade/)
  const buggy = defineAdapter({ id: 'buggy', binaries: ['true'], create: () => ({ ...Object.fromEntries(REQUIRED_METHODS.map(m => [m, () => {}])), closeAndCascade: () => { throw new Error('not implemented') } }) })
  assert.throws(() => buggy.instantiate().closeAndCascade({ id: 1 }), e => e.kind === 'adapter-error' && e.method === 'closeAndCascade' && /buggy closeAndCascade failed: not implemented/.test(e.message))
  assert.throws(() => buggy.instantiate().findCards({}), e => e.kind === 'not-implemented' && e.method === 'findCards', 'an optional method it omits fails typed, never silently skipped')
})

// ── AC6 / AC7: CLI-first, credentials never pass through ───────────────────────────────────────
const hostSources = () => readdirSync(HOST_DIR).filter(f => f.endsWith('.mjs')).map(f => [f, readFileSync(join(HOST_DIR, f), 'utf8')])
const code = src => src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')

test('AC6: every adapter method is a CLI spawn — no MCP, no HTTP client, no network module in scripts/host/', () => {
  for (const [f, src] of hostSources()) {
    const c = code(src)
    assert.doesNotMatch(c, /\bfetch\s*\(|from ['"]node:(https?|net|tls|http2)['"]|require\(['"](https?|net)['"]\)|\bmcp\b|XMLHttpRequest/i, `${f} reaches the network other than through its CLI`)
    if (f !== 'adapter-kit.mjs') assert.doesNotMatch(c, /spawnSync|execSync|execFile|child_process/, `${f} spawns outside the kit's runCli`)
  }
  assert.deepEqual([github.binaries, azure.binaries], [['gh'], ['az']])
})

test('AC7: no adapter reads, writes, stores or prints a credential — static scan plus a sentinel token that never surfaces', () => {
  for (const [f, src] of hostSources()) assert.doesNotMatch(code(src), /GH_TOKEN|GITHUB_TOKEN|AZURE_DEVOPS_EXT_PAT|SYSTEM_ACCESSTOKEN|\bPAT\b|Authorization|process\.env\.[A-Z_]*(TOKEN|PAT|SECRET|PASSWORD)/, `${f} touches a credential`)
  const SECRET = 'ghp_SENTINEL_never_echo_1234567890'
  const prev = { GH_TOKEN: process.env.GH_TOKEN, AZURE_DEVOPS_EXT_PAT: process.env.AZURE_DEVOPS_EXT_PAT }
  process.env.GH_TOKEN = SECRET
  process.env.AZURE_DEVOPS_EXT_PAT = SECRET
  try {
    const az = fakeAz({ prs: { 3: { head: SHA, iterations: [SHA], labels: [] } } })
    const h = azure.instantiate({ azBin: az.azBin })
    const results = [h.prHead({ pr: 3, repo: 'Proj/app' }), h.upsertComment({ pr: 3, repo: 'Proj/app', marker: '<!-- pair:x #9 PR#3 -->', body: 'b' }), h.concludeCheck({ pr: 3, repo: 'Proj/app', sha: SHA, state: 'success' })]
    let err
    try {
      h.readCard(404)
    } catch (e) {
      err = e
    }
    assert.ok(!JSON.stringify(results).includes(SECRET) && !String(err?.message).includes(SECRET) && !JSON.stringify(err).includes(SECRET))
    assert.ok(az.calls().every(c => !c.args.some(a => a.includes(SECRET))), 'the token is never an argv element')
    assert.ok(az.calls().every(c => c.env.includes('AZURE_DEVOPS_EXT_PAT')), 'the CLI keeps authenticating itself from its own environment')
  } finally {
    for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

// ── BR1 / BR2: host literals stay in scripts/host/ ─────────────────────────────────────────────
test('BR1: no gh/az invocation literal outside scripts/host/ in any workflow skill script (dataset and installed)', () => {
  // The seal's trap WRITES a fake `gh` to prevent a witness from reaching the tracker — it never
  // invokes a host; that is the one deliberate exception, named here.
  const EXEMPT = { 'red-snapshot.mjs': /join\(trap, 'gh'\)|startsWith\('gh'\)/ }
  const FORBIDDEN = /spawnSync\(\s*['"`](gh|az)['"`]|['"`](gh|az)['"`]\s*[,)\]]|\b(PAIR_GH_BIN|PAIR_AZ_BIN|ghBin|azBin)\b|https?:\\?\/\\?\/(github\.com|dev\.azure\.com)|github\\?\.com|dev\\?\.azure\\?\.com/
  const roots = [join(REPO, '.claude', 'skills'), join(REPO, 'packages', 'knowledge-hub', 'dataset', '.skills', 'workflow')]
  let scanned = 0
  for (const root of roots)
    for (const s of readdirSync(root)) {
      const dir = join(root, s, 'scripts')
      if (!/workflow/.test(root + s) || !existsSync(dir)) continue
      for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
        scanned++
        code(readFileSync(join(dir, f), 'utf8'))
          .split('\n')
          .forEach((line, i) => {
            if (EXEMPT[f]?.test(line)) return
            assert.doesNotMatch(line, FORBIDDEN, `${join(dir, f)}:${i + 1} names a host outside scripts/host/`)
          })
      }
    }
  assert.ok(scanned >= 20, `scanned ${scanned} scripts`)
})

test('BR2: host/ ships byte-identical in every workflow skill that runs a cycle script (dataset and installed)', () => {
  const canonical = Object.fromEntries(hostSources())
  for (const s of SKILLS)
    for (const base of [join(REPO, '.claude', 'skills', `pair-workflow-${s}`, 'scripts', 'host'), join(REPO, 'packages', 'knowledge-hub', 'dataset', '.skills', 'workflow', s, 'scripts', 'host')]) {
      assert.deepEqual(readdirSync(base).sort(), Object.keys(canonical).sort(), `${base} file set`)
      for (const [f, src] of Object.entries(canonical)) assert.equal(readFileSync(join(base, f), 'utf8'), src, `${base}/${f} drifted`)
    }
})

test('BR2: a new host is a new file — dropping <id>.mjs into a host directory registers it, no other file edited', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'host-dir-'))
  for (const f of readdirSync(HOST_DIR)) cpSync(join(HOST_DIR, f), join(dir, f))
  writeFileSync(join(dir, 'broken.mjs'), 'export default 42\n')
  const before = await loadAdapters(dir)
  assert.deepEqual([...before.adapters.keys()].sort(), ['azure-devops', 'github'])
  assert.ok(before.broken.has('broken'), 'a file that is not an adapter is recorded, never bound, never fatal')
  assert.throws(() => resolveHosts({ text: '- `pm-tool`: `broken`\n', registry: before }), /broken\.mjs failed to load/)
})

// ── AC8: the extension guide is followable ─────────────────────────────────────────────────────
const GUIDE = join(REPO, '.pair', 'knowledge', 'guidelines', 'collaboration', 'project-management-tool', 'host-adapter-extension-guide.md')

test('AC8: the extension guide names the eight methods, the registration wiring and a worked example — and that example, taken verbatim, is a working third adapter', async () => {
  const text = readFileSync(GUIDE, 'utf8')
  for (const m of INTERFACE_METHODS) assert.ok(text.includes(`\`${m}\``), `guide documents ${m}`)
  assert.match(text, /way-of-working\.md/)
  assert.match(text, /scripts\/host\/<id>\.mjs/)
  const block = /<!-- worked-example:filesystem -->\s*```js\n([\s\S]*?)```/.exec(text)
  assert.ok(block, 'the worked example is marked for this check')
  const dir = mkdtempSync(join(tmpdir(), 'host-third-'))
  for (const f of readdirSync(HOST_DIR)) cpSync(join(HOST_DIR, f), join(dir, f))
  writeFileSync(join(dir, 'filesystem.mjs'), block[1])
  const registry = await loadAdapters(dir)
  assert.deepEqual([...registry.adapters.keys()].sort(), ['azure-devops', 'filesystem', 'github'], JSON.stringify([...registry.broken]))
  // registered the way the guide says: a way-of-working declaration
  const r = resolveHosts({ text: '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `filesystem`\n', registry })
  assert.deepEqual([r.pmTool, r.codeHost], ['filesystem', 'filesystem'])
  const root = mkdtempSync(join(tmpdir(), 'fs-host-'))
  const host = bindHosts({ binding: r, registry, transport: { root } })
  mkdirSync(join(root, 'cards'), { recursive: true })
  writeFileSync(join(root, 'cards', '9.md'), 'AC-1: x\n')
  assert.equal(host.pm.cardHash(9), canonicalCardHash('AC-1: x\n'))
  const marker = '<!-- pair:first-review #9 PR#1 -->'
  assert.equal(host.code.upsertComment({ pr: 1, marker, body: 'a' }).action, 'created')
  assert.equal(host.code.upsertComment({ pr: 1, marker, body: 'b' }).action, 'updated')
  assert.equal(host.code.concludeCheck({ pr: 1, sha: SHA, state: 'success' }).published, true)
  assert.equal(host.code.setPrState({ pr: 1, label: 'pr-state:ready-to-merge' }).confirmed, true)
  assert.equal(host.code.prHead({ pr: 1 }), null)
  assert.deepEqual(host.code.merge({ pr: 1, strategy: 'squash', message: 'm' }).merged, true)
  assert.deepEqual(host.pm.closeAndCascade({ id: 9 }).closed, [9])
})

test('AC8: the guide ships byte-identical in the dataset (the mirror)', () => {
  assert.equal(readFileSync(GUIDE, 'utf8'), readFileSync(join(REPO, 'packages', 'knowledge-hub', 'dataset', '.pair', 'knowledge', 'guidelines', 'collaboration', 'project-management-tool', 'host-adapter-extension-guide.md'), 'utf8'))
})

// ── r1-g1 (finding r0-2): resolution reads DECLARATIONS, never examples ─────────────────────────
// A fenced code block (``` or ~~~, indented up to three spaces) or an HTML comment in
// way-of-working.md documents a declaration; it never is one. The shipped dataset template carries
// a fenced split-configuration example (Linear + `code-host`: `github`), so a fresh install must
// still resolve the D21 default, and a real declaration outside the example must win over it.
const TEMPLATE_WOW = join(REPO, 'packages', 'knowledge-hub', 'dataset', '.pair', 'adoption', 'tech', 'way-of-working.md')
const INDEX_COPIES = [
  ...SKILLS.map(s => join(REPO, '.claude', 'skills', `pair-workflow-${s}`, 'scripts', 'host', 'index.mjs')),
  ...SKILLS.map(s => join(REPO, 'packages', 'knowledge-hub', 'dataset', '.skills', 'workflow', s, 'scripts', 'host', 'index.mjs')),
]
const FENCE_DEFAULT = { pmTool: 'github', codeHost: 'github' }
const AZURE_DECL = '- Azure DevOps is adopted for project management. Organization: acme. Project: Proj.\n'

const shippedTemplate = () => readFileSync(TEMPLATE_WOW, 'utf8')
const fenceHosts = text => {
  const r = resolveHosts({ text })
  return { pmTool: r.pmTool, codeHost: r.codeHost }
}
// A recorder for one CLI: logs argv, answers `[]` to a paginated read, refuses anything else.
function cliRecorder(name) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-rec-`))
  const log = join(dir, 'calls.log')
  writeFileSync(log, '')
  writeFileSync(
    join(dir, name),
    `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n')
if (a.includes('--paginate')) { process.stdout.write('[]'); process.exit(0) }
if (a.includes('--http-method') && a.includes('GET')) { process.stdout.write(JSON.stringify({ value: [], count: 0 })); process.exit(0) }
process.stderr.write('unexpected ${name} call: ' + a.join(' ')); process.exit(3)
`,
  )
  chmodSync(join(dir, name), 0o755)
  return { dir, bin: join(dir, name), calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) }
}

// ── witnesses: the shipped template and its fenced example ─────────────────────────────────────
test('r1-g1-w1: the shipped dataset way-of-working template resolves the D21 default — nothing is declared outside its fenced example', () => {
  const r = resolveHosts({ text: shippedTemplate() })
  assert.deepEqual(r, { ...FENCE_DEFAULT, declared: { pmTool: null, codeHost: null } })
})

test('r1-g1-w2: an Azure DevOps declaration above the template resolves azure-devops on BOTH sides — the fenced `code-host`: `github` example is not a declaration', () => {
  assert.deepEqual(fenceHosts(`# Way of Working\n\n${AZURE_DECL}\n${shippedTemplate()}`), { pmTool: 'azure-devops', codeHost: 'azure-devops' })
})

// ── witnesses: every fence / comment form, one rule at a time ──────────────────────────────────
test('r1-g1-w3: a `pm-tool` key inside a backtick fence is not read — default github', () => {
  assert.deepEqual(fenceHosts('# W\n\nExample:\n\n```text\n- `pm-tool`: `jira`\n```\n'), FENCE_DEFAULT)
})

test('r1-g1-w4: a prose declaration inside a tilde fence is not read — default github', () => {
  assert.deepEqual(fenceHosts('# W\n\n~~~\n- Linear is adopted for project management.\n~~~\n'), FENCE_DEFAULT)
})

// r1-g1-w5 (list-item-nested fence) is OUT of scope by maintainer decision (run story-492,
// maintainer-interventions.md, 2026-09-23): the resolver applies CommonMark TOP-LEVEL block rules only,
// and the limit is documented in way-of-working-pm-resolution.md (r1-g1-d1).

test('r1-g1-w6: a `pm-tool` key inside a multi-line HTML comment is not read — default github', () => {
  assert.deepEqual(fenceHosts('# W\n\n<!--\n- `pm-tool`: `jira`\n-->\n'), FENCE_DEFAULT)
})

test('r1-g1-w7: a prose declaration inside a one-line HTML comment is not read — default github', () => {
  assert.deepEqual(fenceHosts('# W\n\n<!-- Linear is adopted for project management. -->\n'), FENCE_DEFAULT)
})

// ── interactions: a real declaration after an example, and the consumers of the resolution ─────
test('r1-g1-i1: a real declaration AFTER a fenced example is the one read — prose and key form alike', () => {
  const fence = '```text\n- Linear is adopted for project management.\n- `pm-tool`: `jira`\n- `code-host`: `github`\n```\n'
  assert.deepEqual(fenceHosts(`# W\n\n${fence}\n${AZURE_DECL}`), { pmTool: 'azure-devops', codeHost: 'azure-devops' })
  assert.deepEqual(fenceHosts(`# W\n\n${fence}\n- \`pm-tool\`: \`azure-devops\`\n`), { pmTool: 'azure-devops', codeHost: 'azure-devops' })
})

test('r1-g1-i2: `host/index.mjs resolve --from` on the shipped template prints github/github in all 12 shipped copies (installed + dataset)', () => {
  const { root } = wowDir(shippedTemplate())
  for (const copy of INDEX_COPIES) {
    assert.ok(existsSync(copy), copy)
    const r = spawnSync(process.execPath, [copy, 'resolve', '--from', root], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${copy}: ${r.stdout}${r.stderr}`)
    const out = JSON.parse(r.stdout)
    assert.deepEqual([out.pmTool, out.codeHost], ['github', 'github'], copy)
  }
})

test('r1-g1-i3: `cycle-state.mjs bind-hosts` on a project carrying the shipped template binds github/github (the pair-cli run --card entry)', () => {
  const { runDir } = wowDir(shippedTemplate())
  const r = spawnSync(process.execPath, [CYCLE_STATE, 'bind-hosts', '--dir', runDir], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepEqual([out.action, out.binding.pmTool, out.binding.codeHost], ['bound', 'github', 'github'])
  assert.ok(existsSync(join(runDir, BINDING_FILE)))
})

test('r1-g1-i4: `pr-comment.mjs find` run from a project carrying the shipped template reads comments through gh, as before US-492 — never az', () => {
  const { root } = wowDir(shippedTemplate())
  const gh = cliRecorder('gh')
  const az = cliRecorder('az')
  const env = { ...process.env, PAIR_GH_BIN: gh.bin, PAIR_AZ_BIN: az.bin, PATH: `${gh.dir}:${az.dir}:${process.env.PATH}` }
  const r = spawnSync(process.execPath, [PR_COMMENT, 'find', '--pr', '9', '--marker', '<!-- pair:first-review #9 PR#9 -->', '--repo', 'o/r'], { encoding: 'utf8', cwd: root, env })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(JSON.parse(r.stdout), { found: false, count: 0 })
  assert.deepEqual([gh.calls().length, az.calls().length], [1, 0])
  assert.deepEqual(gh.calls()[0].slice(0, 2), ['api', '--paginate'])
})

test('r1-g1-i5: an unsupported host declared AFTER a fenced supported example still HALTs host-unsupported — the example never masks the real declaration', () => {
  assert.throws(
    () => resolveHosts({ text: '# W\n\n```text\n- `pm-tool`: `github`\n```\n\n- Jira is adopted for project management.\n' }),
    e => e.kind === 'host-unsupported' && JSON.parse(e.detail).side === 'pm-tool' && JSON.parse(e.detail).declared === 'Jira',
  )
})

// ── repair (attempt 2): the maintainer's top-level grammar (maintainer-interventions.md, 2026-09-23) ──
test('r1-g1-x1: a fence closes only on the SAME character, at least as long — a nested ``` inside ```` and a ~~~ pair inside ``` stay example text', () => {
  assert.deepEqual(fenceHosts('# W\n\n````markdown\n```text\n- `pm-tool`: `jira`\n```\n````\n'), FENCE_DEFAULT)
  assert.deepEqual(fenceHosts('# W\n\n```text\n~~~\n- `pm-tool`: `jira`\n~~~\n```\n'), FENCE_DEFAULT)
})

test('r1-g1-x2: `<!--` inside a fence opens nothing (and a fence marker inside a comment opens nothing) — the real unsupported declaration after it still HALTs host-unsupported Jira', () => {
  for (const text of [
    '# W\n\n```html\n<!-- example comment\n```\n\n- Jira is adopted for project management.\n\n<!-- a note -->\n',
    '# W\n\n<!-- example:\n```text\n-->\n\n- Jira is adopted for project management.\n',
  ]) {
    assert.throws(
      () => resolveHosts({ text }),
      e => e.kind === 'host-unsupported' && JSON.parse(e.detail).side === 'pm-tool' && JSON.parse(e.detail).declared === 'Jira',
      text,
    )
  }
})

test('r1-g1-x3: an unterminated fence makes way-of-working malformed — a typed HALT naming the opening line, never a silent github default; a top-level line indented 4+ spaces is indented code, not a declaration', () => {
  assert.throws(
    () => resolveHosts({ text: `# W\n\n\`\`\`text\n- example\n\n${AZURE_DECL}` }),
    e => /way-of-working-malformed/.test(`${e.kind} ${e.message}`) && /\bline 3\b/.test(e.message),
  )
  assert.deepEqual(resolveHosts({ text: '# W\n\n    - `pm-tool`: `jira`\n' }), { ...FENCE_DEFAULT, declared: { pmTool: null, codeHost: null } })
  assert.deepEqual(fenceHosts(`# W\n\n${AZURE_DECL}\n    - \`code-host\`: \`github\`\n`), { pmTool: 'azure-devops', codeHost: 'azure-devops' })
})

test('r1-g1-d1: way-of-working-pm-resolution.md (root + dataset mirror) documents the grammar limit — fenced blocks and HTML comments are examples, declare the host on a top-level line, an unterminated fence HALTs way-of-working-malformed', () => {
  const rel = join('.pair', 'knowledge', 'guidelines', 'technical-standards', 'ai-development', 'skill-conventions', 'way-of-working-pm-resolution.md')
  for (const f of [join(REPO, rel), join(REPO, 'packages', 'knowledge-hub', 'dataset', rel)]) {
    const doc = readFileSync(f, 'utf8')
    assert.match(doc, /fenc/i, f)
    assert.match(doc, /HTML comment/i, f)
    assert.match(doc, /top-level line/i, f)
    assert.match(doc, /unterminated/i, f)
    assert.match(doc, /way-of-working-malformed/, f)
  }
})

// ── controls: what already resolves correctly must keep doing so ───────────────────────────────
test('r1-g1-c1: this repository\'s own way-of-working (GitHub Projects, prose) still resolves github/github', () => {
  const r = resolveHosts({ text: readFileSync(join(REPO, '.pair', 'adoption', 'tech', 'way-of-working.md'), 'utf8') })
  assert.deepEqual(r, { ...FENCE_DEFAULT, declared: { pmTool: 'Github Projects', codeHost: null } })
})

test('r1-g1-c2: an unfenced split configuration (Azure Boards + `code-host`: `github`) still resolves azure-devops/github', () => {
  assert.deepEqual(fenceHosts(`# W\n\n${AZURE_DECL}\n## Git Workflow\n\n- \`code-host\`: \`github\` — repository \`acme/app\`.\n`), { pmTool: 'azure-devops', codeHost: 'github' })
})

test('r1-g1-c3: a real declaration BEFORE a fenced example still wins', () => {
  assert.deepEqual(fenceHosts(`# W\n\n${AZURE_DECL}\n\`\`\`text\n- Linear is adopted for project management.\n\`\`\`\n`), { pmTool: 'azure-devops', codeHost: 'azure-devops' })
})

test('r1-g1-c4: an unsupported host declared OUTSIDE any fence or comment still HALTs host-unsupported — stripping examples never silences a real declaration', () => {
  for (const [text, side, declared] of [
    ['# W\n\n- Jira is adopted for project management.\n', 'pm-tool', 'Jira'],
    [`# W\n\n<!-- a note -->\n${AZURE_DECL}\n## Git Workflow\n\n- \`code-host\`: \`gitlab\`\n`, 'code-host', 'gitlab'],
  ]) {
    assert.throws(
      () => resolveHosts({ text }),
      e => e.kind === 'host-unsupported' && JSON.parse(e.detail).side === side && JSON.parse(e.detail).declared === declared,
    )
  }
})

test('r1-g1-c7: a `code-host` key inside a one-line HTML comment is not read — Azure stays its own code host', () => {
  assert.deepEqual(fenceHosts(`# W\n\n${AZURE_DECL}\n<!-- - \`code-host\`: \`github\` -->\n`), { pmTool: 'azure-devops', codeHost: 'azure-devops' })
})

test('r1-g1-c5: an unfenced Azure DevOps single-tool project still resolves azure-devops on both sides', () => {
  assert.deepEqual(fenceHosts(`# Way of Working\n\n${AZURE_DECL}`), { pmTool: 'azure-devops', codeHost: 'azure-devops' })
})
