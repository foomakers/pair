// US-642 AC-1/2/4/5: transition and audit share one state decision table.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
const sourceScripts = existsSync(new URL('../../.skills/workflow/cycle/scripts/', import.meta.url))
  ? '../../.skills/workflow/cycle/scripts/' : '../../skills/pair-workflow-cycle/scripts/'
const { decideBoardState, applyBoardState, auditCards, stateMapping, updateEpicBody } = await import(new URL(`${sourceScripts}board-sync.mjs`, import.meta.url))

test('AC-1/2: PR and issue facts select every supported board outcome', () => {
  const rows = [
    [{ pr: 'merged', issue: 'OPEN' }, { status: 'Done', close: 'merged' }],
    [{ pr: 'merged', issue: 'CLOSED', reason: 'COMPLETED' }, { status: 'Done', close: null }],
    [{ pr: 'closed-unmerged', issue: 'OPEN' }, { status: 'Not planned', close: 'unmerged' }],
    [{ pr: 'open', issue: 'OPEN' }, { status: 'Review', close: null }],
    [{ pr: 'open', issue: 'CLOSED', reason: 'NOT_PLANNED' }, { status: 'Not planned', close: null }],
    [{ pr: 'none', issue: 'CLOSED', reason: 'COMPLETED' }, { status: 'Done', close: null }],
    [{ pr: 'none', issue: 'CLOSED', reason: 'NOT_PLANNED' }, { status: 'Not planned', close: null }],
    [{ pr: 'none', issue: 'OPEN', member: false }, { status: 'Todo', close: null }],
    [{ pr: 'none', issue: 'OPEN', member: true }, { status: null, close: null }],
  ]
  for (const [facts, expected] of rows) assert.deepEqual(decideBoardState(facts), expected, JSON.stringify(facts))
  assert.deepEqual(decideBoardState({ pr: 'unknown', issue: 'OPEN' }), { gap: 'pr-state-unreadable' })
  assert.deepEqual(decideBoardState({ pr: 'none', issue: 'MYSTERY' }), { gap: 'issue-state-unreadable' })
})

test('AC-4/6: adopted State Mapping supplies actual board labels', () => {
  const text = '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Queue | Draft |\n| Inspect | Review |\n| Shipped | Done |\n'
  assert.deepEqual(stateMapping(text), { Draft: 'Queue', Review: 'Inspect', Done: 'Shipped' })
  assert.deepEqual(stateMapping(''), { Draft: 'Draft', Ready: 'Ready', 'In Progress': 'In Progress', Review: 'Review', Done: 'Done' })
})

test('AC-1/5: apply adds membership before status, then a repeated run writes nothing', () => {
  const calls = []
  let state = { issueState: 'OPEN', issueReason: null, boardState: null, member: false }
  const pm = {
    cardState: () => state,
    ensureBoardMembership: () => { calls.push('member'); state = { ...state, member: true }; return { confirmed: true } },
    setBoardState: ({ state: wanted }) => { calls.push(`status:${wanted}`); state = { ...state, boardState: wanted }; return { confirmed: true } },
    closeCard: () => { throw Error('unexpected close') },
  }
  assert.equal(applyBoardState({ pm, id: '42', pr: 'open', mapping: { Review: 'Inspect' } }).confirmed, true)
  assert.deepEqual(calls, ['member', 'status:Inspect'])
  assert.equal(applyBoardState({ pm, id: '42', pr: 'open', mapping: { Review: 'Inspect' } }).confirmed, true)
  assert.deepEqual(calls, ['member', 'status:Inspect'])
})

test('AC-6: a minimal board without Review confirms membership and reports a skip', () => {
  const calls = []
  let member = false
  const pm = {
    cardState: () => ({ issueState: 'OPEN', issueReason: null, boardState: null, member }),
    ensureBoardMembership: () => { calls.push('member'); member = true; return { confirmed: true } },
    setBoardState: () => { throw Error('no Review option') },
  }
  assert.deepEqual(applyBoardState({ pm, id: '42', pr: 'open', mapping: { Draft: 'Todo', Done: 'Done' } }), { confirmed: true, expected: null, actions: ['membership'], skipped: 'no-review-state' })
  assert.deepEqual(calls, ['member'])
})

test('AC-6: an unmapped Done state reports a gap before closing a merged story', () => {
  const pm = {
    cardState: () => ({ issueState: 'OPEN', issueReason: null, boardState: 'Review', member: true }),
    closeCard: () => { throw Error('should not close') },
  }
  assert.deepEqual(applyBoardState({ pm, id: '42', pr: 'merged', mapping: { Review: 'Inspect' } }), { confirmed: false, gaps: ['state-unmapped:Done'] })
})

