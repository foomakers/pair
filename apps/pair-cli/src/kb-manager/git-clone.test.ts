import { describe, it, expect, afterEach } from 'vitest'
import { parseGitRef, injectToken, gitCacheKey } from './git-clone'

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
