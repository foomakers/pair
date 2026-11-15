// US-642 AC-1/2/4/5: every PM adapter exposes the same state and membership contract.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defineAdapter, REQUIRED_METHODS, loadAdapters } from '../../skills/pair-workflow-cycle/scripts/host/index.mjs'
import { fileURLToPath } from 'node:url'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  const pm = github.instantiate({ ghBin, wayOfWorking: '- `pm-project`: `board`\n', storyLabel: 'user story' })
  assert.equal(pm.ensureBoardMembership({ id: 42, repo: 'owner/repo' }).confirmed, true)
  assert.equal(pm.ensureBoardMembership({ id: 42, repo: 'owner/repo' }).confirmed, true)
  assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')), { member: true, adds: 1, issues: [], prs: [] })
  writeFileSync(state, JSON.stringify({ member: true, adds: 1, issues: [
    { number: 42, body: '## Story Statement\nA story' },
    { number: 43, body: '## Epic Context\nAn epic' },
    { number: 44, body: 'Manual entry', labels: [{ name: 'user story' }] },
  ], prs: [{ title: '[#42] feat: change', body: 'Closes #42', state: 'open', merged_at: null, head: { ref: 'x', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } }] }))
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
const { applyBoardState, auditCards, stateMapping } = await import('../../skills/pair-workflow-cycle/scripts/board-sync.mjs')
let repoRoot = fileURLToPath(new URL('.', import.meta.url))
while (!existsSync(join(repoRoot, 'pnpm-workspace.yaml'))) repoRoot = dirname(repoRoot)
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

