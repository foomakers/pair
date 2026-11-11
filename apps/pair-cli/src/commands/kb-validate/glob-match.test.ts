import { describe, it, expect } from 'vitest'
import { compileOptionalLinkPatterns, matchesAnyPattern } from './glob-match'

describe('compileOptionalLinkPatterns', () => {

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
})

describe('matchesAnyPattern', () => {
  const match = (candidates: string[], patterns: string[]): boolean =>
    matchesAnyPattern(candidates, compileOptionalLinkPatterns(patterns).matchers)

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

  it('normalizes a trailing / and repeated separators on both sides', () => {
    // `apps/` is `apps`: still anchored (it does NOT imply `apps/**`), but it
    // now matches the directory itself instead of nothing at all.
    expect(match(['apps'], ['apps/'])).toBe(true)
    expect(match(['apps/'], ['apps'])).toBe(true)
    expect(match(['apps/x.md'], ['apps//**'])).toBe(true)
    expect(match(['apps//x.md'], ['apps/**'])).toBe(true)
  })

  it('lets a trailing `/**` match the directory itself, unlike minimatch', () => {
    expect(match(['b'], ['**/b/**'])).toBe(true)
    expect(match(['a/b'], ['**/b/**'])).toBe(true)
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
