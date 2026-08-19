import { describe, it, expect, afterEach } from 'vitest'
import { parseGitRef, injectToken, gitCacheKey, redactGitCredentials } from './git-clone'

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
})
