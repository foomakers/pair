import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { execFileSync } from 'child_process'
import { rmSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { gitCacheKey, redactGitCredentials, cloneGitRepo } from './git-clone'

vi.mock('child_process', () => ({ execFileSync: vi.fn() }))
// `rmSync` MUST be mocked: cloneGitRepo deletes destDir on every failure path, with
// `force: true`, so an unmocked run silently recursive-deletes whatever real directory a
// test names — verified by planting /tmp/pair-git-clone-test/dest/user-file.txt and finding
// it gone after the suite. Mocked, the deletion is asserted instead of performed.
vi.mock('fs', () => ({ rmSync: vi.fn() }))

const execFileSyncMock = vi.mocked(execFileSync)
const rmSyncMock = vi.mocked(rmSync)

describe('gitCacheKey', () => {
  it('returns git- prefixed 12-char hex hash', () => {
    const key = gitCacheKey('https://github.com/acme/repo.git#v1.0.0')
    expect(key).toMatch(/^git-[0-9a-f]{12}$/)
  })
})

/**
 * Auth now travels via the CHILD PROCESS ENVIRONMENT (`GIT_CONFIG_KEY_n`/`_VALUE_n` setting
 * `http.<origin>.extraheader` + `http.followRedirects=false`), never argv or the URL's
 * userinfo (US-291 review round 2 escalation of #448 — the prior `https://<token>@host`
 * scheme put the token in `git clone`'s argv, readable via `/proc/<pid>/cmdline` for the
 * clone's duration).
 *
 * **A same-clone HTTP redirect reaches a host the caller never named — origin-scoping the
 * config key alone does NOT stop it** (rounds 5-8; two prior claims here that it was
 * already handled were both measured false). git resolves `http.<url>.*` ONCE at init,
 * against the remote's own URL. curl strips a custom `Authorization` header only on the
 * ONE follow-hop of a redirect — but git then adopts the redirect target as the clone's
 * new base URL, and every request AFTER that is a FRESH request to the new origin, not a
 * redirect curl would touch. Measured against a real `git http-backend` with a redirect
 * mid-clone: the token reached the redirect target's `git-upload-pack` request whether the
 * config key was scoped or bare. `http.followRedirects=false` is what actually closes it:
 * the clone fails outright on any redirect (`fatal: … returned error: 302`) instead of
 * silently continuing against an origin the caller never named.
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

  it('carries an HTTPS token via env-backed git config, never in argv', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    cloneGitRepo('https://github.com/org/repo.git', join(tmpdir(), `pgc-${randomUUID()}`))

    const args = execFileSyncMock.mock.calls[0]?.[1] as string[]
    expect(args.join(' ')).not.toContain('ghp_abc123')
    expect(args).toContain('https://github.com/org/repo.git')

    const env = envOf()
    expect(env['GIT_CONFIG_COUNT']).toBe('2')
    expect(env['GIT_CONFIG_KEY_0']).toBe('http.https://github.com.extraheader')
    expect(env['GIT_CONFIG_VALUE_0']).toBe(
      `AUTHORIZATION: basic ${Buffer.from('ghp_abc123:').toString('base64')}`,
    )
    expect(env['GIT_CONFIG_KEY_1']).toBe('http.followRedirects')
    expect(env['GIT_CONFIG_VALUE_1']).toBe('false')
  })

  it('falls back to no auth env at all on an unparseable URL — fails closed, never unscoped', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    // Passes the https:// prefix test but is not a valid URL (embedded whitespace).
    cloneGitRepo('https://not a valid url', join(tmpdir(), `pgc-${randomUUID()}`))

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

  it('redacts the literal PAIR_GIT_TOKEN value wherever it appears', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    expect(redactGitCredentials('remote: token ghp_abc123 rejected')).toBe(
      'remote: token *** rejected',
    )
  })

  it('keeps the `git` user of an ssh:// URL — it is not a credential', () => {
    expect(redactGitCredentials('fatal: ssh://git@github.com/org/kb.git not found')).toBe(
      'fatal: ssh://git@github.com/org/kb.git not found',
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

  it('names the redirect-refusal policy, NOT "set PAIR_GIT_TOKEN" (already set, and why it failed)', () => {
    process.env['PAIR_GIT_TOKEN'] = 'ghp_abc123'
    execFileSyncMock.mockImplementation(() => {
      throw gitFailure(
        "fatal: unable to access 'https://github.com/acme/kb.git/': The requested URL returned error: 302",
      )
    })

    let message = ''
    try {
      cloneGitRepo('https://github.com/acme/kb.git', destDir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('refuses')
    expect(message).toContain('redirect')
    expect(message).not.toContain('set PAIR_GIT_TOKEN')
  })

  it('leaves the generic redirect wording alone when no token was attached', () => {
    // No PAIR_GIT_TOKEN set: gitAuthEnv attaches nothing, so a 3xx is an ordinary failure —
    // the redirect-refusal branch must not fire on a clone it did not cause.
    execFileSyncMock.mockImplementation(() => {
      throw gitFailure(
        "fatal: unable to access 'https://github.com/acme/kb.git/': The requested URL returned error: 301",
      )
    })

    let message = ''
    try {
      cloneGitRepo('https://github.com/acme/kb.git', destDir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('set PAIR_GIT_TOKEN')
    expect(message).not.toContain('refuses')
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
})
