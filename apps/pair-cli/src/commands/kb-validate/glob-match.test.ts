import { describe, it, expect } from 'vitest'
import { compileOptionalLinkPatterns, matchesAnyPattern } from './glob-match'

describe('compileOptionalLinkPatterns', () => {
  it('compiles every well-formed pattern', () => {
    const { matchers, invalid } = compileOptionalLinkPatterns(['apps/**', '../../packages/**'])

    expect(matchers).toHaveLength(2)
    expect(invalid).toEqual([])
  })

  it('reports blank patterns as invalid instead of compiling a match-everything regex', () => {
    const { matchers, invalid } = compileOptionalLinkPatterns(['', '   ', 'apps/**'])

    expect(matchers).toHaveLength(1)
    expect(invalid).toEqual(['', '   '])
  })

  it('reports an unterminated character class as invalid and keeps the rest', () => {
    const { matchers, invalid } = compileOptionalLinkPatterns(['apps/[ab.md', 'packages/**'])

    expect(matchers).toHaveLength(1)
    expect(invalid).toEqual(['apps/[ab.md'])
  })

  it('returns nothing for an empty pattern list', () => {
    expect(compileOptionalLinkPatterns([])).toEqual({ matchers: [], invalid: [] })
  })
})

describe('matchesAnyPattern', () => {
  const match = (candidates: string[], patterns: string[]): boolean =>
    matchesAnyPattern(candidates, compileOptionalLinkPatterns(patterns).matchers)

  it('matches a `**` segment across directory separators', () => {
    expect(match(['apps/website/content/docs/x.md'], ['apps/**'])).toBe(true)
  })

  it('matches `..` segments literally', () => {
    expect(match(['../../apps/website/x.md'], ['../../apps/**'])).toBe(true)
  })

  it('does not let a single `*` cross a directory separator', () => {
    expect(match(['apps/website/x.md'], ['apps/*'])).toBe(false)
    expect(match(['apps/x.md'], ['apps/*'])).toBe(true)
  })

  it('matches a single character with `?`', () => {
    expect(match(['docs/a.md'], ['docs/?.md'])).toBe(true)
    expect(match(['docs/ab.md'], ['docs/?.md'])).toBe(false)
  })

  it('supports character classes and their negation', () => {
    expect(match(['docs/a.md'], ['docs/[abc].md'])).toBe(true)
    expect(match(['docs/d.md'], ['docs/[abc].md'])).toBe(false)
    expect(match(['docs/d.md'], ['docs/[!abc].md'])).toBe(true)
  })

  it('treats regex metacharacters in a pattern as literals', () => {
    expect(match(['docs/a+b.md'], ['docs/a+b.md'])).toBe(true)
    expect(match(['docs/aab.md'], ['docs/a+b.md'])).toBe(false)
  })

  it('normalizes a leading ./ on both candidate and pattern', () => {
    expect(match(['./apps/x.md'], ['apps/**'])).toBe(true)
    expect(match(['apps/x.md'], ['./apps/**'])).toBe(true)
  })

  it('matches when ANY candidate form matches (written link OR resolved path)', () => {
    expect(match(['../../apps/x.md', 'apps/x.md'], ['apps/**'])).toBe(true)
  })

  it('is false when there are no matchers', () => {
    expect(match(['apps/x.md'], [])).toBe(false)
  })

  it('anchors the pattern: a suffix match is not a match', () => {
    expect(match(['vendor/apps/x.md'], ['apps/**'])).toBe(false)
  })

  it('matches a bare directory pattern against the directory itself', () => {
    expect(match(['apps'], ['apps/**'])).toBe(false)
    expect(match(['apps'], ['apps'])).toBe(true)
  })
})
