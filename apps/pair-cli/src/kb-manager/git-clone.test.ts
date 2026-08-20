import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { execFileSync } from 'child_process'
import { rmSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { join } from 'path'
import {
  parseGitRef,
  injectToken,
  gitCacheKey,
  redactGitCredentials,
  cloneGitRepo,
} from './git-clone'

vi.mock('child_process', () => ({ execFileSync: vi.fn() }))
// `rmSync` MUST be mocked: cloneGitRepo deletes destDir on every failure path, with
// `force: true`, so an unmocked run silently recursive-deletes whatever real directory a
// test names — verified by planting /tmp/pair-git-clone-test/dest/user-file.txt and finding
// it gone after the suite. Mocked, the deletion is asserted instead of performed.
vi.mock('fs', () => ({ rmSync: vi.fn() }))

const execFileSyncMock = vi.mocked(execFileSync)
const rmSyncMock = vi.mocked(rmSync)

describe('parseGitRef', () => {
  it('returns URL without ref when no # present', () => {
    expect(parseGitRef('https://github.com/org/repo.git')).toEqual({
      repoUrl: 'https://github.com/org/repo.git',
    })
  })

  it('splits URL#ref into parts', () => {
    expect(parseGitRef('https://github.com/org/repo.git#v1.0.0')).toEqual({
      repoUrl: 'https://github.com/org/repo.git',
      ref: 'v1.0.0',
    })
  })

  it('handles branch refs', () => {
    expect(parseGitRef('git@github.com:org/repo.git#main')).toEqual({
      repoUrl: 'git@github.com:org/repo.git',
      ref: 'main',
    })
  })

  it('handles refs with slashes', () => {
    expect(parseGitRef('https://github.com/org/repo.git#feature/my-branch')).toEqual({
      repoUrl: 'https://github.com/org/repo.git',
      ref: 'feature/my-branch',
    })
  })
})

describe('gitCacheKey', () => {
  it('returns git- prefixed 12-char hex hash', () => {
    const key = gitCacheKey('https://github.com/acme/repo.git#v1.0.0')
    expect(key).toMatch(/^git-[0-9a-f]{12}$/)
  })

  it('is deterministic for the same URL', () => {
    const a = gitCacheKey('https://github.com/acme/repo.git#v1.0.0')
    const b = gitCacheKey('https://github.com/acme/repo.git#v1.0.0')
    expect(a).toBe(b)
  })

  it('differs for different refs', () => {
    const a = gitCacheKey('https://github.com/acme/repo.git#v1.0.0')
    const b = gitCacheKey('https://github.com/acme/repo.git#v2.0.0')
    expect(a).not.toBe(b)
  })

  it('differs for different repos', () => {
    const a = gitCacheKey('https://github.com/acme/repo-a.git')
    const b = gitCacheKey('https://github.com/acme/repo-b.git')
    expect(a).not.toBe(b)
  })
})

describe('injectToken', () => {
  afterEach(() => {
    delete process.env['PAIR_GIT_TOKEN']
  })

  it('returns URL unchanged when no token set', () => {
    delete process.env['PAIR_GIT_TOKEN']
    expect(injectToken('https://github.com/org/repo.git')).toBe('https://github.com/org/repo.git')
  })

  it('injects token into HTTPS URL', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    expect(injectToken('https://github.com/org/repo.git')).toBe(
      'https://ghp_abc123@github.com/org/repo.git',
    )
  })

  it('does not modify SSH URLs', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    expect(injectToken('git@github.com:org/repo.git')).toBe('git@github.com:org/repo.git')
  })

  it('injects token into http URL', () => {
    process.env['PAIR_GIT_TOKEN'] = 'mytoken'
    expect(injectToken('http://gitlab.com/org/repo.git')).toBe(
      'http://mytoken@gitlab.com/org/repo.git',
    )
  })
})

describe('redactGitCredentials', () => {
  afterEach(() => {
    delete process.env['PAIR_GIT_TOKEN']
  })

  it('strips the userinfo segment injected into an HTTPS URL', () => {
    expect(
      redactGitCredentials('Git clone failed: repository https://ghp_abc123@github.com/org/kb.git'),
    ).toBe('Git clone failed: repository https://***@github.com/org/kb.git')
  })

  it('strips a user:password userinfo segment', () => {
    expect(
      redactGitCredentials('fatal: http://alice:s3cret@gitlab.internal/kb.git not found'),
    ).toBe('fatal: http://***@gitlab.internal/kb.git not found')
  })

  it('redacts the literal PAIR_GIT_TOKEN value wherever it appears', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    expect(redactGitCredentials('remote: token ghp_abc123 rejected')).toBe(
      'remote: token *** rejected',
    )
  })

  it('leaves a credential-free message untouched', () => {
    expect(redactGitCredentials('git executable not found.')).toBe('git executable not found.')
  })

  it('leaves an SSH-style URL untouched (no scheme, no injected token)', () => {
    expect(redactGitCredentials('fatal: git@github.com:org/kb.git not found')).toBe(
      'fatal: git@github.com:org/kb.git not found',
    )
  })

  it('keeps the `git` user of an ssh:// URL — it is not a credential', () => {
    expect(redactGitCredentials('fatal: ssh://git@github.com/org/kb.git not found')).toBe(
      'fatal: ssh://git@github.com/org/kb.git not found',
    )
  })

  it('still strips a non-`git` userinfo from an ssh:// URL', () => {
    expect(redactGitCredentials('fatal: ssh://deploy:s3cret@host/org/kb.git')).toBe(
      'fatal: ssh://***@host/org/kb.git',
    )
  })
})

