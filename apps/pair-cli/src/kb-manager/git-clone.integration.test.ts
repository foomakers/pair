import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdirSync, chmodSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { cloneGitRepo } from './git-clone'

/**
 * Integration test for the ONE wiring nothing else exercises: `resolvePartialCurrentVersion`
 * defaults to the real `cloneGitRepo` (`options.gitCloner ?? cloneGitRepo`), every unit test
 * injects a stub cloner, and `git-clone.test.ts` mocks `execFileSync` away. So the contract
 * the version check's temp-dir design rests on — `git clone` CREATES a destination that does
 * not exist yet, inside a parent that was just mkdir'd 0700 — was asserted only by a code
 * comment. Here it runs against a real `git` and a real fixture repository.
 *
 * No network: the source is a local repository path, which `git clone` accepts like any
 * other URL.
 */

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const created: string[] = []

function tempPath(prefix: string): string {
  const path = join(tmpdir(), `${prefix}-${randomUUID()}`)
  created.push(path)
  return path
}

/** A real, committed git repository carrying a KB manifest at its root. */
function makeFixtureRepo(version: string): string {
  const repo = tempPath('pair-git-fixture')
  mkdirSync(repo, { recursive: true })
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, stdio: 'pipe', env: { ...process.env } })
  git('init', '--quiet', '--initial-branch', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Fixture')
  git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(repo, 'manifest.json'), JSON.stringify({ version }))
  git('add', 'manifest.json')
  git('commit', '--quiet', '-m', 'fixture')
  return repo
}

afterAll(() => {
  for (const path of created) rmSync(path, { recursive: true, force: true })
})

describe.skipIf(!hasGit)('cloneGitRepo (real git)', () => {
  it('clones into a destination that does NOT exist inside a fresh 0700 parent', () => {
    const source = makeFixtureRepo('7.7.7')
    // Exactly the shape resolveGitVersion builds: private root created empty, clone lands
    // in a `repo/` child that git itself has to create.
    const tempRoot = tempPath('pair-kb-version')
    mkdirSync(tempRoot, { recursive: true })
    chmodSync(tempRoot, 0o700)
    const destDir = join(tempRoot, 'repo')
    expect(existsSync(destDir)).toBe(false)

    cloneGitRepo(source, destDir)

    const manifest = join(destDir, 'manifest.json')
    expect(existsSync(manifest)).toBe(true)
    expect(JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).toEqual({
      version: '7.7.7',
    })
  }, 30_000)

  it('refuses a POPULATED destination — why the check never reuses the install cache slot', () => {
    const source = makeFixtureRepo('8.8.8')
    const destDir = tempPath('pair-kb-version-populated')
    mkdirSync(destDir, { recursive: true })
    writeFileSync(join(destDir, 'already-here.txt'), 'installed KB')

    expect(() => cloneGitRepo(source, destDir)).toThrow(/already exists and is not an empty/)
    // And the failure path then recursive-deletes that destination, pre-existing content
    // included — which is the concrete reason the version check clones into a throwaway
    // temp root instead of the source's own cache slot: a READ that failed would otherwise
    // wipe the installed KB.
    expect(existsSync(join(destDir, 'already-here.txt'))).toBe(false)
  }, 30_000)
})
