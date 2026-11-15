// US-642 AC-1/2/4/5: every PM adapter exposes the same state and membership contract.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defineAdapter, REQUIRED_METHODS, loadAdapters } from '../../skills/pair-workflow-cycle/scripts/host/index.mjs'
import { fileURLToPath } from 'node:url'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import github from '../../skills/pair-workflow-cycle/scripts/host/github.mjs'
import filesystem from '../../skills/pair-workflow-cycle/scripts/host/filesystem.mjs'

test('AC-1/2: cardState distinguishes open, closed, and missing board membership', () => {
  let card = { state: 'OPEN', stateReason: null, projectItems: [{ status: { name: 'Review' } }] }
  const fake = defineAdapter({
    id: 'state-fixture', binaries: [],
    create: () => ({
      ...Object.fromEntries(REQUIRED_METHODS.map(method => [method, () => ({})])),
      readCard: () => card,
    }),
  }).instantiate()
  assert.deepEqual(fake.cardState({ id: '1' }), { issueState: 'OPEN', issueReason: null, boardState: 'Review', member: true })
  card = { state: 'CLOSED', stateReason: 'NOT_PLANNED', projectItems: [] }
  assert.deepEqual(fake.cardState({ id: '1' }), { issueState: 'CLOSED', issueReason: 'NOT_PLANNED', boardState: null, member: false })
})

test('AC-1/4: filesystem member follows Review then closes unmerged as Not planned', () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-fs-board-'))
  const dir = join(root, '.pair', 'adoption', 'product', 'backlog', '03-user-stories', 'not-started')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '01-01-001-card.md'), '# Card\n\n**Status**: Todo\n')
  const pm = filesystem.instantiate({ root })
  assert.deepEqual(pm.cardState({ id: '01-01-001' }), { issueState: 'OPEN', issueReason: null, boardState: 'Todo', member: true })
  assert.equal(pm.ensureBoardMembership({ id: '01-01-001' }).confirmed, true)
  assert.equal(pm.setBoardState({ id: '01-01-001', state: 'Review' }).confirmed, true)
  assert.equal(pm.closeCard({ id: '01-01-001', reason: 'unmerged' }).confirmed, true)
  assert.deepEqual(pm.cardState({ id: '01-01-001' }), { issueState: 'CLOSED', issueReason: 'NOT_PLANNED', boardState: 'Not planned', member: true })
})

test('AC-5: GitHub adds a missing story to its adopted project once and confirms membership', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pair-board-'))
  const state = join(dir, 'state.json')
  writeFileSync(state, JSON.stringify({ member: false, adds: 0, issues: [], prs: [] }))
  const ghBin = join(dir, 'gh')
  writeFileSync(ghBin, `#!/usr/bin/env node
const fs = require('fs')
const file = ${JSON.stringify(state)}
const s = JSON.parse(fs.readFileSync(file, 'utf8'))
const a = process.argv.slice(2)
if (a[0] === 'project' && a[1] === 'list') process.stdout.write(JSON.stringify({ projects: [{ id: 'P1', title: 'board' }] }))
else if (a[0] === 'api' && a[1].includes('/issues?')) process.stdout.write(JSON.stringify(s.issues))
else if (a[0] === 'api' && a[1].includes('/pulls?')) process.stdout.write(JSON.stringify(s.prs))
else if (a[0] === 'api' && a.includes('-F') && a.some(v => v.includes('content='))) { s.member = true; s.adds++; fs.writeFileSync(file, JSON.stringify(s)); process.stdout.write(JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'I1' } } } })) }
else if (a[0] === 'api') process.stdout.write(JSON.stringify({ data: { repository: { issue: { id: 'C1', projectItems: { nodes: s.member ? [{ id: 'I1', project: { id: 'P1' } }] : [] } } } } }))
else { process.stderr.write('unexpected command ' + a.join(' ')); process.exit(3) }
`)
  chmodSync(ghBin, 0o755)
  const pm = github.instantiate({ ghBin, projectTitle: 'board', storyLabel: 'user story' })
  assert.equal(pm.ensureBoardMembership({ id: 42, repo: 'owner/repo' }).confirmed, true)
  assert.equal(pm.ensureBoardMembership({ id: 42, repo: 'owner/repo' }).confirmed, true)
  assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')), { member: true, adds: 1, issues: [], prs: [] })
  writeFileSync(state, JSON.stringify({ member: true, adds: 1, issues: [
    { number: 42, body: '## Story Statement\nA story' },
    { number: 43, body: '## Epic Context\nAn epic' },
    { number: 44, body: 'Manual entry', labels: [{ name: 'user story' }] },
  ], prs: [{ title: '[#42] feat: change', body: 'Closes #42', state: 'open', merged_at: null }] }))
  assert.deepEqual(pm.listCards({ repo: 'owner/repo' }), [{ id: '42' }, { id: '44' }])
  assert.equal(pm.linkedPr({ id: '42', repo: 'owner/repo' }), 'open')
  assert.equal(pm.linkedPr({ id: '43', repo: 'owner/repo' }), 'none')
})