// r0-3 / r3-11 / r0-4: GitHub membership and Status come from the adopted project only, resolved by its full
// title (`pm-project`) or, absent that, by the one project linked to the repository; an empty Status reads
// as gh prints it (`{"optionId":"","name":""}`).
const GH_BOARD = `
const title = p => w.projects.find(x => x.id === p).title
const fields = p => ({ nodes: [{ id: 'F-' + p, name: 'Status', options: ['Todo', 'Review', 'Done'].map(n => ({ id: p + '-' + n, name: n })) }] })
if (a[0] === 'issue' && a[1] === 'view') { process.stdout.write(JSON.stringify({ state: 'OPEN', stateReason: null, projectItems: w.items.map(i => ({ title: title(i.project), status: { optionId: i.status ? 'o' : '', name: i.status ?? '' } })) })); process.exit(0) }
if (a[0] === 'project' && a[1] === 'list') { process.stdout.write(JSON.stringify({ projects: w.projects, totalCount: w.projects.length })); process.exit(0) }
if (a[0] === 'api' && a[1] === 'graphql') {
  const q = a.find(v => v.startsWith('query='))
  const f = k => (a.find(v => v.startsWith(k + '=')) || '').slice(k.length + 1)
  if (q.includes('addProjectV2ItemById')) { w.log.push('add:' + f('project')); w.items.push({ id: 'I-' + f('project'), project: f('project'), status: null }); save(); process.stdout.write(JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'I-' + f('project') } } } })); process.exit(0) }
  if (q.includes('updateProjectV2ItemFieldValue')) { const it = w.items.find(i => i.id === f('item')); it.status = f('option').split('-').pop(); w.log.push('status:' + f('project') + ':' + it.status); save(); process.stdout.write(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: it.id, fieldValueByName: { name: it.status } } } } })); process.exit(0) }
  if (q.includes('projectsV2')) { process.stdout.write(JSON.stringify({ data: { repository: { projectsV2: { nodes: w.projects.filter(p => (w.linked ?? []).includes(p.id)) } } } })); process.exit(0) }
  process.stdout.write(JSON.stringify({ data: { repository: { issue: { id: 'C42', projectItems: { nodes: w.items.map(i => ({ id: i.id, project: { id: i.project, title: title(i.project), fields: fields(i.project) } })) } } } } })); process.exit(0)
}
process.stderr.write('unexpected ' + a.join(' ')); process.exit(3)
`
const wow = project => `- \`pm-tool\`: \`github\`\n- \`pm-project\`: \`${project}\`\n`
test('r0-3: GitHub repairs the adopted board and never writes an unrelated project', () => {
  const gh = stubBin('gh', { projects: [{ id: 'PA', title: 'Adopted board' }, { id: 'PO', title: 'P-other' }], items: [{ id: 'I-PO', project: 'PO', status: 'Todo' }] }, GH_BOARD)
  const pm = github.instantiate({ ghBin: gh.bin, wayOfWorking: wow('Adopted board') })
  assert.deepEqual(pm.cardState({ id: 42, repo: 'owner/repo' }), { issueState: 'OPEN', issueReason: null, boardState: null, member: false })
  assert.equal(applyBoardState({ pm, id: '42', pr: 'open', repo: 'owner/repo' }).confirmed, true)
  assert.deepEqual(gh.world().log, ['add:PA', 'status:PA:Review'])
  assert.deepEqual(pm.cardState({ id: 42, repo: 'owner/repo' }), { issueState: 'OPEN', issueReason: null, boardState: 'Review', member: true })
  assert.equal(applyBoardState({ pm, id: '42', pr: 'open', repo: 'owner/repo' }).confirmed, true)
  assert.deepEqual(gh.world().log, ['add:PA', 'status:PA:Review'], 'rerun writes nothing')
})
test('r0-4: a GitHub item with an empty Status is initialized to the mapped Todo', () => {
  const gh = stubBin('gh', { projects: [{ id: 'PA', title: 'Adopted board' }], items: [{ id: 'I-PA', project: 'PA', status: null }] }, GH_BOARD)
  const pm = github.instantiate({ ghBin: gh.bin, wayOfWorking: wow('Adopted board') })
  assert.deepEqual(pm.cardState({ id: 42, repo: 'owner/repo' }), { issueState: 'OPEN', issueReason: null, boardState: null, member: true })
  assert.deepEqual(applyBoardState({ pm, id: '42', pr: 'none', repo: 'owner/repo', mapping: { Draft: 'Todo' } }), { confirmed: true, expected: 'Todo', actions: ['status:Todo'] })
  assert.deepEqual(gh.world().log, ['status:PA:Todo'])
})
test('r3-11: the real way-of-working prose resolves "pair digital development", never the short name', () => {
  const real = readFileSync(join(repoRoot, '.pair/adoption/tech/way-of-working.md'), 'utf8')
  const prose = real.split('\n').filter(line => !line.includes('`pm-project`')).join('\n')
  assert.match(prose, /The project is pair under the github organization/)
  const projects = [{ id: 'P3', number: 3, title: 'pair digital development' }, { id: 'P2', number: 2, title: 'Vibe engineering content plan' }]
  for (const [text, linked] of [[real, []], [prose, ['P3']]]) {
    const gh = stubBin('gh', { projects, linked, items: [{ id: 'I-P3', project: 'P3', status: 'Review' }] }, GH_BOARD)
    const pm = github.instantiate({ ghBin: gh.bin, wayOfWorking: text })
    assert.deepEqual(pm.cardState({ id: 42, repo: 'foomakers/pair' }), { issueState: 'OPEN', issueReason: null, boardState: 'Review', member: true })
    assert.deepEqual(pm.setBoardState({ id: 42, state: 'Done', repo: 'foomakers/pair' }), { applied: 'Done', confirmed: true, error: null })
    assert.deepEqual(gh.world().log, ['status:P3:Done'])
  }
  for (const linked of [[], ['P3', 'P2']]) {
    const gh = stubBin('gh', { projects, linked, items: [{ id: 'I-P3', project: 'P3', status: 'Review' }] }, GH_BOARD)
    const pm = github.instantiate({ ghBin: gh.bin, wayOfWorking: prose })
    assert.equal(pm.cardState({ id: 42, repo: 'foomakers/pair' }).member, false)
    assert.equal(pm.ensureBoardMembership({ id: 42, repo: 'foomakers/pair' }).gap, 'board-unconfigured')
    assert.equal(pm.setBoardState({ id: 42, state: 'Done', repo: 'foomakers/pair' }).gap, 'board-unconfigured')
    assert.deepEqual(gh.world().log, [])
  }
})