describe('cloneGitRepo', () => {
  /** Reproduces what execFileSync throws on a non-zero git exit: no `code`, stderr in message. */
  function gitFailure(stderr: string): Error {
    const err = new Error(`Command failed: git clone --depth 1 <url> <dest>\n${stderr}`)
    return Object.assign(err, { status: 128 })
  }

  // Never a shared, predictable path: even with rmSync mocked, a destination two tests can
  // both name is a directory a future unmocked run would delete out from under someone.
  let destDir: string

  beforeEach(() => {
    execFileSyncMock.mockReset()
    rmSyncMock.mockReset()
    destDir = join(tmpdir(), `pair-git-clone-test-${randomUUID()}`, 'dest')
    delete process.env['PAIR_GIT_TOKEN']
  })

  it('clones the requested ref', () => {
    cloneGitRepo('https://github.com/org/kb.git#v1.0.0', destDir)

    expect(execFileSyncMock).toHaveBeenCalledWith(
      'git',
      ['clone', '--depth', '1', '--branch', 'v1.0.0', 'https://github.com/org/kb.git', destDir],
      expect.anything(),
    )
  })

  it('never lets git prompt for credentials, and bounds the clone', () => {
    cloneGitRepo('https://github.com/org/kb.git', destDir)

    const options = execFileSyncMock.mock.calls[0]?.[2] as {
      timeout?: number
      env?: NodeJS.ProcessEnv
    }
    expect(options.env?.['GIT_TERMINAL_PROMPT']).toBe('0')
    expect(typeof options.timeout).toBe('number')
    expect(options.timeout).toBeGreaterThan(0)
  })

  it('maps a failed SPAWN (ENOENT) to the missing-binary message', () => {
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT', errno: -2 })
    })

    expect(() => cloneGitRepo('https://github.com/org/kb.git', destDir)).toThrow(
      'git executable not found',
    )
  })

  it('reports the real reason for a non-existent ref, NOT a missing-binary claim', () => {
    // Real git stderr — note it contains "not found", which must not be keyed on.
    execFileSyncMock.mockImplementation(() => {
      throw gitFailure('fatal: Remote branch nonexistent-branch-xyz not found in upstream origin')
    })

    expect(() =>
      cloneGitRepo('https://github.com/org/kb.git#nonexistent-branch-xyz', destDir),
    ).toThrow(/not found in upstream origin/)
    expect(() =>
      cloneGitRepo('https://github.com/org/kb.git#nonexistent-branch-xyz', destDir),
    ).not.toThrow(/git executable not found/)
  })

  it('reports the real reason for a private or absent repo, NOT a missing-binary claim', () => {
    // Real git stderr for a repo the caller cannot see.
    execFileSyncMock.mockImplementation(() => {
      throw gitFailure('remote: Repository not found.\nfatal: repository not found')
    })

    let message = ''
    try {
      cloneGitRepo('https://github.com/acme/private-kb.git', destDir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('Repository not found')
    expect(message).toContain('PAIR_GIT_TOKEN')
    expect(message).not.toContain('git executable not found')
  })

  it('deletes ONLY the partial clone destination when the clone fails', () => {
    execFileSyncMock.mockImplementation(() => {
      throw gitFailure('fatal: the remote end hung up unexpectedly')
    })

    expect(() => cloneGitRepo('https://github.com/org/kb.git', destDir)).toThrow()

    expect(rmSyncMock).toHaveBeenCalledTimes(1)
    expect(rmSyncMock).toHaveBeenCalledWith(destDir, { recursive: true, force: true })
  })

  it('deletes nothing when the clone succeeds', () => {
    cloneGitRepo('https://github.com/org/kb.git', destDir)

    expect(rmSyncMock).not.toHaveBeenCalled()
  })

  it('redacts the injected token echoed back in git stderr', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_supersecret'
    execFileSyncMock.mockImplementation(() => {
      throw gitFailure("fatal: could not read from 'https://ghp_supersecret@github.com/org/kb.git'")
    })

    let message = ''
    try {
      cloneGitRepo('https://github.com/org/kb.git', destDir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).not.toContain('ghp_supersecret')
    expect(message).toContain('https://***@github.com/org/kb.git')
  })
})