test('AC-4/5: every installed PM adapter exposes membership and state writes', async () => {
  const dir = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/host/', import.meta.url))
  const { adapters, broken } = await loadAdapters(dir)
  assert.equal(broken.size, 0)
  assert.ok(adapters.size > 0)
  for (const adapter of adapters.values()) {
    const pm = adapter.instantiate({})
    for (const method of ['cardState', 'ensureBoardMembership', 'setBoardState', 'closeCard', 'listCards', 'syncEpic'])
      assert.ok(Object.keys(pm).includes(method), `${adapter.id}.${method}`)
    assert.deepEqual(pm.closeCard({ id: '1', reason: 'bogus' }).confirmed, false, adapter.id)
  }
})

// ── review r0-2 / r0-3 / r0-7 / r0-8 / r0-9: real adapters over stub host CLIs ──
const { default: azure } = await import('../../skills/pair-workflow-cycle/scripts/host/azure-devops.mjs')
const { default: linear } = await import('../../skills/pair-workflow-cycle/scripts/host/linear.mjs')
const { applyBoardState, stateMapping } = await import('../../skills/pair-workflow-cycle/scripts/board-sync.mjs')
const stubBin = (name, world, source) => {
  const dir = mkdtempSync(join(tmpdir(), `pair-${name}-`))
  const file = join(dir, 'world.json')
  writeFileSync(file, JSON.stringify({ ...world, log: [] }))
  const bin = join(dir, name)
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs')
const file = ${JSON.stringify(file)}
const w = JSON.parse(fs.readFileSync(file, 'utf8'))
const a = process.argv.slice(2)
const save = () => fs.writeFileSync(file, JSON.stringify(w))
const opt = k => a[a.indexOf(k) + 1]
${source}
`)
  chmodSync(bin, 0o755)
  return { bin, world: () => JSON.parse(readFileSync(file, 'utf8')) }
}

// r0-3: GitHub membership and Status are resolved against the adopted project only.
const GH_BOARD = `
const title = p => w.projects.find(x => x.id === p).title
const fields = p => ({ nodes: [{ id: 'F-' + p, name: 'Status', options: ['Todo', 'Review'].map(n => ({ id: p + '-' + n, name: n })) }] })
if (a[0] === 'issue' && a[1] === 'view') { process.stdout.write(JSON.stringify({ state: 'OPEN', stateReason: null, projectItems: w.items.map(i => ({ title: title(i.project), status: i.status ? { name: i.status } : null })) })); process.exit(0) }
if (a[0] === 'project' && a[1] === 'list') { process.stdout.write(JSON.stringify({ projects: w.projects })); process.exit(0) }
if (a[0] === 'api' && a[1] === 'graphql') {
  const q = a.find(v => v.startsWith('query='))
  const f = k => (a.find(v => v.startsWith(k + '=')) || '').slice(k.length + 1)
  if (q.includes('addProjectV2ItemById')) { w.log.push('add:' + f('project')); w.items.push({ id: 'I-' + f('project'), project: f('project'), status: null }); save(); process.stdout.write(JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'I-' + f('project') } } } })); process.exit(0) }
  if (q.includes('updateProjectV2ItemFieldValue')) { const it = w.items.find(i => i.id === f('item')); it.status = f('option').split('-').pop(); w.log.push('status:' + f('project') + ':' + it.status); save(); process.stdout.write(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: it.id, fieldValueByName: { name: it.status } } } } })); process.exit(0) }
  process.stdout.write(JSON.stringify({ data: { repository: { issue: { id: 'C42', projectItems: { nodes: w.items.map(i => ({ id: i.id, project: { id: i.project, title: title(i.project), fields: fields(i.project) } })) } } } } })); process.exit(0)
}
process.stderr.write('unexpected ' + a.join(' ')); process.exit(3)
`
test('r0-3: GitHub repairs the adopted board and never writes an unrelated project', () => {
  const gh = stubBin('gh', { projects: [{ id: 'PA', title: 'Adopted board' }, { id: 'PO', title: 'P-other' }], items: [{ id: 'I-PO', project: 'PO', status: 'Todo' }] }, GH_BOARD)
  const pm = github.instantiate({ ghBin: gh.bin, projectTitle: 'Adopted board' })
  assert.deepEqual(pm.cardState({ id: 42, repo: 'owner/repo' }), { issueState: 'OPEN', issueReason: null, boardState: null, member: false })
  assert.equal(applyBoardState({ pm, id: '42', pr: 'open', repo: 'owner/repo' }).confirmed, true)
  assert.deepEqual(gh.world().log, ['add:PA', 'status:PA:Review'])
  assert.deepEqual(pm.cardState({ id: 42, repo: 'owner/repo' }), { issueState: 'OPEN', issueReason: null, boardState: 'Review', member: true })
  assert.equal(applyBoardState({ pm, id: '42', pr: 'open', repo: 'owner/repo' }).confirmed, true)
  assert.deepEqual(gh.world().log, ['add:PA', 'status:PA:Review'], 'rerun writes nothing')
})

// r0-7: audits page through bounded requests; transport errors never carry card text.
const GH_PAGES = `
const SENTINEL = 'CARD_BODY_SENTINEL'
const all = Array.from({ length: 180 }, (_, i) => ({ number: i + 1, body: '## Story Statement\\n' + SENTINEL + 'x'.repeat(8192), labels: [] }))
const pulls = [{ number: 900, title: 'x', body: 'Closes #180\\n' + 'y'.repeat(8192), state: 'open', merged_at: null }]
if (a[0] !== 'api') { process.stderr.write('unexpected'); process.exit(3) }
const path = a.find(v => v.includes('/issues?') || v.includes('/pulls?'))
const rows = path.includes('/pulls?') ? pulls : all
if (a.includes('--paginate')) { for (let i = 0; i < rows.length; i += 100) process.stdout.write(JSON.stringify(rows.slice(i, i + 100))); process.exit(0) }
const page = Number(/[?&]page=(\\d+)/.exec(path)?.[1] ?? 1)
if (w.failPage === page) { process.stdout.write(JSON.stringify(rows)); process.stderr.write('HTTP 502'); process.exit(1) }
process.stdout.write(JSON.stringify(rows.slice((page - 1) * 100, page * 100)))
`
test('r0-7: listCards and linkedPr read a >1 MiB backlog page by page with sanitized errors', () => {
  const gh = stubBin('gh', {}, GH_PAGES)
  const pm = github.instantiate({ ghBin: gh.bin, projectTitle: 'board', storyLabel: 'user story' })
  assert.equal(pm.listCards({ repo: 'owner/repo' }).length, 180)
  assert.equal(pm.linkedPr({ id: '180', repo: 'owner/repo' }), 'open')
  const failing = stubBin('gh', { failPage: 2 }, GH_PAGES)
  const broken = github.instantiate({ ghBin: failing.bin, projectTitle: 'board', storyLabel: 'user story' })
  assert.throws(() => broken.listCards({ repo: 'owner/repo' }), e => !String(e.message).includes('CARD_BODY_SENTINEL') && !String(e.detail ?? '').includes('CARD_BODY_SENTINEL') && /HTTP 502/.test(e.message))
})

// r0-2 / r0-3 / r0-8 / r0-9: Azure Boards over a stub `az`.
const AZ = `
const wi = id => ({ id: Number(id), url: 'https://dev.azure.com/acme/_apis/wit/workItems/' + id, fields: w.items[id], relations: [] })
const out = x => { process.stdout.write(JSON.stringify(x)); process.exit(0) }
if (a[0] === 'boards' && a[1] === 'work-item' && a[2] === 'show') out(wi(opt('--id')))
if (a[0] === 'boards' && a[1] === 'work-item' && a[2] === 'update') {
  const f = w.items[opt('--id')]
  if (a.includes('--state')) { if (!w.states.includes(opt('--state'))) { process.stderr.write('TF401320: invalid state ' + opt('--state')); process.exit(1) } f['System.State'] = opt('--state'); w.log.push('state:' + opt('--state')) }
  if (a.includes('--area')) { f['System.AreaPath'] = opt('--area'); w.log.push('area:' + opt('--area')) }
  save(); out(wi(opt('--id')))
}
if (a[0] === 'boards' && a[1] === 'query') { const q = opt('--wiql'); w.log.push(q); save(); out(Object.keys(w.items).filter(id => q.includes("'" + w.items[id]['System.WorkItemType'] + "'")).map(id => ({ id: Number(id) }))) }
if (a[0] === 'repos' && a[1] === 'pr' && a[2] === 'list') out(w.prs)
process.stderr.write('unexpected ' + a.join(' ')); process.exit(3)
`
const azItem = (state, extra = {}) => ({ 'System.Title': 'S', 'System.Description': '', 'System.TeamProject': 'Proj', 'System.State': state, 'System.WorkItemType': 'User Story', 'System.AreaPath': 'Proj\\Team A', ...extra })
const AGILE = 'Team: Team A. Area path: Proj\\Team A.\n\n## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| New | Draft |\n| Active | In Progress |\n| Resolved | Review |\n| Closed | Done |\n'
test('r0-2: Azure closes a merged story to the adopted Done state and an abandoned one to Removed', () => {
  const az = stubBin('az', { states: ['New', 'Active', 'Resolved', 'Closed', 'Removed'], items: { 7: azItem('Resolved'), 8: azItem('Resolved') }, prs: [] }, AZ)
  const pm = azure.instantiate({ azBin: az.bin, wayOfWorking: AGILE })
  const mapping = stateMapping(AGILE)
  assert.equal(applyBoardState({ pm, id: '7', pr: 'merged', mapping }).confirmed, true)
  assert.equal(applyBoardState({ pm, id: '8', pr: 'closed-unmerged', mapping }).confirmed, true)
  assert.deepEqual(az.world().log, ['state:Closed', 'state:Removed'])
  assert.deepEqual(pm.cardState({ id: '7' }), { issueState: 'CLOSED', issueReason: 'COMPLETED', boardState: 'Closed', member: true })
})
test('r0-3: Azure membership is the adopted area path, repaired with --area', () => {
  const az = stubBin('az', { states: ['New'], items: { 9: azItem('New', { 'System.AreaPath': 'Proj\\Other' }), 10: azItem('New', { 'System.AreaPath': 'Proj\\Team A\\Sub' }) }, prs: [] }, AZ)
  const pm = azure.instantiate({ azBin: az.bin, wayOfWorking: AGILE })
  assert.equal(pm.cardState({ id: '9' }).member, false)
  assert.equal(pm.cardState({ id: '10' }).member, true)
  assert.equal(pm.ensureBoardMembership({ id: '9' }).confirmed, true)
  assert.equal(pm.cardState({ id: '9' }).member, true)
  assert.deepEqual(az.world().log, ['area:Proj\\Team A'])
})
test('r0-9: Azure listCards enumerates the default Scrum/Agile story types or the adopted type', () => {
  const items = { 1: azItem('New', { 'System.WorkItemType': 'Product Backlog Item' }), 2: azItem('New'), 3: azItem('New', { 'System.WorkItemType': 'Requirement' }) }
  const az = stubBin('az', { states: [], items, prs: [] }, AZ)
  assert.deepEqual(azure.instantiate({ azBin: az.bin, wayOfWorking: '' }).listCards({ repo: 'Proj/app' }), [{ id: '1' }, { id: '2' }])
  const mapped = '## Work Item Type Mapping\n\n| pair Concept | Work Item Type |\n| --- | --- |\n| Epic | Feature |\n| User Story | Requirement |\n'
  assert.deepEqual(azure.instantiate({ azBin: az.bin, wayOfWorking: mapped }).listCards({ repo: 'Proj/app' }), [{ id: '3' }])
})
test('r0-8: Azure linkedPr matches opaque bound PM ids exactly', () => {
  const prs = [{ description: 'Refs: ENG-42', status: 'active' }, { description: 'Refs: AB#77', status: 'completed' }]
  const az = stubBin('az', { states: [], items: {}, prs }, AZ)
  const code = azure.instantiate({ azBin: az.bin, wayOfWorking: '' })
  assert.equal(code.linkedPr({ id: 'ENG-42', repo: 'Proj/app' }), 'open')
  assert.equal(code.linkedPr({ id: 'ENG-4', repo: 'Proj/app' }), 'none')
  assert.equal(code.linkedPr({ id: '77', repo: 'Proj/app' }), 'merged')
  assert.equal(code.linkedPr({ id: '42', repo: 'Proj/app' }), 'none')
})

// r0-3: a Linear project-view board makes `projectId` part of membership.
test('r0-3: Linear membership follows the adopted project view and is repaired through projectId', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pair-linear-view-'))
  const file = join(dir, 'world.json')
  writeFileSync(file, JSON.stringify({ project: null, log: [] }))
  const curlBin = join(dir, 'curl')
  writeFileSync(curlBin, `#!/usr/bin/env node
