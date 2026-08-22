import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import { fileSystemService } from '@pair/content-ops'
import { resolveCurrentVersion } from './version-resolver'

/**
 * The ONE seam nothing else exercises: `resolvePartialCurrentVersion`'s
 * `options.gitCloner ?? cloneGitRepo` default. Every unit test and every handler test injects
 * a stub cloner, and `git-clone.test.ts` mocks `execFileSync` away — so replacing that default
 * with a no-op left the whole suite green while the shipped CLI reported
 * "Current version unavailable" for every git-backed KB, which is precisely the gap this story
 * closes. Here `resolveCurrentVersion` runs with NO cloner injected, against the real
 * `fileSystemService` (real temp root, real 0700, real cleanup) and a real `git`.
 *
 * No network: `127.0.0.1:1` is refused locally, and the failure text it produces
 * (`Git clone failed: …` + the PAIR_GIT_TOKEN hint) is authored by `cloneGitRepo` and by
 * nothing else, which is what proves the default is wired to the real function.
 */

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!hasGit)('resolveCurrentVersion - git source with NO gitCloner injected', () => {
  let previousToken: string | undefined

  beforeAll(() => {
    // A token in the ambient env would be injected into the URL and then redacted out of the
    // message — harmless, but it makes the assertions depend on the developer's shell.
    previousToken = process.env['PAIR_GIT_TOKEN']
    delete process.env['PAIR_GIT_TOKEN']
  })

  afterAll(() => {
    if (previousToken === undefined) delete process.env['PAIR_GIT_TOKEN']
    else process.env['PAIR_GIT_TOKEN'] = previousToken
  })

  it('defaults to the real cloneGitRepo and degrades with ITS reason', async () => {
    const result = await resolveCurrentVersion(fileSystemService, {
      source: 'https://127.0.0.1:1/org/kb.git',
    })

    expect(result).toMatchObject({ sourceKind: 'git', version: null, available: false })
    // Authored by cloneGitRepo's catch, nowhere else: a stubbed-out or no-op default cloner
    // would instead succeed silently and report the "no manifest.json at the repository root"
    // reason resolveGitVersion writes.
    expect(result.error).toContain('Git clone failed')
    expect(result.error).toContain('PAIR_GIT_TOKEN')
  }, 30_000)
})
