import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import { REPO_ROOT } from './repo-root'

// #414: the shared git-delegated path derivation both formatter wrappers source,
// so "gitignored => never checked" is delegated to git (never re-implemented),
// and check/fix can never diverge (ADL 2026-07-31-pre-push-gate-is-check-only.md).
const SCRIPT = resolve(REPO_ROOT, 'scripts/format-lib/git-tracked-paths.sh')

interface Result {
  status: number
  paths: string[]
  stderr: string
}

/** Sources the shared function in a throwaway `sh` and calls it with the given extensions. */
function runGitTrackedPaths(cwd: string, exts: string[]): Result {
  try {
    const stdout = execFileSync(
      'sh',
      ['-c', '. "$1"; git_tracked_paths "$@"', 'sh', SCRIPT, ...exts],
      {
        cwd,
      },
    )
    return { status: 0, paths: splitNul(stdout), stderr: '' }
  } catch (error) {
    const e = error as { status: number; stdout: Buffer; stderr: Buffer }
    return { status: e.status, paths: splitNul(e.stdout), stderr: e.stderr.toString('utf-8') }
  }
}

function splitNul(buf: Buffer): string[] {
  return buf
    .toString('utf-8')
    .split('\0')
    .filter(s => s.length > 0)
}

function initRepo(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
}

function commitAll(dir: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir })
}

describe('git-tracked-paths.sh — shared derivation for the formatter wrappers (#414)', () => {
  let tmp: string

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('emits a tracked file matching the requested extension', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'a.md'), '# a\n')
    commitAll(tmp)

    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.status).toBe(0)
    expect(result.paths).toEqual(['a.md'])
  })

  it('never emits a file under a nested .gitignore (AC3)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    initRepo(tmp)
    mkdirSync(join(tmp, 'pkg', 'gen'), { recursive: true })
    mkdirSync(join(tmp, 'pkg', 'src'), { recursive: true })
    writeFileSync(join(tmp, 'pkg', '.gitignore'), 'gen/\n')
    writeFileSync(join(tmp, 'pkg', 'gen', 'ignored.md'), '# ignored\n')
    writeFileSync(join(tmp, 'pkg', 'src', 'kept.md'), '# kept\n')
    commitAll(tmp)

    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.status).toBe(0)
    expect(result.paths).toContain('pkg/src/kept.md')
    expect(result.paths).not.toContain('pkg/gen/ignored.md')
  })

  it('emits an untracked-but-not-ignored file (AC5)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'tracked.md'), '# tracked\n')
    commitAll(tmp)
    writeFileSync(join(tmp, 'new.md'), '# new, never git add-ed\n')

    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.status).toBe(0)
    expect(result.paths).toContain('new.md')
  })

  it('handles a path containing a space, NUL-delimited round trip', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    initRepo(tmp)
    mkdirSync(join(tmp, 'dir with space'))
    writeFileSync(join(tmp, 'dir with space', 'file.md'), '# spaced\n')
    commitAll(tmp)

    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.status).toBe(0)
    expect(result.paths).toEqual(['dir with space/file.md'])
  })

  it('filters by extension — a non-matching tracked file is not emitted', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'a.md'), '# a\n')
    writeFileSync(join(tmp, 'b.ts'), 'export const b = 1\n')
    commitAll(tmp)

    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.paths).toEqual(['a.md'])
  })

  it('exits 2 with a diagnostic when run outside a git work tree (AC6)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    writeFileSync(join(tmp, 'a.md'), '# a\n')

    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('git')
  })

  it('exits 2 rather than a silent green when the derived set is empty', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'a.ts'), 'export const a = 1\n')
    commitAll(tmp)

    // Nothing in the fixture matches ".md".
    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('empty')
  })

  it('excludes .claude/workflows/** and .claude/agents/** (verbatim dataset mirrors)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    initRepo(tmp)
    mkdirSync(join(tmp, '.claude', 'workflows'), { recursive: true })
    mkdirSync(join(tmp, '.claude', 'agents'), { recursive: true })
    writeFileSync(join(tmp, '.claude', 'workflows', 'a-workflow.md'), '# workflow\n')
    writeFileSync(join(tmp, '.claude', 'agents', 'an-agent.md'), '# agent\n')
    writeFileSync(join(tmp, 'kept.md'), '# kept\n')
    commitAll(tmp)

    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.status).toBe(0)
    expect(result.paths).toEqual(['kept.md'])
  })

  it('excludes a third-party skill file but keeps a pair-* one (AC9)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gtp-'))
    initRepo(tmp)
    mkdirSync(join(tmp, '.claude', 'skills', 'agent-browser'), { recursive: true })
    mkdirSync(join(tmp, '.claude', 'skills', 'pair-next'), { recursive: true })
    writeFileSync(join(tmp, '.claude', 'skills', 'agent-browser', 'SKILL.md'), '# third-party\n')
    writeFileSync(join(tmp, '.claude', 'skills', 'pair-next', 'SKILL.md'), '# pair\n')
    commitAll(tmp)

    const result = runGitTrackedPaths(tmp, ['md'])
    expect(result.status).toBe(0)
    expect(result.paths).toContain('.claude/skills/pair-next/SKILL.md')
    expect(result.paths).not.toContain('.claude/skills/agent-browser/SKILL.md')
  })
})
