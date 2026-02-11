import { describe, it, expect } from 'vitest'
import { stripAllMarkers, applyTransformCommands, validateMarkers } from './content-transform'

describe('stripAllMarkers', () => {
  it('returns unchanged content when no markers present', () => {
    const input = '# Title\n\nSome content\n\n## Section\n\nMore content\n'
    expect(stripAllMarkers(input)).toBe(input)
  })

  it('removes a single marker pair, preserving content between them', () => {
    const input = [
      '# Title',
      '',
      '<!-- @claude-skip-start -->',
      '## Section',
      'Content inside markers',
      '<!-- @claude-skip-end -->',
      '',
      '## After',
    ].join('\n')

    const result = stripAllMarkers(input)
    expect(result).toContain('## Section')
    expect(result).toContain('Content inside markers')
    expect(result).not.toContain('<!-- @claude-skip-start -->')
    expect(result).not.toContain('<!-- @claude-skip-end -->')
  })

  it('removes multiple marker pairs with different prefixes', () => {
    const input = [
      '# Title',
      '<!-- @claude-skip-start -->',
      'Claude section',
      '<!-- @claude-skip-end -->',
      '',
      '<!-- @cursor-skip-start -->',
      'Cursor section',
      '<!-- @cursor-skip-end -->',
      '',
      'End',
    ].join('\n')

    const result = stripAllMarkers(input)
    expect(result).toContain('Claude section')
    expect(result).toContain('Cursor section')
    expect(result).not.toContain('<!-- @')
  })

  it('collapses triple or more blank lines into double', () => {
    const input = [
      '# Title',
      '',
      '<!-- @claude-skip-start -->',
      '',
      '<!-- @claude-skip-end -->',
      '',
      '## Next',
    ].join('\n')

    const result = stripAllMarkers(input)
    expect(result).not.toMatch(/\n{4,}/)
  })

  it('handles markers with various command names', () => {
    const input = ['<!-- @foo-hold-start -->', 'Held content', '<!-- @foo-hold-end -->'].join('\n')

    const result = stripAllMarkers(input)
    expect(result).toContain('Held content')
    expect(result).not.toContain('<!-- @foo-hold-start -->')
    expect(result).not.toContain('<!-- @foo-hold-end -->')
  })
})

describe('applyTransformCommands', () => {
  it('returns unchanged content when no markers present', () => {
    const input = '# Title\n\nSome content\n'
    expect(applyTransformCommands(input, 'claude')).toBe(input)
  })

  it('removes a single skip block for the target prefix', () => {
    const input = [
      '# Title',
      '',
      '<!-- @claude-skip-start -->',
      '## Skipped Section',
      'This should be removed',
      '<!-- @claude-skip-end -->',
      '',
      '## Kept Section',
      'This should remain',
    ].join('\n')

    const result = applyTransformCommands(input, 'claude')
    expect(result).not.toContain('Skipped Section')
    expect(result).not.toContain('This should be removed')
    expect(result).toContain('## Kept Section')
    expect(result).toContain('This should remain')
  })

  it('removes multiple skip blocks for the same prefix', () => {
    const input = [
      '# Title',
      '',
      '<!-- @claude-skip-start -->',
      'Block 1',
      '<!-- @claude-skip-end -->',
      '',
      'Middle content',
      '',
      '<!-- @claude-skip-start -->',
      'Block 2',
      '<!-- @claude-skip-end -->',
      '',
      'End content',
    ].join('\n')

    const result = applyTransformCommands(input, 'claude')
    expect(result).not.toContain('Block 1')
    expect(result).not.toContain('Block 2')
    expect(result).toContain('Middle content')
    expect(result).toContain('End content')
  })

  it('only removes blocks matching the target prefix, leaves others intact', () => {
    const input = [
      '# Title',
      '',
      '<!-- @claude-skip-start -->',
      'Claude only',
      '<!-- @claude-skip-end -->',
      '',
      '<!-- @cursor-skip-start -->',
      'Cursor only',
      '<!-- @cursor-skip-end -->',
      '',
      'Shared content',
    ].join('\n')

    const result = applyTransformCommands(input, 'claude')
    expect(result).not.toContain('Claude only')
    expect(result).toContain('<!-- @cursor-skip-start -->')
    expect(result).toContain('Cursor only')
    expect(result).toContain('<!-- @cursor-skip-end -->')
    expect(result).toContain('Shared content')
  })

  it('collapses triple or more blank lines into double', () => {
    const input = [
      '# Title',
      '',
      '<!-- @claude-skip-start -->',
      'Removed',
      '<!-- @claude-skip-end -->',
      '',
      '',
      '## Next',
    ].join('\n')

    const result = applyTransformCommands(input, 'claude')
    expect(result).not.toMatch(/\n{4,}/)
  })

  it('produces fully clean output when chained with stripAllMarkers', () => {
    const input = [
      '# Title',
      '',
      '<!-- @claude-skip-start -->',
      '## Session Context',
      'Stateless tracking info',
      '<!-- @claude-skip-end -->',
      '',
      '<!-- @cursor-skip-start -->',
      '## Cursor Specific',
      'Cursor info',
      '<!-- @cursor-skip-end -->',
      '',
      '## Shared',
      'Shared content',
    ].join('\n')

    const transformed = applyTransformCommands(input, 'claude')
    const clean = stripAllMarkers(transformed)

    expect(clean).not.toContain('Session Context')
    expect(clean).not.toContain('Stateless tracking info')
    expect(clean).toContain('## Cursor Specific')
    expect(clean).toContain('Cursor info')
    expect(clean).toContain('## Shared')
    expect(clean).not.toContain('<!-- @')
  })
})

