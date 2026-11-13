import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  observePreparationFailure,
  renderPreparationFailure,
  reportPreparationFailure,
} from './preparation-failure'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** US-591 AC-5/AC-6: real repo + real worktree + real bare origin; nothing faked. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'prepfail-'))
  const origin = join(root, 'origin.git')
  const main = join(root, 'main')
  git(root, 'init', '--bare', '-b', 'main', origin)
  mkdirSync(main)
  git(main, 'init', '-b', 'main')
  git(main, 'config', 'user.email', 't@t')
  git(main, 'config', 'user.name', 't')
  git(main, 'remote', 'add', 'origin', origin)
  writeFileSync(join(main, 'a.txt'), 'a')
  git(main, 'add', 'a.txt')
  git(main, 'commit', '-m', 'init')
  const wt = join(root, 'wt', '591')
  git(main, 'worktree', 'add', '-b', 'feature/US-591-x', wt)
  writeFileSync(join(wt, 'red.test.ts'), 'red')
  git(wt, 'add', 'red.test.ts')
  git(wt, 'commit', '-m', 'RED')
  git(wt, 'push', 'origin', 'feature/US-591-x')
  const runDir = join(main, '.pair', 'working', 'runs', 'r', '591')
  mkdirSync(runDir, { recursive: true })
  return { main, wt, runDir }
}
const next = { reason: 'failed-preparation', refusal: 'unprovable', detail: 'oracle wrong' }

describe('preparation failure diagnostics (US-591 AC-5/AC-6)', () => {
  it('reports the refusal, local-only uncommitted work, local and pushed heads, and preserves everything', () => {
    const { main, wt, runDir } = fixture()
    writeFileSync(join(wt, 'impl.ts'), 'uncommitted dependency')
    const f = observePreparationFailure({ next, main, card: '591', runDir })
    expect(f.refusal).toBe('unprovable')
    expect(f.branch).toBe('feature/US-591-x')
    expect(f.localChanges).toEqual(['impl.ts'])
    expect(f.localHead).toBe(git(wt, 'rev-parse', 'HEAD'))
    expect(f.pushedHead).toBe(git(wt, 'rev-parse', 'HEAD'))
    expect(f.pr).toBe('none recorded in the run directory')
    expect(renderPreparationFailure(f).join('\n')).toMatch(
      /Local changed\/untracked paths: impl\.ts/,
    )
    expect(existsSync(join(wt, 'impl.ts'))).toBe(true)
    expect(git(wt, 'status', '--porcelain')).toBe('?? impl.ts')
  })

  it('states unavailable observations explicitly and persists the audit', () => {
    const { main, runDir } = fixture()
    const f = observePreparationFailure({ next, main, card: '999', runDir })
    expect([f.worktree, f.branch, f.localChanges, f.localHead, f.pushedHead]).toEqual(
      Array(5).fill('unavailable'),
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    reportPreparationFailure({ next, main, card: '999', runDir })
    expect(
      JSON.parse(readFileSync(join(runDir, 'preparation-failure.json'), 'utf-8')).refusal,
    ).toBe('unprovable')
  })

  it('a branch never pushed reports not pushed, and the PR number comes from the handoff', () => {
    const { main, wt, runDir } = fixture()
    git(wt, 'push', 'origin', '--delete', 'feature/US-591-x')
    writeFileSync(join(runDir, 'a0-implement-phase.json'), JSON.stringify({ prNumber: 57 }))
    const f = observePreparationFailure({ next, main, card: '591', runDir })
    expect(f.pushedHead).toBe('not pushed')
    expect(f.pr).toMatch(/^#57 /)
  })

  it('platform darwin/linux: a changed path holding a space is reported as the real path, not a quoted one', () => {
    const { main, wt, runDir } = fixture()
    writeFileSync(join(wt, 'with space.ts'), 'x')
    const f = observePreparationFailure({ next, main, card: '591', runDir })
    expect(f.localChanges).toEqual(['with space.ts'])
  })
})
