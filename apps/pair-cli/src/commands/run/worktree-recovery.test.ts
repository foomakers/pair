import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { stashStrayFiles } from './cycle-wiring'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  })

describe('dirty story worktree recovery', () => {
  const platformCases = ['darwin', 'linux'] as const
  it.each(platformCases)(
    'stashes stray untracked and modified files, never deletes them (%s)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'stray-'))
      git(dir, 'init', '-q')
      writeFileSync(join(dir, 'a.txt'), 'a\n')
      git(dir, 'add', 'a.txt')
      git(dir, 'commit', '-q', '-m', 'init')
      writeFileSync(join(dir, 'a.txt'), 'changed\n')
      writeFileSync(join(dir, 'tsconfig.dts.json'), '{}\n')

      expect(stashStrayFiles(dir, 'pair-recovery: story 7')).toBe(true)
      expect(git(dir, 'status', '--porcelain')).toBe('')
      expect(existsSync(join(dir, 'tsconfig.dts.json'))).toBe(false)
      expect(git(dir, 'stash', 'list')).toMatch(/pair-recovery: story 7/)
      expect(git(dir, 'show', '--name-only', '--format=', 'stash@{0}^3')).toMatch(
        /tsconfig\.dts\.json/,
      )
      expect(stashStrayFiles(dir, 'pair-recovery: story 7')).toBe(false)
    },
  )
})