describe('validateMarkers', () => {
  it('returns no errors for content without markers', () => {
    const input = '# Title\n\nSome content\n'
    expect(validateMarkers(input)).toEqual([])
  })

  it('returns no errors for well-formed markers with supported commands', () => {
    const input = ['<!-- @claude-skip-start -->', 'Content', '<!-- @claude-skip-end -->'].join('\n')
    expect(validateMarkers(input)).toEqual([])
  })

  it('reports unsupported command', () => {
    const input = ['<!-- @claude-hold-start -->', 'Content', '<!-- @claude-hold-end -->'].join('\n')
    const errors = validateMarkers(input)
    expect(errors).toHaveLength(2)
    expect(errors[0]!.line).toBe(1)
    expect(errors[0]!.message).toContain('hold')
    expect(errors[0]!.message).toContain('unsupported')
  })

  it('accepts custom supported commands', () => {
    const input = ['<!-- @claude-hold-start -->', 'Content', '<!-- @claude-hold-end -->'].join('\n')
    expect(validateMarkers(input, ['skip', 'hold'])).toEqual([])
  })

  it('reports unmatched start marker (missing end)', () => {
    const input = ['<!-- @claude-skip-start -->', 'Content without closing'].join('\n')
    const errors = validateMarkers(input)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.line).toBe(1)
    expect(errors[0]!.message).toContain('unmatched')
  })

  it('reports unmatched end marker (missing start)', () => {
    const input = ['Content', '<!-- @claude-skip-end -->'].join('\n')
    const errors = validateMarkers(input)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.line).toBe(2)
    expect(errors[0]!.message).toContain('unmatched')
  })

  it('reports malformed marker (missing closing -->)', () => {
    const input = ['<!-- @claude-skip-start', 'Content', '<!-- @claude-skip-end -->'].join('\n')
    const errors = validateMarkers(input)
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors[0]!.line).toBe(1)
    expect(errors[0]!.message).toContain('malformed')
  })

  it('reports malformed marker (missing opening <!--)', () => {
    const input = ['@claude-skip-start -->', 'Content', '<!-- @claude-skip-end -->'].join('\n')
    const errors = validateMarkers(input)
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors[0]!.line).toBe(1)
    expect(errors[0]!.message).toContain('malformed')
  })

  it('reports nested markers of same prefix+command', () => {
    const input = [
      '<!-- @claude-skip-start -->',
      '<!-- @claude-skip-start -->',
      'Content',
      '<!-- @claude-skip-end -->',
      '<!-- @claude-skip-end -->',
    ].join('\n')
    const errors = validateMarkers(input)
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors[0]!.message).toContain('nested')
  })

  it('validates multiple prefixes independently', () => {
    const input = [
      '<!-- @claude-skip-start -->',
      '<!-- @cursor-skip-start -->',
      'Content',
      '<!-- @cursor-skip-end -->',
      '<!-- @claude-skip-end -->',
    ].join('\n')
    expect(validateMarkers(input)).toEqual([])
  })

  it('includes line numbers in errors', () => {
    const input = [
      '# Title',
      '',
      '<!-- @claude-skip-start -->',
      'Content',
      '',
      '<!-- @claude-nope-start -->',
      'More',
      '<!-- @claude-nope-end -->',
      '<!-- @claude-skip-end -->',
    ].join('\n')
    const errors = validateMarkers(input)
    expect(errors.some(e => e.line === 6)).toBe(true)
  })
})
