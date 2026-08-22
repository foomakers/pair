import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { execFileSync } from 'child_process'
import { rmSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { parseGitRef, gitCacheKey, redactGitCredentials, cloneGitRepo } from './git-clone'

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

/**
 * Auth now travels via the CHILD PROCESS ENVIRONMENT (`GIT_CONFIG_KEY_0`/`_VALUE_0` setting
 * `http.<origin>.extraheader`), never argv or the URL's userinfo (US-291 review round 2
 * escalation of #448 — the prior `https://<token>@host` scheme put the token in `git
 * clone`'s argv, readable via `/proc/<pid>/cmdline` for the clone's duration).
 *
 * The config key is scoped to the request's own origin (round 6), bounding which origin
 * the header is sent to on the FIRST request. **This does NOT defend a redirect** (round 7
 * correction of a round-6 claim, falsified by a real cross-origin-redirect trace): git
 * resolves `http.<url>.*` ONCE at init, against the remote's own URL, and the resulting
 * header list travels with the request across every redirect hop unchanged, scoped or not
 * — a bare, unscoped key behaves identically to a scoped one on a redirect. What actually
 * keeps `AUTHORIZATION` off a redirect target is curl's own cross-origin stripping of that
 * specific header (curl >= 7.58); a differently-named header (as some hosts use for a PAT)
 * is NOT stripped and reaches the redirect target regardless of scoping.
 */
describe('cloneGitRepo — auth', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset()
    rmSyncMock.mockReset()
    delete process.env['PAIR_GIT_TOKEN']
  })
  afterEach(() => {
    delete process.env['PAIR_GIT_TOKEN']
  })

  function envOf(): NodeJS.ProcessEnv {
    return (execFileSyncMock.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv }).env ?? {}
  }

  it('leaves the URL bare in argv when no token is set', () => {
    cloneGitRepo('https://github.com/org/repo.git', join(tmpdir(), `pgc-${randomUUID()}`))

    expect(execFileSyncMock.mock.calls[0]?.[1]).toContain('https://github.com/org/repo.git')
    expect(envOf()['GIT_CONFIG_COUNT']).toBeUndefined()
  })

  it('carries an HTTPS token via env-backed git config, never in argv', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    cloneGitRepo('https://github.com/org/repo.git', join(tmpdir(), `pgc-${randomUUID()}`))

    const args = execFileSyncMock.mock.calls[0]?.[1] as string[]
    expect(args.join(' ')).not.toContain('ghp_abc123')
    expect(args).toContain('https://github.com/org/repo.git')

    const env = envOf()
    expect(env['GIT_CONFIG_COUNT']).toBe('1')
    expect(env['GIT_CONFIG_KEY_0']).toBe('http.https://github.com.extraheader')
    expect(env['GIT_CONFIG_VALUE_0']).toBe(
      `AUTHORIZATION: basic ${Buffer.from('ghp_abc123:').toString('base64')}`,
    )
  })

  it('scopes the config key to the request origin, including a non-default port', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    cloneGitRepo('https://git.internal:8443/org/repo.git', join(tmpdir(), `pgc-${randomUUID()}`))

    expect(envOf()['GIT_CONFIG_KEY_0']).toBe('http.https://git.internal:8443.extraheader')
  })

  it('falls back to no auth env at all on an unparseable URL — fails closed, never unscoped', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    // Passes the https:// prefix test but is not a valid URL (embedded whitespace).
    cloneGitRepo('https://not a valid url', join(tmpdir(), `pgc-${randomUUID()}`))

    expect(envOf()['GIT_CONFIG_COUNT']).toBeUndefined()
  })

  it('never attaches the header to a plain http:// URL — cleartext transport', () => {
    // The prior URL-embedded scheme also exposed the token in cleartext over plain http
    // (git's challenge/response Basic auth answers over whatever transport the URL names);
    // this header has no transport guard at all and would send unconditionally, so it must
    // not be attached here regardless of what the predecessor did.
    process.env['PAIR_GIT_TOKEN'] = 'mytoken'
    cloneGitRepo('http://gitlab.com/org/repo.git', join(tmpdir(), `pgc-${randomUUID()}`))

    expect(envOf()['GIT_CONFIG_COUNT']).toBeUndefined()
  })

  it('does not touch SSH URLs — they use SSH keys, not the header', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    cloneGitRepo('git@github.com:org/repo.git', join(tmpdir(), `pgc-${randomUUID()}`))

    expect(execFileSyncMock.mock.calls[0]?.[1]).toContain('git@github.com:org/repo.git')
    expect(envOf()['GIT_CONFIG_COUNT']).toBeUndefined()
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

  it('redacts a token that itself contains `@` (userinfo regex would split it)', () => {
    // The token is a password with an `@` in it. Injected, the URL carries TWO `@`: the
    // userinfo regex stops at the first one and leaves `ssw0rd-secret` — the token's tail —
    // in plain sight, and a literal-value pass running afterwards can no longer find the
    // token as one string. So the literal pass has to run FIRST.
    process.env['PAIR_GIT_TOKEN'] = 'p@ssw0rd-secret'
    const redacted = redactGitCredentials(
      "fatal: unable to access 'https://p@ssw0rd-secret@gitlab.internal/org/kb.git'",
    )
    expect(redacted).not.toContain('ssw0rd-secret')
    expect(redacted).toBe("fatal: unable to access 'https://***@gitlab.internal/org/kb.git'")
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

  it('names the time limit when the clone is killed by the timeout, with no auth hint', () => {
    // spawnSync's own timeout surfaces as code ETIMEDOUT (NOT ENOENT), whose message is the
    // opaque `spawnSync git ETIMEDOUT`. Falling through to the generic branch tells a user
    // whose big-repo clone ran past the bound to go set PAIR_GIT_TOKEN — an auth fix for a
    // duration problem, with the bound itself never mentioned.
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' })
    })

    let message = ''
    try {
      cloneGitRepo('https://github.com/org/big-kb.git', destDir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('5-minute')
    expect(message).not.toContain('PAIR_GIT_TOKEN')
    // The partial clone is still cleaned up on this path.
    expect(rmSyncMock).toHaveBeenCalledWith(destDir, { recursive: true, force: true })
  })

  it('redacts a token that leaks into git stderr by any other route, defense in depth', () => {
    // The token no longer travels in the URL this module builds (it goes via
    // GIT_CONFIG_VALUE_0 instead — see the `cloneGitRepo — auth` suite), so real git no
    // longer echoes a token-bearing URL back. Redaction stays wired into the catch block
    // regardless, in case a credential surfaces through some other path.
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

  it('redacts an @-bearing token out of a leaked message, defense in depth', () => {
    // Same rationale as above: this URL shape can no longer come from OUR argv (the token
    // never lands there any more), but a leaked credential is still redacted whatever its
    // source, and an `@` inside the token is the case the userinfo regex alone cannot fix.
    process.env['PAIR_GIT_TOKEN'] = 'p@ssw0rd-secret'
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(
        new Error(
          'Command failed: git clone --depth 1 https://p@ssw0rd-secret@gitlab.internal/org/kb.git /tmp/dest\n' +
            "fatal: unable to access 'https://p@ssw0rd-secret@gitlab.internal/org/kb.git/'",
        ),
        { status: 128 },
      )
    })

    let message = ''
    try {
      cloneGitRepo('https://gitlab.internal/org/kb.git', destDir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).not.toContain('ssw0rd-secret')
    expect(message).toContain('https://***@gitlab.internal/org/kb.git')
  })
})
