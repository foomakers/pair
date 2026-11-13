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
else if (a[0] === 'api' && a[1] === '--paginate' && a[2].includes('/issues?')) process.stdout.write(JSON.stringify(s.issues))
else if (a[0] === 'api' && a[1] === '--paginate' && a[2].includes('/pulls?')) process.stdout.write(JSON.stringify(s.prs))
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