// r0-7: audits page through bounded requests; transport errors never carry card text.
const GH_PAGES = `
const SENTINEL = 'CARD_BODY_SENTINEL'
const all = Array.from({ length: 180 }, (_, i) => ({ number: i + 1, body: '## Story Statement\\n' + SENTINEL + 'x'.repeat(8192), labels: [] }))
const pulls = [{ number: 900, title: 'x', body: 'Closes #180\\n' + 'y'.repeat(8192), state: 'open', merged_at: null, head: { ref: 'x', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } }]
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
  const pm = github.instantiate({ ghBin: gh.bin, wayOfWorking: wow('board'), storyLabel: 'user story' })
  assert.equal(pm.listCards({ repo: 'owner/repo' }).length, 180)
  assert.equal(pm.linkedPr({ id: '180', repo: 'owner/repo' }), 'open')
  const failing = stubBin('gh', { failPage: 2 }, GH_PAGES)
  const broken = github.instantiate({ ghBin: failing.bin, wayOfWorking: wow('board'), storyLabel: 'user story' })
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

// r3-13: a failing host call never echoes argv values or card text — not even a short body.
test('r3-13: host CLI errors redact body/description values and long argv', () => {
  const gh = stubBin('gh', {}, `process.stderr.write('HTTP 422'); process.exit(1)`)
  const pm = github.instantiate({ ghBin: gh.bin, wayOfWorking: wow('board') })
  for (const body of ['ok', 'CARD_TEXT_SENTINEL '.repeat(20)]) {
    assert.throws(() => pm.updateCard({ id: 42, repo: 'owner/repo', body }), e => {
      const text = `${e.message} ${e.command} ${e.detail}`
      return /HTTP 422/.test(e.message) && !text.includes(body.trim()) && !text.includes('CARD_TEXT_SENTINEL') && /issue edit 42/.test(e.command)
    }, body)
  }
})

// r3-14: one audit reads the repository's pull requests once, not once per card.
test('r3-14: linkedPr reads the PR listing once per adapter instance', () => {
  const gh = stubBin('gh', {}, `
