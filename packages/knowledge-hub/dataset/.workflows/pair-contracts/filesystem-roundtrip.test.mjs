// US-572 AC6/AC7 + edge cases: one cycle round-trip on a Filesystem backlog with GitHub as the code host
// (gh stubbed). The card is activated INSIDE the story worktree (committed on its branch, default branch
// untouched); the PR is merged on GitHub; the card closes and the epic cascades at merge, on the default
// branch's tree. RUNS FROM `.claude/workflows` ONLY.
for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPTS = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/', import.meta.url))
const HEAD = 'c'.repeat(40)
const BACKLOG = '.pair/adoption/product/backlog'
const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' })

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'fs-roundtrip-'))
  const main = join(base, 'main')
  mkdirSync(join(main, '.pair/adoption/tech'), { recursive: true })
  writeFileSync(join(main, '.pair/adoption/tech/way-of-working.md'), '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `github`\n')
  for (const d of ['02-epics/in-progress', '03-user-stories/not-started']) mkdirSync(join(main, BACKLOG, d), { recursive: true })
  writeFileSync(join(main, BACKLOG, '02-epics/in-progress/01-01-auth.md'), '# Epic 01-01: Auth\n\n**Status**: In Progress\n')
  writeFileSync(join(main, BACKLOG, '03-user-stories/not-started/01-01-001-login.md'), '# US 01-01-001: Login\n\n**Status**: Refined\n**Labels**: risk:green\n\nbody\n')
  writeFileSync(join(main, '.gitignore'), '.pair/working/\n')
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'add', '-A')
  git(main, 'commit', '-qm', 'init')
  const run = join(main, '.pair/working/runs/story-01-01-001/01-01-001')
  mkdirSync(run, { recursive: true })
  writeFileSync(join(run, '.host-binding.json'), JSON.stringify({ schemaVersion: 1, pmTool: 'filesystem', codeHost: 'github' }))
  const wt = join(base, 'wt')
  git(main, 'worktree', 'add', '-q', '-b', 'feature/US-01-01-001-login', wt)
  // gh: only the code-host side is ever asked — a card read through gh is a routing bug, refused loudly.
  const log = join(base, 'gh.log')
  writeFileSync(log, '')
  writeFileSync(
    join(base, 'gh'),
    `#!/usr/bin/env node
const a = process.argv.slice(2), j = a.join(' ')
require('fs').appendFileSync(${JSON.stringify(log)}, j + '\\n')
const out = v => { process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v)); process.exit(0) }
if (a[0] === 'issue') { process.stderr.write('card read through gh: ' + j); process.exit(9) }
if (a[0] === 'pr' && a[1] === 'view') out(${JSON.stringify(HEAD)} + '\\n')
if (a[0] === 'pr' && a[1] === 'merge') out('')
if (a[0] === 'api' && /commits\\/[0-9a-f]{40}\\/status$/.test(a[1])) out({ statuses: [{ context: 'pair-review', state: 'success' }, { context: 'pair-explicit-approval', state: 'success' }] })
if (a[0] === 'api' && a[1].includes('check-runs')) out({ check_runs: [] })
if (a[0] === 'api' && /issues\\/7\\/labels$/.test(a[1])) out([{ name: 'risk:green' }])
if (a[0] === 'api' && a.includes('--paginate')) out('[]')
if (a[0] === 'api' && a[2] === 'DELETE') out('')
process.stderr.write('fake gh: unhandled ' + j); process.exit(1)
`,
  )
  chmodSync(join(base, 'gh'), 0o755)
  return { main, run, wt, gh: join(base, 'gh'), calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) }
}
const node = (cwd, gh, script, ...args) => {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', env: { ...process.env, PAIR_GH_BIN: gh } })
  return { status: r.status, out: JSON.parse(r.stdout.trim().split('\n').pop()), stderr: r.stderr }
}

test('AC6/AC7: filesystem card + GitHub PR — activate in the worktree, merge on GitHub, close + cascade on the default branch', () => {
  const f = fixture()
  // AC6: the card's In Progress move is written AND committed inside the story worktree
  const act = node(f.main, f.gh, 'cycle-state.mjs', 'activate-card', '--dir', f.run, '--story', '01-01-001', '--worktree', f.wt)
  assert.equal(act.status, 0, JSON.stringify(act))
  assert.equal(act.out.confirmed, true)
  assert.ok(existsSync(join(f.wt, BACKLOG, '03-user-stories/in-progress/01-01-001-login.md')))
  assert.match(git(f.wt, 'log', '-1', '--format=%s').stdout, /^\[#01-01-001\] chore: card state → In Progress/)
  assert.equal(git(f.wt, 'status', '--porcelain').stdout, '')
  assert.ok(existsSync(join(f.main, BACKLOG, '03-user-stories/not-started/01-01-001-login.md')), 'the default branch tree is untouched')
  // the card view every PM-agnostic consumer reads
  const view = node(f.main, f.gh, 'cycle-state.mjs', 'card', '--story', '01-01-001')
  assert.deepEqual([view.out.labels, view.out.state], [['risk:green'], 'OPEN'])
  // AC7: PR side on GitHub, card side on the filesystem
  const merge = node(f.main, f.gh, 'cycle-merge.mjs', 'run', '--dir', f.run, '--story', '01-01-001', '--pr', '7', '--reviewedHead', HEAD, '--cardTier', 'risk:green', '--mergeGate', JSON.stringify({ mode: 'never', has: [], lacks: [] }), '--repo', 'o/r', '--gate', 'green', '--message', '[#01-01-001] feat: login', '--branch', 'feature/US-01-01-001-login')
  assert.equal(merge.status, 0, merge.stderr)
  assert.equal(merge.out.merged, true, JSON.stringify(merge.out))
  assert.equal(merge.out.cascaded, true, JSON.stringify(merge.out))
  assert.ok(f.calls().some(c => c.startsWith('pr merge 7 --squash')), f.calls().join('\n'))
  assert.equal(f.calls().some(c => c.startsWith('issue')), false, 'no card operation reached gh')
  // closed + cascaded at merge, on the default branch's tree
  assert.ok(existsSync(join(f.main, BACKLOG, '03-user-stories/completed/01-01-001-login.md')))
  assert.ok(existsSync(join(f.main, BACKLOG, '02-epics/completed/01-01-auth.md')))
  assert.match(readFileSync(join(f.main, BACKLOG, '02-epics/completed/01-01-auth.md'), 'utf8'), /^\*\*Status\*\*: Done$/m)
  assert.equal(existsSync(f.wt), false, 'the story worktree is removed')
})

test('edge: a card id that is not a filesystem card is refused before any write', () => {
  const f = fixture()
  const r = node(f.main, f.gh, 'cycle-merge.mjs', 'escalate', '--dir', f.run, '--story', '../x', '--stage', 'merge', '--conditions', '["has:risk:red"]')
  assert.equal(r.status, 2)
  assert.match(r.out.error, /not a card id/)
})