test('AC-2: report-only lists drift, apply repairs it, rerun lists none', () => {
  const cards = new Map([
    ['1', { issueState: 'OPEN', issueReason: null, boardState: 'Todo', member: true }],
    ['2', { issueState: 'OPEN', issueReason: null, boardState: null, member: false }],
  ])
  const calls = []
  const pm = {
    listCards: () => [...cards.keys()].map(id => ({ id })),
    cardState: ({ id }) => cards.get(id),
    ensureBoardMembership: ({ id }) => { calls.push(`member:${id}`); cards.set(id, { ...cards.get(id), member: true }); return { confirmed: true } },
    setBoardState: ({ id, state }) => { calls.push(`state:${id}:${state}`); cards.set(id, { ...cards.get(id), boardState: state }); return { confirmed: true } },
  }
  const code = { linkedPr: ({ id }) => id === '1' ? 'open' : 'none' }
  const input = { pm, code, mapping: { Draft: 'Todo', Review: 'Review' } }
  assert.deepEqual(auditCards(input), { mismatches: [{ id: '1', actual: 'Todo', expected: 'Review' }, { id: '2', actual: null, expected: 'Todo' }], gaps: [] })
  assert.deepEqual(calls, [])
  assert.equal(auditCards({ ...input, apply: true }).mismatches.length, 2)
  assert.deepEqual(calls, ['state:1:Review', 'member:2', 'state:2:Todo'])
  assert.deepEqual(auditCards(input), { mismatches: [], gaps: [] })
})

