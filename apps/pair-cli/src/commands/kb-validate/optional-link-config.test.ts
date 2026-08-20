import { describe, it, expect } from 'vitest'
import { resolveOptionalLinkPatterns } from './optional-link-config'

describe('resolveOptionalLinkPatterns', () => {
  it('returns the config patterns when the CLI passes none', () => {
    const resolved = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**'] } },
      undefined,
    )

    expect(resolved).toEqual({ patterns: ['apps/**'], warnings: [] })
  })

  it('returns the CLI patterns when no config section exists', () => {
    expect(resolveOptionalLinkPatterns({}, ['packages/**'])).toEqual({
      patterns: ['packages/**'],
      warnings: [],
    })
  })

  it('merges config and CLI patterns as a union, config first (AC-2)', () => {
    const resolved = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**'] } },
      ['packages/**'],
    )

    expect(resolved.patterns).toEqual(['apps/**', 'packages/**'])
  })

  it('deduplicates a pattern declared on both sides', () => {
    const resolved = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**', 'docs/**'] } },
      ['apps/**'],
    )

    expect(resolved.patterns).toEqual(['apps/**', 'docs/**'])
  })

  it('is empty and silent when neither side declares patterns (AC-6)', () => {
    expect(resolveOptionalLinkPatterns({}, undefined)).toEqual({ patterns: [], warnings: [] })
    expect(resolveOptionalLinkPatterns(null, undefined)).toEqual({ patterns: [], warnings: [] })
  })

  it('is silent on an EMPTY link_validation section (nothing was declared to drop)', () => {
    // `{ link_validation: {} }` states no rule at all — the camelCase-typo warning
    // must not fire here, or a section left in place while its keys are commented
    // out would nag on every run.
    expect(resolveOptionalLinkPatterns({ link_validation: {} }, undefined)).toEqual({
      patterns: [],
      warnings: [],
    })
  })

  it('warns instead of throwing when link_validation is not an object', () => {
    const resolved = resolveOptionalLinkPatterns({ link_validation: 'apps/**' }, undefined)

    expect(resolved.patterns).toEqual([])
    expect(resolved.warnings).toEqual([
      "Config 'link_validation' must be an object, got a string, ignoring it",
    ])
  })

  it('warns when optional_link_patterns is a string, the comma-separated-flag typo', () => {
    const resolved = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: 'apps/**' } },
      [],
    )

    expect(resolved.patterns).toEqual([])
    expect(resolved.warnings).toEqual([
      "Config 'link_validation.optional_link_patterns' must be an array of strings, got a string, ignoring it",
    ])
  })

  it('warns when the section carries only a camelCase key', () => {
    const resolved = resolveOptionalLinkPatterns(
      { link_validation: { optionalLinkPatterns: ['apps/**'] } },
      undefined,
    )

    expect(resolved.patterns).toEqual([])
    expect(resolved.warnings).toEqual([
      "Config 'link_validation' declares no 'optional_link_patterns' (found: optionalLinkPatterns), no optional link patterns from config",
    ])
  })

  it('keeps only string entries of the config array, and warns about the dropped ones', () => {
    const resolved = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**', 42, null, ''] } as never },
      undefined,
    )

    expect(resolved.patterns).toEqual(['apps/**'])
    expect(resolved.warnings).toEqual([
      "Config 'link_validation.optional_link_patterns' has 3 entries that are not non-empty strings, ignoring them",
    ])
  })

  it('says "entry" when exactly one array entry is dropped', () => {
    const resolved = resolveOptionalLinkPatterns(
      { link_validation: { optional_link_patterns: ['apps/**', 42] } as never },
      undefined,
    )

    expect(resolved.warnings).toEqual([
      "Config 'link_validation.optional_link_patterns' has 1 entry that is not a non-empty string, ignoring it",
    ])
  })
})
