// US-572: the Filesystem PM adapter (scripts/host/filesystem.mjs) — white-box on a tmp backlog.
// RUNS FROM `.claude/workflows` ONLY (like host-adapter.test.mjs).
for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { bindHosts, resolveHosts, implementedHosts } from '../../skills/pair-workflow-cycle/scripts/host/index.mjs'
import fsAdapter, { BACKLOG_REL } from '../../skills/pair-workflow-cycle/scripts/host/filesystem.mjs'

const STORY = '# US 01-01-001: Login\n\n**Status**: Refined\n**Labels**: risk:yellow, cli\n\n## Acceptance Criteria\n\n1. works\n'
const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' })

function fixture({ repo = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fs-pm-'))
  const b = join(root, BACKLOG_REL)
  for (const d of ['02-epics/in-progress', '03-user-stories/not-started', '03-user-stories/completed']) mkdirSync(join(b, d), { recursive: true })
  writeFileSync(join(b, '02-epics/in-progress/01-01-auth.md'), '# Epic 01-01: Auth\n\n**Status**: In Progress\n')
  writeFileSync(join(b, '03-user-stories/not-started/01-01-001-login.md'), STORY)
  writeFileSync(join(b, '03-user-stories/completed/01-01-002-logout.md'), '# US 01-01-002\n\n**Status**: Done\n')
  if (repo) {
    git(root, 'init', '-q', '-b', 'main')
    git(root, 'add', '-A')
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init')
  }
  return { root, b, pm: fsAdapter.instantiate({ root }) }
}

test('registered: pm-tool filesystem + code-host github binds the card side to files and the PR side to github', () => {
  assert.ok(implementedHosts().includes('filesystem'))
  const r = resolveHosts({ text: '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `github`\n' })
  assert.deepEqual([r.pmTool, r.codeHost], ['filesystem', 'github'])
  const h = bindHosts({ binding: r })
  assert.equal(h.pm.errorPrefix, 'fs')
  assert.equal(h.code.errorPrefix, 'gh')
  // filesystem alone hosts no code: a PR operation is refused, never guessed onto github
  const alone = resolveHosts({ text: 'Filesystem is adopted for project management, using markdown files.\n' })
  assert.deepEqual([alone.pmTool, alone.codeHost], ['filesystem', null])
})

test('parseCardRef: opaque ids pass unchanged; traversal, separators, whitespace and absolute paths are invalid-input before any fs access', () => {
  const pm = fsAdapter.instantiate({ root: join(tmpdir(), 'does-not-exist-572') })
  for (const id of ['IN-01', '01-01-001', 'ENG-123', '572']) assert.deepEqual(pm.parseCardRef(id), { id, number: id, inScope: true })
  assert.equal(pm.parseCardRef('#572').id, '572')
  for (const bad of ['../x', 'a/b', '..', 'a..b', '/etc/passwd', 'a b', '', ' IN-01', 'a\\b']) assert.throws(() => pm.parseCardRef(bad), e => e.kind === 'invalid-input', bad)
  assert.throws(() => pm.readCard('../../etc/passwd'), e => e.kind === 'invalid-input')
})

test('readCard: body excludes state/labels/comments, fields follow the code-host --json dialect, the hash is stable across meta writes', () => {
  const { pm } = fixture()
  const v = pm.readCard('01-01-001', { fields: ['number', 'title', 'labels', 'state'] })
  assert.deepEqual(v, { number: '01-01-001', title: 'US 01-01-001: Login', labels: [{ name: 'risk:yellow' }, { name: 'cli' }], state: 'OPEN' })
  assert.doesNotMatch(pm.readCard('01-01-001').body, /\*\*Status\*\*|\*\*Labels\*\*/)
  const h = pm.cardHash('01-01-001')
  pm.setBoardState({ id: '01-01-001', state: 'In Progress' })
  pm.labelCard({ id: '01-01-001', label: 'needs-review' })
  pm.commentOnCard({ id: '01-01-001', marker: '<!-- m -->', body: 'parked' })
  assert.equal(pm.cardHash('01-01-001'), h)
  assert.equal(pm.readCard('01-01').body.includes('Auth'), true, 'an epic id never resolves to its child story')
  assert.throws(() => pm.readCard('09-09'), e => /not found/.test(e.message))
})

test('setBoardState: moves the file to the status folder AND writes the Status line; unknown state is reported, not thrown', () => {
  const { pm, b } = fixture()
  assert.deepEqual(pm.setBoardState({ id: '01-01-001', state: 'In Progress' }), { applied: 'In Progress', confirmed: true, error: null })
  const moved = join(b, '03-user-stories/in-progress/01-01-001-login.md')
  assert.ok(existsSync(moved) && !existsSync(join(b, '03-user-stories/not-started/01-01-001-login.md')))
  assert.match(readFileSync(moved, 'utf8'), /^\*\*Status\*\*: In Progress$/m)
  const r = pm.setBoardState({ id: '01-01-001', state: 'Bogus' })
  assert.equal(r.confirmed, false)
  assert.match(r.error, /no status folder/)
})

test('labels: labelCard/unlabelCard edit the Labels line, read back', () => {
  const { pm } = fixture()
  assert.equal(pm.labelCard({ id: '01-01-001', label: 'needs-review' }).confirmed, true)
  assert.deepEqual(pm.readLabels({ id: '01-01-001' }), ['risk:yellow', 'cli', 'needs-review'])
  assert.equal(pm.unlabelCard({ id: '01-01-001', label: 'cli' }).confirmed, true)
  assert.deepEqual(pm.readLabels({ id: '01-01-001' }), ['risk:yellow', 'needs-review'])
})

test('commentOnCard: marker-keyed, idempotent upsert', () => {
  const { pm, b } = fixture()
  assert.equal(pm.commentOnCard({ id: '01-01-001', marker: '<!-- park -->', body: 'one' }).action, 'created')
  assert.equal(pm.commentOnCard({ id: '01-01-001', marker: '<!-- park -->', body: 'one' }).action, 'unchanged')
  assert.equal(pm.commentOnCard({ id: '01-01-001', marker: '<!-- park -->', body: 'two' }).action, 'updated')
  assert.equal(pm.commentOnCard({ id: '01-01-001', marker: '<!-- other -->', body: 'x' }).action, 'created')
  const text = readFileSync(join(b, '03-user-stories/not-started/01-01-001-login.md'), 'utf8')
  assert.equal(text.match(/<!-- park -->/g).length, 1)
  assert.match(text, /<!-- park -->\ntwo/)
})

test('closeAndCascade (main checkout): the story closes, the epic closes when every child is done', () => {
  const { pm, b } = fixture()
  assert.deepEqual(pm.closeAndCascade({ id: '01-01-001' }), { closed: ['01-01-001', '01-01'], stoppedAt: null })
  assert.ok(existsSync(join(b, '03-user-stories/completed/01-01-001-login.md')))
  assert.ok(existsSync(join(b, '02-epics/completed/01-01-auth.md')))
})

test('closeAndCascade stops at a parent with an open child', () => {
  const { pm, b } = fixture()
  writeFileSync(join(b, '03-user-stories/not-started/01-01-003-reset.md'), '# US 01-01-003\n\n**Status**: Todo\n')
  assert.deepEqual(pm.closeAndCascade({ id: '01-01-001' }), { closed: ['01-01-001'], stoppedAt: '01-01' })
})

test('in a story worktree: writes are committed on its branch, the epic cascade is deferred to merge', () => {
  const { root } = fixture({ repo: true })
  const wt = join(mkdtempSync(join(tmpdir(), 'fs-pm-wt-')), 'story')
  assert.equal(git(root, 'worktree', 'add', '-q', '-b', 'feature/x', wt).status, 0)
  git(wt, 'config', 'user.name', 't')
  git(wt, 'config', 'user.email', 't@t')
  const pm = fsAdapter.instantiate({ root: wt })
  assert.equal(pm.setBoardState({ id: '01-01-001', state: 'In Progress' }).confirmed, true)
  assert.equal(git(wt, 'status', '--porcelain').stdout, '', 'the move is committed, nothing left dirty')
  assert.match(git(wt, 'log', '-1', '--format=%s').stdout, /^\[#01-01-001\] chore: card state → In Progress/)
  assert.equal(git(root, 'log', '-1', '--format=%s').stdout.trim(), 'init', 'the default branch is untouched')
  assert.deepEqual(pm.closeAndCascade({ id: '01-01-001' }), { closed: ['01-01-001'], stoppedAt: null, cascade: 'deferred-to-merge' })
})

test('outside a worktree: the write stays in the tree with one warning line', () => {
  const { root } = fixture({ repo: true })
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import a from ${JSON.stringify(new URL('../../skills/pair-workflow-cycle/scripts/host/filesystem.mjs', import.meta.url).href)}; a.instantiate({ root: ${JSON.stringify(root)} }).labelCard({ id: '01-01-001', label: 'x' })`], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /^fs: warning — card 01-01-001 written in .* \(no story worktree\)/)
  assert.notEqual(git(root, 'status', '--porcelain').stdout, '')
})

test('code-side operations are refused typed (hostsCode: false)', () => {
  const { pm } = fixture()
  assert.throws(() => pm.prHead({ pr: 1 }), e => e.kind === 'unsupported' && e.method === 'prHead')
  assert.throws(() => pm.resolveUser(), e => e.kind === 'not-implemented' && e.method === 'resolveUser')
})

test('r0-1: a slug opening on a digit is the card own slug, not a child id', () => {
  const { pm, b } = fixture()
  writeFileSync(join(b, '03-user-stories/not-started/01-01-004-3-step-wizard.md'), '# US 01-01-004: Wizard\n\n**Status**: Todo\n')
  assert.equal(pm.readCard('01-01-004', { fields: ['title'] }).title, 'US 01-01-004: Wizard')
  assert.equal(pm.readCard('01-01').body.includes('Auth'), true, 'the epic still never resolves to a child story')
})