w.log.push(a.join(' ')); save()
if (a[0] === 'api' && a.some(v => v.includes('/pulls?'))) { process.stdout.write(JSON.stringify([{ number: 1, title: 'x', body: 'Closes #1', state: 'open', merged_at: null, head: { ref: 'x', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } }, { number: 2, title: 'y', body: 'Closes #2', state: 'closed', merged_at: '2026-01-01', head: { ref: 'x', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } }])); process.exit(0) }
process.exit(3)`)
  const code = github.instantiate({ ghBin: gh.bin, wayOfWorking: wow('board') })
  assert.deepEqual(['1', '2', '3'].map(id => code.linkedPr({ id, repo: 'owner/repo' })), ['open', 'merged', 'none'])
  assert.equal(gh.world().log.filter(l => l.includes('/pulls?')).length, 1)
})

// r3-16: several PRs link one card — a merged one wins, then an open one; a superseded closed PR never decides.
test('r3-16: GitHub and Azure linkedPr resolve several linked PRs by precedence, branch links included', () => {
  const pulls = [
    { number: 1, title: 'old', body: 'Closes #42', state: 'closed', merged_at: null, head: { ref: 'feature/old', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
    { number: 2, title: 'new', body: 'Closes #42', state: 'open', merged_at: null, head: { ref: 'feature/new', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
    { number: 3, title: 'a', body: '', state: 'closed', merged_at: null, head: { ref: 'feature/US-7-x', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
    { number: 4, title: 'b', body: 'Refs: ENG-9', state: 'closed', merged_at: '2026-01-01', head: { ref: 'b', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
    { number: 5, title: 'c', body: 'Refs: ENG-9', state: 'open', merged_at: null, head: { ref: 'c', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
    { number: 6, title: 'd', body: '', state: 'open', merged_at: null, head: { ref: 'feature/#77-x', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
  ]
  const gh = stubBin('gh', {}, `process.stdout.write(JSON.stringify(${JSON.stringify(pulls)})); process.exit(0)`)
  const code = github.instantiate({ ghBin: gh.bin, wayOfWorking: wow('board') })
  assert.deepEqual(['42', 'ENG-9', '77', '7'].map(id => code.linkedPr({ id, repo: 'owner/repo' })), ['open', 'merged', 'open', 'none'])
  const prs = [{ description: 'Refs: ENG-42', status: 'abandoned' }, { description: 'Refs: ENG-42', status: 'active' }]
  const az = stubBin('az', { states: [], items: {}, prs }, AZ)
  assert.equal(azure.instantiate({ azBin: az.bin, wayOfWorking: '' }).linkedPr({ id: 'ENG-42', repo: 'Proj/app' }), 'open')
})

// r3-15: Azure reads closure through the adopted Done state, not fixed Done/Closed literals.
test('r3-15: Azure card closure and epic children follow the adopted Done state', () => {
  const custom = '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Proposed | Draft |\n| Shipped | Done |\n'
  const items = { 1: azItem('Shipped'), 2: azItem('Closed'), 3: azItem('Removed') }
  const az = stubBin('az', { states: [], items, prs: [] }, AZ)
  const pm = azure.instantiate({ azBin: az.bin, wayOfWorking: custom })
  assert.deepEqual(['1', '2', '3'].map(id => pm.cardState({ id })), [
    { issueState: 'CLOSED', issueReason: 'COMPLETED', boardState: 'Shipped', member: true },
    { issueState: 'OPEN', issueReason: null, boardState: 'Closed', member: true },
    { issueState: 'CLOSED', issueReason: 'NOT_PLANNED', boardState: 'Removed', member: true },
  ])
})

// r4-18: ONE link grammar for the workflow selector and every code-host linkedPr.
// r5-21: native links are `Closes/Fixes/Resolves #N` only (Maintainer Decision); `AB#N` links only through `Refs:`.
const { prLinks } = await import('../../skills/pair-workflow-cycle/scripts/host/adapter-kit.mjs')
test('r4-18: prLinks is the single PR→card grammar (closing keywords, Refs incl. AB#, branch #N)', () => {
  const rows = [
    [{ body: 'Closes #42' }, { closes: ['42'], refs: [], branch: [] }],
    [{ body: 'fixes AB#42\nresolves #7' }, { closes: ['7'], refs: [], branch: [] }],
    [{ body: 'Closes AB#42' }, { closes: [], refs: [], branch: [] }],
    [{ body: 'Refs: AB#123' }, { closes: [], refs: ['123'], branch: [] }],
    [{ body: 'Refs: ENG-42\nRefs: #9' }, { closes: [], refs: ['ENG-42', '9'], branch: [] }],
    [{ body: 'Refs: ENG 42; rm -rf /' }, { closes: [], refs: [null], branch: [] }],
    [{ branch: 'feature/#12-work' }, { closes: [], refs: [], branch: ['12'] }],
    [{ branch: 'feature/#12a-work' }, { closes: [], refs: [], branch: [] }],
    [{ branch: 'refs/heads/feature/#77' }, { closes: [], refs: [], branch: ['77'] }],
    [{ body: 'Closes #42a', title: '[#42] x' }, { closes: [], refs: [], branch: [] }],
  ]
  for (const [input, expected] of rows) assert.deepEqual(prLinks(input), expected, JSON.stringify(input))
})
test('r4-18: GitHub and Azure linkedPr accept exactly what the workflow selects', () => {
  const pulls = [
    { number: 1, title: 'a', body: 'Refs: AB#123', state: 'open', merged_at: null, head: { ref: 'a', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
    { number: 2, title: 'b', body: '', state: 'open', merged_at: null, head: { ref: 'feature/#12a-work', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
    { number: 3, title: '[#55] c', body: '', state: 'open', merged_at: null, head: { ref: 'c', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
    { number: 4, title: 'd', body: 'Fixes AB#66', state: 'closed', merged_at: '2026-01-01', head: { ref: 'd', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } },
  ]
  const gh = stubBin('gh', {}, `process.stdout.write(JSON.stringify(${JSON.stringify(pulls)})); process.exit(0)`)
  const code = github.instantiate({ ghBin: gh.bin, wayOfWorking: wow('board') })
  assert.deepEqual(['123', '12', '55', '66'].map(id => code.linkedPr({ id, repo: 'owner/repo' })), ['open', 'none', 'none', 'none'])
  const prs = [{ description: '', status: 'active', sourceRefName: 'refs/heads/feature/#31-x' }, { description: 'Resolves #32', status: 'completed', sourceRefName: 'refs/heads/y' }]
  const az = stubBin('az', { states: [], items: {}, prs }, AZ)
  const azCode = azure.instantiate({ azBin: az.bin, wayOfWorking: '' })
  assert.deepEqual(['31', '32'].map(id => azCode.linkedPr({ id, repo: 'Proj/app' })), ['open', 'merged'])
})

// r4-17: an unresolved GitHub board is a reported gap on audit and apply; a transient resolution error
// propagates — it is never read as "not a member" (which would reset In Progress to Todo).
test('r4-17: unconfigured board is a gap; a resolution error never rewrites the Status', () => {
  const prose = '- Github Projects is adopted.\n'
  const gh = stubBin('gh', { projects: [{ id: 'P1', title: 'One' }], linked: [], items: [{ id: 'I-P1', project: 'P1', status: 'In Progress' }] }, GH_BOARD)
  const pm = github.instantiate({ ghBin: gh.bin, wayOfWorking: prose })
  assert.deepEqual(auditCards({ pm: { ...pm, listCards: () => [{ id: '42' }] }, code: { linkedPr: () => 'none' }, repo: 'owner/repo' }), { mismatches: [], gaps: [{ id: '42', reason: 'board-unconfigured' }] })
  assert.deepEqual(applyBoardState({ pm, id: '42', pr: 'open', repo: 'owner/repo' }).gaps, ['board-unconfigured'])
  const flaky = stubBin('gh', { projects: [{ id: 'P1', title: 'One' }], items: [{ id: 'I-P1', project: 'P1', status: 'In Progress' }] }, `
if (a[0] === 'issue' && a[1] === 'view') { process.stdout.write(JSON.stringify({ state: 'OPEN', stateReason: null, projectItems: [{ title: 'One', status: { optionId: 'o', name: 'In Progress' } }] })); process.exit(0) }
if (a[0] === 'project') { process.stderr.write('HTTP 502'); process.exit(1) }
w.log.push(a.join(' ')); save(); process.stdout.write('{}')`)
  const broken = github.instantiate({ ghBin: flaky.bin, wayOfWorking: wow('One') })
  const result = applyBoardState({ pm: broken, id: '42', pr: 'none', repo: 'owner/repo', mapping: { Draft: 'Todo' } })
  assert.equal(result.confirmed, false)
  assert.deepEqual(result.gaps, ['adapter-failed'])
  assert.deepEqual(flaky.world().log, [], 'no board write on a transient error')
  assert.equal(auditCards({ pm: { ...broken, listCards: () => [{ id: '42' }] }, code: { linkedPr: () => 'none' }, repo: 'owner/repo', mapping: { Draft: 'Todo' } }).mismatches.length, 0)
})

// r5-22: a fork PR never links a card — the Maintainer Decision admits same-repository PRs only, so a
// fork's `Closes #42` closed by its author can never close the card as Not planned.
test('r5-22: GitHub and Azure linkedPr ignore fork PRs', () => {
  const fork = { repo: { full_name: 'outsider/repo' } }
  const same = { repo: { full_name: 'owner/repo' } }
  const pulls = [
    { number: 1, body: 'Closes #42', state: 'closed', merged_at: null, head: { ref: 'f', ...fork }, base: same },
    { number: 2, body: 'Closes #43', state: 'closed', merged_at: null, head: { ref: 'f', repo: null }, base: same },
    { number: 3, body: 'Closes #44', state: 'closed', merged_at: null, head: { ref: 'f', ...fork }, base: same },
    { number: 4, body: 'Closes #44', state: 'open', merged_at: null, head: { ref: 'g', ...same }, base: same },
  ]
  const gh = stubBin('gh', {}, `process.stdout.write(JSON.stringify(${JSON.stringify(pulls)})); process.exit(0)`)
  const code = github.instantiate({ ghBin: gh.bin, wayOfWorking: wow('board') })
  assert.deepEqual(['42', '43', '44'].map(id => code.linkedPr({ id, repo: 'owner/repo' })), ['none', 'none', 'open'])
  const prs = [
    { description: 'Closes #50', status: 'abandoned', sourceRefName: 'refs/heads/x', forkSource: { repository: { name: 'fork' } } },
    { description: 'Closes #51', status: 'abandoned', sourceRefName: 'refs/heads/y', forkSource: { repository: { name: 'fork' } } },
    { description: 'Closes #51', status: 'active', sourceRefName: 'refs/heads/z' },
  ]
  const az = stubBin('az', { states: [], items: {}, prs }, AZ)
  const azCode = azure.instantiate({ azBin: az.bin, wayOfWorking: '' })
  assert.deepEqual(['50', '51'].map(id => azCode.linkedPr({ id, repo: 'Proj/app' })), ['none', 'open'])
})
