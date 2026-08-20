import { describe, it, expect } from 'vitest'
import { compileOptionalLinkPatterns, matchesAnyPattern } from './glob-match'

describe('compileOptionalLinkPatterns', () => {
  it('compiles every well-formed pattern', () => {
    const { matchers, invalid } = compileOptionalLinkPatterns(['apps/**', '../../packages/**'])

    expect(matchers).toHaveLength(2)
    expect(invalid).toEqual([])
  })

  // Module-API guard only: neither entry point can deliver a blank here (the CLI
  // flag parser and the config reader both drop blanks first), but a direct caller
  // must not get a matcher that matches everything.
  it('reports blank patterns as invalid instead of compiling a match-everything regex', () => {
    const { matchers, invalid } = compileOptionalLinkPatterns(['', '   ', 'apps/**'])

    expect(matchers).toHaveLength(1)
    expect(invalid).toEqual(['', '   '])
  })

  // The contract is "a pattern this matcher cannot compile is REPORTED and skipped,
  // never thrown" (US-188 edge case). Table-driven so the contract is what is
  // pinned, not the handful of malformed shapes known today.
  it.each([
    ['unterminated character class', 'apps/[ab.md'],
    ['unterminated class with negation', 'apps/[!ab.md'],
    ['range out of order', 'docs/[z-a].md'],
    ['numeric range out of order', 'docs/[9-0].md'],
    ['range out of order mid-segment', 'a[b-a]c'],
    ['negated range out of order', 'x[!z-a]y'],
    ['empty character class', 'docs/[].md'],
  ])('reports a %s as invalid instead of throwing', (_label, pattern) => {
    const { matchers, invalid } = compileOptionalLinkPatterns([pattern, 'packages/**'])

    expect(matchers).toHaveLength(1)
    expect(invalid).toEqual([pattern])
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
    // `**` matches ZERO or more segments, so `apps/**` covers `apps` too.
    expect(match(['apps'], ['apps/**'])).toBe(true)
    expect(match(['apps'], ['apps'])).toBe(true)
  })

  it('lets `**` match zero segments, like mainstream globs', () => {
    expect(match(['a/b'], ['a/**/b'])).toBe(true)
    expect(match(['a/x/b'], ['a/**/b'])).toBe(true)
    expect(match(['a/x/y/b'], ['a/**/b'])).toBe(true)
    expect(match(['apps/x.ts'], ['**/apps/**'])).toBe(true)
    expect(match(['vendor/apps/x.ts'], ['**/apps/**'])).toBe(true)
  })

  // Documented divergences from minimatch (ADL: every one MORE permissive). Pinned so a
  // rewrite has to decide about them rather than change them by accident.
  it('lets `**` traverse `..` segments, unlike minimatch', () => {
    expect(match(['../../apps/x.ts'], ['**'])).toBe(true)
    expect(match(['../../apps/x.ts'], ['**/apps/**'])).toBe(true)
    expect(match(['../../apps/x.ts'], ['**/x.ts'])).toBe(true)
  })

  it('lets a trailing `/**` match the directory itself, unlike minimatch', () => {
    expect(match(['b'], ['**/b/**'])).toBe(true)
    expect(match(['a/b'], ['**/b/**'])).toBe(true)
  })

  it('collapses repeated globstars', () => {
    expect(match(['a/b/c'], ['**/**/c'])).toBe(true)
    expect(match(['c'], ['**/**/c'])).toBe(true)
  })

  it('treats a `**` that is not a whole segment as a single `*`', () => {
    expect(match(['docs/aXb.md'], ['docs/a**b.md'])).toBe(true)
    expect(match(['docs/a/b.md'], ['docs/a**b.md'])).toBe(false)
  })

  it('supports ranges inside a character class', () => {
    expect(match(['docs/c.md'], ['docs/[a-z].md'])).toBe(true)
    expect(match(['docs/C.md'], ['docs/[a-z].md'])).toBe(false)
    expect(match(['docs/-.md'], ['docs/[a-].md'])).toBe(true)
  })

  it('matches a pathological pattern in bounded time instead of hanging', () => {
    // A regex-compiled matcher backtracks catastrophically here (minutes for a
    // 65-char candidate); the two-pointer matcher is O(n*m).
    const pattern = '**a**a**a**a**a**a**a**a**b'
    const candidate = 'a'.repeat(64) + 'c'

    const started = Date.now()
    expect(match([candidate], [pattern])).toBe(false)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
