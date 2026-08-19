import { describe, it, expect } from 'vitest'
import { resolveOptionalLinkPatterns } from './optional-link-config'

describe('resolveOptionalLinkPatterns', () => {
  it('returns the config patterns when the CLI passes none', () => {
    const patterns = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**'] } },
      undefined,
    )

    expect(patterns).toEqual(['apps/**'])
  })

  it('returns the CLI patterns when no config section exists', () => {
    expect(resolveOptionalLinkPatterns({}, ['packages/**'])).toEqual(['packages/**'])
  })

  it('merges config and CLI patterns as a union, config first (AC-2)', () => {
    const patterns = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**'] } },
      ['packages/**'],
    )

    expect(patterns).toEqual(['apps/**', 'packages/**'])
  })

  it('deduplicates a pattern declared on both sides', () => {
    const patterns = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**', 'docs/**'] } },
      ['apps/**'],
    )

    expect(patterns).toEqual(['apps/**', 'docs/**'])
  })

  it('is empty when neither side declares patterns (AC-6)', () => {
    expect(resolveOptionalLinkPatterns({}, undefined)).toEqual([])
    expect(resolveOptionalLinkPatterns(null, undefined)).toEqual([])
  })

  it('ignores a link_validation section of the wrong shape instead of throwing', () => {
    expect(resolveOptionalLinkPatterns({ link_validation: 'apps/**' }, undefined)).toEqual([])
    expect(
      resolveOptionalLinkPatterns({ link_validation: { optional_link_patterns: 'apps/**' } }, []),
    ).toEqual([])
  })

  it('keeps only string entries of the config array', () => {
    const patterns = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**', 42, null, ''] } as never },
      undefined,
    )

    expect(patterns).toEqual(['apps/**'])
  })
})