test('AC-3: epic content lists each sub-issue and ticks closed children idempotently', () => {
  const before = '# Epic\n\n## Sub-Issues\n\n- [ ] #42 — first\n'
  const children = [{ id: '42', closed: true }, { id: '43', closed: false }]
  const after = updateEpicBody(before, children)
  assert.match(after, /- \[x\] #42 — first/)
  assert.match(after, /- \[ \] #43/)
  assert.equal(updateEpicBody(after, children), after)
  assert.match(updateEpicBody('# Epic\n', children), /## Sub-Issues\n\n- \[x\] #42\n- \[ \] #43/)
  const adjacent = updateEpicBody('## Sub-Issues\n\n- [ ] #420\n', [{ id: '42', closed: true }, { id: '420', closed: false }])
  assert.match(adjacent, /- \[ \] #420/)
  assert.match(adjacent, /- \[x\] #42(?:\n|$)/)
})

test('AC-3: applying a merged fact checks DoD and syncs the existing epic', () => {
  let body = '## Definition of Done Checklist\n\n- [ ] shipped\n'
  let state = { issueState: 'OPEN', issueReason: null, boardState: 'Review', member: true }
  const calls = []
  const pm = {
    cardState: () => state,
    closeCard: () => { calls.push('close'); state = { ...state, issueState: 'CLOSED', issueReason: 'COMPLETED' }; return { confirmed: true } },
    readCard: () => ({ body }),
    updateCard: ({ body: next }) => { calls.push('dod'); body = next },
    syncEpic: () => { calls.push('epic'); return { confirmed: true } },
    setBoardState: ({ state: next }) => { calls.push('board'); state = { ...state, boardState: next }; return { confirmed: true } },
  }
  assert.equal(applyBoardState({ pm, id: '42', pr: 'merged' }).confirmed, true)
  assert.deepEqual(calls, ['close', 'dod', 'epic', 'board'])
  assert.match(body, /- \[x\] shipped/)
})

// #642 / review r0-5: preserve the canonical epic-template and linked reference rows.
// Only the local host transport is replaced; all parsers, adapters and CLI wiring are real.
let epicRepo = dirname(fileURLToPath(import.meta.url))
while (!existsSync(join(epicRepo, 'pnpm-workspace.yaml'))) {
  assert.notEqual(dirname(epicRepo), epicRepo, 'repository root required')
  epicRepo = dirname(epicRepo)
}
const epicCases = [["canonical-section", "- [ ] **US-642:** Keep the board aligned", "642", true, "- [x] **US-642:** Keep the board aligned", "section", "red"], ["canonical-template", "- [ ] **US-642:** Keep the board aligned", "642", true, "- [x] **US-642:** Keep the board aligned", "template", "red"], ["linked-section", "- [ ] [#642](https://example.invalid/issues/642) \u2014 story", "642", true, "- [x] [#642](https://example.invalid/issues/642) \u2014 story", "section", "red"], ["linked-template", "- [ ] [#642](https://example.invalid/issues/642) \u2014 story", "642", true, "- [x] [#642](https://example.invalid/issues/642) \u2014 story", "template", "red"], ["canonical-open", "- [X] **US-642:** Keep the board aligned", "642", false, "- [ ] **US-642:** Keep the board aligned", "section", "red"], ["linked-open", "* [x] [#642](https://example.invalid/issues/642) \u2014 story", "642", false, "* [ ] [#642](https://example.invalid/issues/642) \u2014 story", "section", "red"], ["canonical-already", "- [x] **US-642:** Keep the board aligned", "642", true, "- [x] **US-642:** Keep the board aligned", "section", "red"], ["linked-already", "- [x] [#642](https://example.invalid/issues/642) \u2014 story", "642", true, "- [x] [#642](https://example.invalid/issues/642) \u2014 story", "section", "red"], ["bare-numeric", "- [ ] #642 \u2014 story", "642", true, "- [x] #642 \u2014 story", "section", "pass"], ["bare-open", "* [X] #642: story", "642", false, "* [ ] #642: story", "section", "pass"], ["linear-link", "- [ ] [ENG-642](https://linear.app/example/issue/ENG-642/story)", "ENG-642", true, "- [x] [ENG-642](https://linear.app/example/issue/ENG-642/story)", "section", "red"], ["filesystem-link", "- [ ] [01-01-642](01-01-642.md)", "01-01-642", true, "- [x] [01-01-642](01-01-642.md)", "section", "red"], ["linear-bare", "- [ ] ENG-642 \u2014 story", "ENG-642", true, "- [x] ENG-642 \u2014 story", "section", "pass"], ["filesystem-bare", "- [ ] 01-01-642 \u2014 story", "01-01-642", true, "- [x] 01-01-642 \u2014 story", "section", "pass"], ["adjacent-and-prose", "- [ ] **US-6420:** other\n- [ ] [#6420](https://example.invalid/6420)\nProse #642 stays.", "642", true, "- [ ] **US-6420:** other\n- [ ] [#6420](https://example.invalid/6420)\nProse #642 stays.\n- [x] #642", "section", "pass"], ["missing-section", "# Epic\n\nKeep all prose.", "642", true, "# Epic\n\nKeep all prose.\n\n## Sub-Issues\n\n- [x] #642", "raw", "pass"], ["empty-body", "", "642", true, "\n\n## Sub-Issues\n\n- [x] #642", "raw", "pass"], ["missing-open", "Keep all prose.", "642", false, "Keep all prose.\n- [ ] #642", "section", "pass"]]
const epicRepresentations = [{"id": "dataset-cycle", "path": "packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/"}, {"id": "dataset-green-fix", "path": "packages/knowledge-hub/dataset/.skills/workflow/green-fix/scripts/"}, {"id": "dataset-implement-phase", "path": "packages/knowledge-hub/dataset/.skills/workflow/implement-phase/scripts/"}, {"id": "dataset-red-spec", "path": "packages/knowledge-hub/dataset/.skills/workflow/red-spec/scripts/"}, {"id": "dataset-red-verify", "path": "packages/knowledge-hub/dataset/.skills/workflow/red-verify/scripts/"}, {"id": "dataset-review-phase", "path": "packages/knowledge-hub/dataset/.skills/workflow/review-phase/scripts/"}, {"id": "installed-cycle", "path": ".claude/skills/pair-workflow-cycle/scripts/"}, {"id": "installed-green-fix", "path": ".claude/skills/pair-workflow-green-fix/scripts/"}, {"id": "installed-implement-phase", "path": ".claude/skills/pair-workflow-implement-phase/scripts/"}, {"id": "installed-red-spec", "path": ".claude/skills/pair-workflow-red-spec/scripts/"}, {"id": "installed-red-verify", "path": ".claude/skills/pair-workflow-red-verify/scripts/"}, {"id": "installed-review-phase", "path": ".claude/skills/pair-workflow-review-phase/scripts/"}]
const epicSection = line => `# Epic

Intro remains.

## Sub-Issues

${line}

## Notes

Unrelated note remains.
`
const epicTemplate = line => `# Epic

## Epic Breakdown

### User Stories (High-Level)

#### Must-Have Stories (P0)

${line}
  - **Story points:** 5

## Notes

Unrelated note remains.
`
const epicBody = (line, layout) => layout === 'raw' ? `${line}
` : layout === 'template' ? epicTemplate(line) : epicSection(line)
for (const rep of epicRepresentations) {
  const kit = await import(pathToFileURL(join(epicRepo, rep.path, 'host/adapter-kit.mjs')))
  for (const [name, before, id, closed, expected, layout] of epicCases) {
    test(`r1-g1-${rep.id}-${name}`, () => {
      const children = [{ id, closed }]
      const result = kit.updateEpicBody(epicBody(before, layout), children)
      assert.equal(result, epicBody(expected, layout))
      assert.equal(kit.updateEpicBody(result, children), result, 'replay adds nothing')
    })
  }
}
test('r1-g1-empty-children', () => {
  const body = epicSection('- [ ] #100 — unrelated')
  assert.equal(updateEpicBody(body, []), body)
})

// Executed ONLY as the test's fake gh/az/curl. Unknown calls refuse, never delegate.
async function epicWire(statePath, tool) {
  const fs = await import('node:fs')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const args = process.argv.slice(2)
  const opt = key => args[args.indexOf(key) + 1]
  const output = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value))
  const save = body => {
    state.writes++
    if (!state.refuse) state.body = body
    fs.writeFileSync(statePath, JSON.stringify(state))
  }
  const children = [{ id: state.id, closed: true }, { id: state.sibling, closed: false }]
  if (tool === 'github') {
    if (args[0] === 'issue' && args[1] === 'view') return output(state.body)
    if (args[0] === 'issue' && args[1] === 'edit') return save(opt('--body'))
    if (args[0] === 'api' && args[1].endsWith('/parent')) {
      if (!state.parent) { process.stderr.write('Not Found (HTTP 404)'); process.exitCode = 1; return }
      return output({ number: Number(state.parent) })
    }
    if (args[0] === 'api' && args[1].endsWith('/sub_issues')) return output(children.map(c => ({ number: Number(c.id), state: c.closed ? 'closed' : 'open' })))
  }
  if (tool === 'azure-devops') {
    if (args.slice(0, 3).join(' ') === 'boards work-item update' && args.includes('--description')) { save(opt('--description')); return output({}) }
    if (args.slice(0, 3).join(' ') === 'boards work-item show') {
      const id = opt('--id')
      const rel = (kind, ref) => ({ rel: `System.LinkTypes.Hierarchy-${kind}`, url: `https://dev.azure.com/test/_apis/wit/workItems/${ref}` })
      const relations = id === state.parent ? children.map(c => rel('Forward', c.id)) : state.parent ? [rel('Reverse', state.parent)] : []
      return output({ id: Number(id), fields: { 'System.Description': state.body, 'System.State': id === state.id ? 'Done' : 'Active' }, relations })
    }
  }
  if (tool === 'linear') {
    const request = JSON.parse(fs.readFileSync(0, 'utf8'))
    if (request.query.includes('mutation PairEpic')) { save(request.variables.body); return output(`${JSON.stringify({ data: { issueUpdate: { success: true } } })}\n200`) }
    if (request.query.includes('query PairIssue')) {
      const parent = state.parent ? { identifier: state.parent, children: { nodes: children.map(c => ({ identifier: c.id, state: { type: c.closed ? 'completed' : 'started' } })) } } : null
      const issue = { identifier: request.variables.id, description: state.body, parent, team: { key: 'ENG', id: 'team' } }
      return output(`${JSON.stringify({ data: { issue } })}\n200`)
    }
  }
  throw Error(`unexpected local ${tool} request`)
}
function epicTemp(t) {
  const root = mkdtempSync(join(tmpdir(), 'pair-642-epic-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}
function epicEntry(tool, form) {
  const id = tool === 'linear' ? 'ENG-642' : tool === 'filesystem' ? '01-01-642' : '642'
  const sibling = tool === 'linear' ? 'ENG-643' : tool === 'filesystem' ? '01-01-643' : '643'
  const parent = tool === 'linear' ? 'ENG-605' : tool === 'filesystem' ? '01-01' : '605'
  const ref = /^\d+$/.test(id) ? `#${id}` : id
  const label = form === 'canonical' ? `**US-${id}:** story` : form === 'linked' ? `[${ref}](https://example.invalid/${id}) — story` : `${ref} — story`
  const siblingRef = /^\d+$/.test(sibling) ? `#${sibling}` : sibling
  const before = epicSection(`- [ ] ${label}\n- [ ] ${siblingRef} — sibling`)
  const expected = epicSection(`- [x] ${label}\n- [ ] ${siblingRef} — sibling`)
  return { id, sibling, parent, before, expected }
}
function epicRemote(t, tool, entry, control) {
  const root = epicTemp(t)
  const statePath = join(root, 'state.json')
  writeFileSync(statePath, JSON.stringify({ ...entry, parent: control === 'no-parent' ? null : entry.parent, body: entry.before, writes: 0, refuse: control === 'refused-write' }))
  const script = join(root, 'transport.mjs')
  writeFileSync(script, `(${epicWire.toString()})(${JSON.stringify(statePath)}, ${JSON.stringify(tool)})`)
  const bin = join(root, tool)
  writeFileSync(bin, `#!/bin/sh\nexec '${process.execPath}' '${script}' "$@"\n`, { mode: 0o755 })
  const envToken = process.env.LINEAR_API_KEY
  if (tool === 'linear') {
    process.env.LINEAR_API_KEY = 'test-only-placeholder'
    t.after(() => { if (envToken === undefined) delete process.env.LINEAR_API_KEY; else process.env.LINEAR_API_KEY = envToken })
  }
  return { transport: { ghBin: bin, azBin: bin, curlBin: bin, team: 'ENG', retryDelayMs: 0 }, state: () => JSON.parse(readFileSync(statePath, 'utf8')) }
}
function epicFilesystem(t, entry, control) {
  const root = epicTemp(t)
  const backlog = join(root, '.pair/adoption/product/backlog')
  const stories = join(backlog, '03-user-stories/completed')
  const epics = join(backlog, '02-epics/in-progress')
  mkdirSync(stories, { recursive: true })
  mkdirSync(epics, { recursive: true })
  writeFileSync(join(stories, `${entry.id}.md`), '# Story\n\n**Status**: Done\n\n## Definition of Done Checklist\n\n- [x] shipped\n')
  // The sibling must live outside completed, whose folder is itself a closed-state authority.
  const open = join(backlog, '03-user-stories/in-progress')
  mkdirSync(open, { recursive: true })
  writeFileSync(join(open, `${entry.sibling}.md`), '# Sibling\n\n**Status**: In Progress\n')
  const parentPath = join(epics, `${entry.parent}.md`)
  if (control !== 'no-parent') writeFileSync(parentPath, entry.before)
  const gitBin = join(root, 'git')
  writeFileSync(gitBin, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  if (control === 'refused-write') {
    chmodSync(parentPath, 0o444)
    t.after(() => { if (existsSync(parentPath)) chmodSync(parentPath, 0o644) })
  }
  return { root, parentPath, transport: { root, gitBin }, state: () => ({ body: readFileSync(parentPath, 'utf8') }) }
}
async function epicConsumer(t, scripts, tool, form, control) {
  const { default: adapter } = await import(pathToFileURL(join(epicRepo, scripts, `host/${tool}.mjs`)))
  const entry = epicEntry(tool, form)
  const setup = tool === 'filesystem' ? epicFilesystem(t, entry, control) : epicRemote(t, tool, entry, control)
  const make = () => adapter.instantiate(setup.transport)
  const first = make().syncEpic({ id: entry.id, repo: 'owner/repo' })
  if (control) {
    assert.equal(first.confirmed, false)
    if (control === 'no-parent') assert.equal(first.gap, 'parent-absent')
    else if (tool === 'filesystem') { assert.equal(first.gap, 'epic-sync-failed'); assert.match(first.error, /EACCES|EPERM/) }
    else assert.match(first.error, /read-back:.*checklist differs/)
    if (control !== 'no-parent') assert.equal(setup.state().body, entry.before)
    return
  }
  assert.equal(first.confirmed, true, JSON.stringify(first))
  assert.equal(setup.state().body, entry.expected)
  const second = make().syncEpic({ id: entry.id, repo: 'owner/repo' })
  assert.equal(second.confirmed, true, JSON.stringify(second))
  assert.equal(second.changed, false, 'restart does not append or rewrite')
  assert.equal(setup.state().body, entry.expected)
  if (tool !== 'filesystem') assert.equal(setup.state().writes, 1)
}
for (const rep of epicRepresentations) {
  const side = rep.id.endsWith('-cycle') ? rep.id.split('-')[0] : rep.id
  for (const tool of ['github', 'azure-devops', 'linear', 'filesystem']) {
    const forms = ['github', 'azure-devops'].includes(tool) ? ['bare', 'linked', 'canonical'] : ['bare', 'linked']
    for (const form of forms) test(`r1-g1-${side}-${tool}-${form}`, t => epicConsumer(t, rep.path, tool, form))
    for (const control of ['no-parent', 'refused-write'])
      test(`r1-g1-${side}-${tool}-${control}`, t => epicConsumer(t, rep.path, tool, 'bare', control))
  }
  if (!rep.id.endsWith('-cycle')) continue
  for (const form of ['bare', 'linked']) {
    test(`r1-g1-${side}-cli-${form}`, t => {
      const entry = epicEntry('filesystem', form)
      const fixture = epicFilesystem(t, entry)
      const adoption = join(fixture.root, '.pair/adoption/tech')
      mkdirSync(adoption, { recursive: true })
      writeFileSync(join(adoption, 'way-of-working.md'), '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `github`\n')
      const env = { ...process.env, PATH: `${fixture.root}:/usr/bin:/bin`, PAIR_PM_ROOT: fixture.root }
      const call = () => spawnSync(process.execPath, [join(epicRepo, rep.path, 'board-transition.mjs'), '--story', entry.id, '--pr-state', 'merged'], { cwd: fixture.root, env, encoding: 'utf8', timeout: 5000 })
      const first = call()
      assert.equal(first.status, 0, first.stderr)
      assert.equal(JSON.parse(first.stdout).confirmed, true, first.stdout)
      assert.equal(fixture.state().body, entry.expected)
      const second = call()
      assert.equal(second.status, 0, second.stderr)
      assert.equal(JSON.parse(second.stdout).confirmed, true, second.stdout)
      assert.equal(fixture.state().body, entry.expected)
    })
  }
}

function epicCliWorld(t, form) {
  const entry = epicEntry('filesystem', form)
  const fixture = epicFilesystem(t, entry)
  const adoption = join(fixture.root, '.pair/adoption/tech')
  mkdirSync(adoption, { recursive: true })
  writeFileSync(join(adoption, 'way-of-working.md'), '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `github`\n')
  const gh = join(fixture.root, 'gh')
  const log = join(fixture.root, 'calls.jsonl')
  writeFileSync(log, '')
  const stub = join(fixture.root, 'gh.mjs')
  writeFileSync(stub, `import { appendFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n')
if (a[0] === 'api' && a.includes('--paginate') && a.some(s => s.includes('/pulls?'))) process.stdout.write(JSON.stringify([{ title: 'Fixture', body: 'Refs: ${entry.id}', state: 'closed', merged_at: '2026-01-01' }]))
else if (a[0] === 'api' && a.some(s => s.endsWith('/labels'))) process.stdout.write('[]')
else if (a[0] === 'pr' && a[1] === 'view' && a.includes('mergedAt')) process.stdout.write(JSON.stringify({ mergedAt: '2026-01-01' }))
else { process.stderr.write('fixture refuses unsupported gh request'); process.exitCode = 1 }
`)
  writeFileSync(gh, `#!/bin/sh\nexec '${process.execPath}' '${stub}' "$@"\n`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${fixture.root}:/usr/bin:/bin`, PAIR_PM_ROOT: fixture.root, PAIR_GH_BIN: gh }
  const call = (scripts, command, args) => {
    const result = spawnSync(process.execPath, [join(epicRepo, scripts, command), ...args], { cwd: fixture.root, env, encoding: 'utf8', timeout: 5000 })
    assert.equal(result.status, 0, result.stderr + result.stdout)
    return JSON.parse(result.stdout)
  }
  const noMerge = () => {
    const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s))
    assert.equal(calls.some(a => a[0] === 'pr' && a[1] === 'merge'), false)
  }
  return { ...fixture, entry, call, noMerge }
}
for (const rep of epicRepresentations.filter(r => r.id.endsWith('-cycle'))) {
  const side = rep.id.split('-')[0]
  for (const form of ['bare', 'linked']) {
    test(`r1-g1-${side}-audit-cli-${form}`, t => {
      const world = epicCliWorld(t, form)
      const child = join(world.root, '.pair/adoption/product/backlog/03-user-stories/completed', `${world.entry.id}.md`)
      writeFileSync(child, readFileSync(child, 'utf8').replace('**Status**: Done', '**Status**: Review'))
      const args = ['--repo', 'owner/repo']
      const before = world.call(rep.path, 'board-audit.mjs', args)
      assert.deepEqual(before.gaps, [])
      assert.deepEqual(before.mismatches, [{ id: world.entry.id, actual: 'Review', expected: 'Done' }])
      assert.equal(world.state().body, world.entry.before)
      const applied = world.call(rep.path, 'board-audit.mjs', [...args, '--apply'])
      assert.deepEqual(applied.gaps, [])
      assert.equal(world.state().body, world.entry.expected)
      const again = world.call(rep.path, 'board-audit.mjs', args)
      assert.deepEqual(again.mismatches, [])
      assert.deepEqual(again.gaps, [])
      assert.equal(world.state().body, world.entry.expected)
      world.noMerge()
    })
    test(`r1-g1-${side}-merge-resume-cli-${form}`, t => {
      const world = epicCliWorld(t, form)
      const args = ['run', '--dir', world.root, '--story', world.entry.id, '--pr', '644', '--reviewedHead', 'a'.repeat(40), '--cardTier', 'risk:yellow', '--autoAdvance', '["risk:yellow"]', '--gate', 'green', '--message', 'fixture only', '--root', world.root, '--repo', 'owner/repo']
      const result = world.call(rep.path, 'cycle-merge.mjs', args)
      assert.equal(result.cascade.epic.confirmed, true, JSON.stringify(result.cascade.epic))
      assert.equal(world.state().body, world.entry.expected)
      const again = world.call(rep.path, 'cycle-merge.mjs', args)
      assert.equal(again.cascade.epic.changed, false)
      assert.equal(world.state().body, world.entry.expected)
      world.noMerge()
    })
  }
}

// r0-5 / repair: projection is document-wide; identity is the leading reference,
// never a description/URL mention. With no related children it is the identity map.
const repairCases = []
for (const [form, target, sibling] of [
  ['canonical', '**US-642:** target', '[#643](https://example.invalid/643) sibling'],
  ['linked', '[#642](https://example.invalid/642) target', '**US-643:** sibling'],
]) {
  for (const position of ['before', 'after']) {
    const outside = `## Epic Breakdown\n\n- [ ] ${target}\n`
    const section = `## Sub-Issues\n\n- [x] ${sibling}\n`
    const body = `# Epic\n\n${position === 'before' ? `${outside}\n${section}` : `${section}\n${outside}`}`
    repairCases.push({ name: `mixed-${form}-${position}`, body,
      children: [{ id: '642', closed: true }, { id: '643', closed: false }],
      expected: body.replace(`- [ ] ${target}`, `- [x] ${target}`).replace(`- [x] ${sibling}`, `- [ ] ${sibling}`) })
  }
}
for (const [form, target, sibling, id, siblingId] of [
  ['bare', '#642', '#643', '642', '643'],
  ['canonical', '**US-642:**', '**US-643:**', '642', '643'],
  ['linked', '[#642](https://example.invalid/642)', '[#643](https://example.invalid/643)', '642', '643'],
  ['linear', 'ENG-642', 'ENG-643', 'ENG-642', 'ENG-643'],
  ['linear-linked', '[ENG-642](https://linear.app/ENG-642)', '[ENG-643](https://linear.app/ENG-643)', 'ENG-642', 'ENG-643'],
  ['filesystem', '01-01-642', '01-01-643', '01-01-642', '01-01-643'],
  ['filesystem-linked', '[01-01-642](01-01-642.md)', '[01-01-643](01-01-643.md)', '01-01-642', '01-01-643'],
]) {
  for (const order of ['target-first', 'sibling-first']) {
    const body = epicSection(`- [ ] ${sibling} — depends on ${target} ; URL https://example.invalid/${id}\n- [ ] ${target} — target\n- [ ] #900 — URL [other](https://example.invalid/${id})`)
    const children = [{ id, closed: true }, { id: siblingId, closed: false }]
    repairCases.push({ name: `identity-${form}-${order}`, body,
      children: order === 'target-first' ? children : [...children].reverse(),
      expected: body.replace(`- [ ] ${target} — target`, `- [x] ${target} — target`) })
  }
}
repairCases.push({ name: 'paragraph-spacing', body: '## Sub-Issues\n\n- [ ] #642\n\nFirst paragraph.\n\nSecond paragraph.\n\n- unrelated list\n\n  indented prose\n', children: [{ id: '642', closed: true }], expected: '## Sub-Issues\n\n- [x] #642\n\nFirst paragraph.\n\nSecond paragraph.\n\n- unrelated list\n\n  indented prose\n' })
for (const [layout, body] of [['heading', epicSection('- [ ] #642\n\nFirst.\n\nSecond.')], ['plain', '# Epic\n\nFirst.\n\nSecond.\n'], ['empty', '']]) {
  repairCases.push({ name: `no-children-${layout}`, body, children: [], expected: body })
}
for (const rep of epicRepresentations) {
  const kit = await import(pathToFileURL(join(epicRepo, rep.path, 'host/adapter-kit.mjs')))
  for (const row of repairCases) test(`r1-g1-repair-${rep.id}-${row.name}`, () => {
    const actual = kit.updateEpicBody(row.body, row.children)
    assert.equal(actual, row.expected)
    assert.equal(kit.updateEpicBody(actual, row.children), row.expected, 'replay preserves the same document')
  })
}

// These are transport responses, not a replacement projection or adapter.
async function repairCliWire(statePath, tool) {
  const fs = await import('node:fs')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const a = process.argv.slice(2)
  const opt = key => a[a.indexOf(key) + 1]
  const out = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value))
  const persist = () => fs.writeFileSync(statePath, JSON.stringify(state))
  state.calls.push([tool, ...a]); persist()
  const storyBody = '## Story Statement\n\nFixture\n\n## Definition of Done Checklist\n\n- [x] shipped\n'
  const updateBody = (id, body) => {
    assertParent(id)
    state.writes++
    if (!state.refuse) state.body = body
    persist()
  }
  const assertParent = id => { if (String(id) !== state.parent) throw Error('unexpected epic identity') }
  if (tool === 'github') {
    if (a[0] === 'pr' && a[1] === 'view' && a.includes('mergedAt')) return out({ mergedAt: '2026-01-01' })
    if (a[0] === 'api' && a.some(s => s.endsWith('/labels'))) return out([])
    if (a[0] === 'api' && a.some(s => s.includes('/pulls?'))) return out([{ body: `Refs: ${state.id}`, state: 'closed', merged_at: '2026-01-01' }])
    if (a[0] === 'api' && a.some(s => s.includes('/issues?'))) return out([{ number: Number(state.id), body: storyBody }])
    if (a[0] === 'issue' && a[1] === 'view') {
      if (a.includes('-q')) return out(a[2] === state.parent ? state.body : storyBody)
      return out({ state: 'CLOSED', stateReason: 'COMPLETED', projectItems: [{ status: { name: state.board } }], labels: [], body: storyBody })
    }
    if (a[0] === 'issue' && a[1] === 'edit' && a.includes('--body')) return updateBody(a[2], opt('--body'))
    if (a[0] === 'issue' && a[1] === 'close') { if (a[2] !== state.id) throw Error('unrelated close'); return }
    if (a[0] === 'project' && a[1] === 'list') return out({ projects: [{ id: 'project', title: 'Fixture' }] })
    if (a[0] === 'api' && a[1] === 'graphql') {
      if (a.some(s => s.includes('updateProjectV2ItemFieldValue'))) {
        state.board = 'Done'; persist()
        return out({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { fieldValueByName: { name: 'Done' } } } } })
      }
      return out({ data: { repository: { issue: { id: 'issue', projectItems: { nodes: [{ id: 'item', project: { id: 'project', title: 'Fixture', fields: { nodes: [{ id: 'status', name: 'Status', options: [{ id: 'done', name: 'Done' }] }] } } }] } } } } })
    }
  }
  if (tool === 'azure-devops') {
    if (a.slice(0, 2).join(' ') === 'boards query') return out([{ id: Number(state.id) }])
    if (a.slice(0, 3).join(' ') === 'boards work-item update') {
      if (a.includes('--description')) updateBody(opt('--id'), opt('--description'))
      if (a.includes('--state')) { state.board = opt('--state'); persist() }
      return out({})
    }
    if (a.slice(0, 3).join(' ') === 'boards work-item show') {
      const id = opt('--id')
      const rel = (kind, ref) => ({ rel: `System.LinkTypes.Hierarchy-${kind}`, url: `https://dev.azure.com/test/_apis/wit/workItems/${ref}` })
      const relations = id === state.parent ? [rel('Forward', state.id), rel('Forward', state.sibling)] : [rel('Reverse', state.parent)]
      return out({ id: Number(id), fields: { 'System.Description': id === state.parent ? state.body : storyBody, 'System.State': id === state.id ? state.board : 'Active' }, relations })
    }
  }
  if (tool === 'linear') {
    const req = JSON.parse(fs.readFileSync(0, 'utf8'))
    const reply = value => out(`${JSON.stringify({ data: value })}\n200`)
    if (req.query.includes('query PairStories')) return reply({ issues: { nodes: [{ identifier: state.id, description: storyBody }], pageInfo: { hasNextPage: false } } })
    if (req.query.includes('mutation PairSetState')) { state.board = 'Done'; persist(); return reply({ issueUpdate: { success: true } }) }
    if (req.query.includes('mutation PairEpic')) { updateBody(req.variables.id, req.variables.body); return reply({ issueUpdate: { success: true } }) }
    if (req.query.includes('query PairIssue')) {
      const parent = { identifier: state.parent, children: { nodes: [{ identifier: state.id, state: { type: 'completed' } }, { identifier: state.sibling, state: { type: 'started' } }] } }
      return reply({ issue: { identifier: req.variables.id, description: req.variables.id === state.parent ? state.body : storyBody, state: { type: state.board === 'Done' ? 'completed' : 'started', name: state.board }, parent, team: { id: 'team', key: 'ENG', states: { nodes: [{ id: 'done', name: 'Done' }] } }, labels: { nodes: [] } } })
    }
    throw Error(`unexpected local linear request: ${req.query}`)
  }
  return epicWire(statePath, tool)
}
function repairCliWorld(t, tool, form, family, refuse = false) {
  const entry = epicEntry(tool, form)
  if (tool === 'filesystem') {
    const world = epicCliWorld(t, form)
    if (refuse) chmodSync(world.parentPath, 0o444)
    t.after(() => { if (existsSync(world.parentPath)) chmodSync(world.parentPath, 0o644) })
    return world
  }
  const root = epicTemp(t)
  const statePath = join(root, 'state.json')
  writeFileSync(statePath, JSON.stringify({ ...entry, body: entry.before, writes: 0, calls: [], board: family === 'audit' ? 'Review' : 'Done', refuse }))
  const adoption = join(root, '.pair/adoption/tech')
  mkdirSync(adoption, { recursive: true })
  writeFileSync(join(adoption, 'way-of-working.md'), `- \`pm-tool\`: \`${tool}\`\n- \`linear-team\`: \`ENG\`\n- \`pm-project\`: \`Fixture\`\n\n## Git Workflow\n\n- \`code-host\`: \`github\`\n`)
  const bins = {}
  for (const wireTool of new Set([tool, 'github'])) {
    const script = join(root, `${wireTool}.mjs`)
    writeFileSync(script, `${epicWire.toString()}\n(${repairCliWire.toString()})(${JSON.stringify(statePath)}, ${JSON.stringify(wireTool)})`)
    bins[wireTool] = join(root, wireTool === 'github' ? 'gh' : wireTool === 'linear' ? 'curl' : 'az')
    writeFileSync(bins[wireTool], `#!/bin/sh\nexec '${process.execPath}' '${script}' "$@"\n`, { mode: 0o755 })
  }
  writeFileSync(join(root, 'git'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  const env = { ...process.env, PATH: `${root}:/usr/bin:/bin`, PAIR_GH_BIN: bins.github, PAIR_AZ_BIN: bins['azure-devops'], PAIR_CURL_BIN: bins.linear, LINEAR_API_KEY: 'test-only-placeholder', PAIR_PM_ROOT: root }
  const state = () => JSON.parse(readFileSync(statePath, 'utf8'))
  const call = (scripts, command, args) => {
    const result = spawnSync(process.execPath, [join(epicRepo, scripts, command), ...args], { cwd: root, env, encoding: 'utf8', timeout: 8000 })
    assert.equal(result.status, 0, result.stderr + result.stdout)
    return JSON.parse(result.stdout)
  }
  const noMerge = () => assert.equal(state().calls.some(a => a[1] === 'pr' && a[2] === 'merge'), false)
  return { root, entry, call, state, noMerge }
}
function repairArgs(world, family) {
  if (family === 'transition') return ['--story', world.entry.id, '--repo', 'owner/repo', '--pr-state', 'merged']
  if (family === 'audit') return ['--repo', 'owner/repo', '--apply']
  return ['run', '--dir', world.root, '--story', world.entry.id, '--pr', '644', '--reviewedHead', 'a'.repeat(40), '--cardTier', 'risk:yellow', '--autoAdvance', '["risk:yellow"]', '--gate', 'green', '--message', 'fixture only', '--root', world.root, '--repo', 'owner/repo']
}
for (const rep of epicRepresentations.filter(r => r.id.endsWith('-cycle'))) {
  for (const tool of ['github', 'azure-devops', 'linear', 'filesystem']) {
    const forms = ['github', 'azure-devops'].includes(tool) ? ['bare', 'linked', 'canonical'] : ['bare', 'linked']
    for (const family of ['transition', 'audit', 'merge']) {
      for (const form of forms) {
        // Existing filesystem rows already cover each family and form, retained unchanged.
        if (tool === 'filesystem') continue
        test(`r1-g1-repair-cli-${rep.id}-${tool}-${family}-${form}`, t => repairCli(t, rep, tool, family, form, false))
      }
      test(`r1-g1-repair-cli-${rep.id}-${tool}-${family}-refused`, t => repairCli(t, rep, tool, family, 'bare', true))
    }
  }
}
function repairCli(t, rep, tool, family, form, refused) {
  const world = repairCliWorld(t, tool, form, family, refused)
  if (tool === 'filesystem' && family === 'audit') {
    const child = join(world.root, '.pair/adoption/product/backlog/03-user-stories/completed', `${world.entry.id}.md`)
    writeFileSync(child, readFileSync(child, 'utf8').replace('**Status**: Done', '**Status**: Review'))
  }
  const command = family === 'merge' ? 'cycle-merge.mjs' : `board-${family}.mjs`
  const args = repairArgs(world, family)
  if (family === 'audit') {
    const report = world.call(rep.path, command, ['--repo', 'owner/repo'])
    assert.deepEqual(report.gaps, [])
    assert.equal(report.mismatches.length, 1)
    assert.equal(world.state().body, world.entry.before, 'report-only preserves epic')
  }
  const result = world.call(rep.path, command, args)
  if (refused) {
    if (family === 'transition') { assert.equal(result.confirmed, false); assert.deepEqual(result.gaps, ['epic-sync-failed']) }
    if (family === 'audit') assert.deepEqual(result.gaps, [{ id: world.entry.id, reason: 'epic-sync-failed' }])
    if (family === 'merge') { assert.equal(result.cascade.epic.confirmed, false); assert.equal(result.cascade.epic.ok, false) }
    assert.equal(world.state().body, world.entry.before)
    world.noMerge()
    return
  }
  if (family === 'transition') assert.equal(result.confirmed, true, JSON.stringify(result))
  if (family === 'audit') assert.deepEqual(result.gaps, [])
  if (family === 'merge') assert.equal(result.cascade.epic.confirmed, true, JSON.stringify(result))
  assert.equal(world.state().body, world.entry.expected)
  const again = world.call(rep.path, command, args)
  if (family === 'transition') assert.equal(again.confirmed, true)
  if (family === 'audit') { assert.deepEqual(again.mismatches, []); assert.deepEqual(again.gaps, []) }
  if (family === 'merge') assert.equal(again.cascade.epic.changed, false)
  assert.equal(world.state().body, world.entry.expected)
  assert.equal(world.state().writes, 1)
  world.noMerge()
}