const fs = require('fs')
const w = JSON.parse(fs.readFileSync(${JSON.stringify(file)}, 'utf8'))
const req = JSON.parse(fs.readFileSync(0, 'utf8'))
const op = /^(?:query|mutation)\\s+(\\w+)/.exec(req.query)[1]
const reply = data => { fs.writeFileSync(${JSON.stringify(file)}, JSON.stringify(w)); process.stdout.write(JSON.stringify({ data }) + '\\n200'); process.exit(0) }
const issue = () => ({ id: 'u1', identifier: 'ENG-1', url: 'https://linear.app/acme/issue/ENG-1', title: 't', description: '', completedAt: null, state: { name: 'Todo', type: 'unstarted' }, team: { id: 't1', key: 'ENG' }, labels: { nodes: [] }, project: w.project })
if (op === 'PairIssue') reply({ issue: issue() })
if (op === 'PairProject') reply({ projects: { nodes: req.variables.name === 'Roadmap' ? [{ id: 'p1', name: 'Roadmap' }] : [] } })
if (op === 'PairSetProject') { w.project = { id: req.variables.projectId, name: 'Roadmap' }; w.log.push('project:' + req.variables.projectId); reply({ issueUpdate: { success: true } }) }
process.stderr.write('unexpected ' + op); process.exit(3)
`)
  chmodSync(curlBin, 0o755)
  process.env.LINEAR_API_KEY = 'lin_api_test'
  const pm = linear.instantiate({ curlBin, wayOfWorking: '- Linear is adopted for project management.\n  Team: ENG. Project: Roadmap. Access: GraphQL API.\n', retryDelayMs: 0 })
  assert.deepEqual(pm.cardState({ id: 'ENG-1' }), { issueState: 'OPEN', issueReason: null, boardState: null, member: false })
  assert.equal(pm.ensureBoardMembership({ id: 'ENG-1' }).confirmed, true)
  assert.deepEqual(pm.cardState({ id: 'ENG-1' }), { issueState: 'OPEN', issueReason: null, boardState: 'Todo', member: true })
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).log, ['project:p1'])
})
