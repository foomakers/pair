import { describe, it, expect } from 'vitest'
import { syncFrontmatter } from './frontmatter-transform'

describe('syncFrontmatter', () => {
  it('returns unchanged content when no frontmatter present', () => {
    const input = '# Title\n\nSome content\n'
    expect(syncFrontmatter(input)).toBe(input)
  })

  it('returns unchanged content when frontmatter has no multiline or rename match', () => {
    const input = '---\nname: foo\n---\n\n# Title\n'
    expect(syncFrontmatter(input)).toBe(input)
  })

  it('replaces old name with new name in frontmatter values', () => {
    const input = '---\nname: record-decision\n---\n\n# Content\n'
    const result = syncFrontmatter(input, {
      from: 'record-decision',
      to: 'pair-capability-record-decision',
    })
    expect(result).toContain('name: pair-capability-record-decision')
    expect(result).toContain('# Content')
  })

  it('replaces in all matching frontmatter values, not just name', () => {
    const input = '---\nname: my-skill\nfile: my-skill/config.yaml\n---\n\nBody\n'
    const result = syncFrontmatter(input, { from: 'my-skill', to: 'prefix-my-skill' })
    expect(result).toContain('name: prefix-my-skill')
    expect(result).toContain('file: prefix-my-skill/config.yaml')
  })

  it('does not modify body content, only frontmatter', () => {
    const input = '---\nname: old\n---\n\nold content here\n'
    const result = syncFrontmatter(input, { from: 'old', to: 'new' })
    expect(result).toContain('name: new')
    expect(result).toContain('old content here')
  })

  it('does not modify YAML keys, only values', () => {
    const input = '---\nold-key: some-value\n---\n\nBody\n'
    const result = syncFrontmatter(input, { from: 'old-key', to: 'new-key' })
    expect(result).toContain('old-key: some-value')
  })

  it('collapses >- multiline scalar to single line', () => {
    const input = [
      '---',
      'name: foo',
      'description: >-',
      '  Line one of',
      '  the description',
      '---',
      '',
      '# Body',
    ].join('\n')
    const result = syncFrontmatter(input)
    expect(result).toContain('description: Line one of the description')
    expect(result).not.toContain('>-')
  })

  it('collapses > multiline scalar to single line', () => {
    const input = [
      '---',
      'description: >',
      '  Folded text',
      '  continues here',
      '---',
      '',
      'Body',
    ].join('\n')
    const result = syncFrontmatter(input)
    expect(result).toContain('description: Folded text continues here')
  })

  it('collapses | multiline scalar to single line', () => {
    const input = [
      '---',
      'description: |',
      '  Literal text',
      '  with newlines',
      '---',
      '',
      'Body',
    ].join('\n')
    const result = syncFrontmatter(input)
    expect(result).toContain('description: Literal text with newlines')
  })

  it('collapses |- multiline scalar to single line', () => {
    const input = ['---', 'notes: |-', '  First line', '  second line', '---', '', 'Body'].join(
      '\n',
    )
    const result = syncFrontmatter(input)
    expect(result).toContain('notes: First line second line')
    expect(result).not.toContain('|-')
  })

  it('applies both multiline collapse and rename', () => {
    const input = [
      '---',
      'name: record-decision',
      'description: >-',
      '  Records an architectural',
      '  or non-architectural decision.',
      '---',
      '',
      '# Content',
    ].join('\n')
    const result = syncFrontmatter(input, {
      from: 'record-decision',
      to: 'pair-capability-record-decision',
    })
    expect(result).toContain('name: pair-capability-record-decision')
    expect(result).toContain('description: Records an architectural or non-architectural decision.')
    expect(result).not.toContain('>-')
  })

  it('handles real SKILL.md frontmatter', () => {
    const input = [
      '---',
      'name: record-decision',
      'description: >-',
      '  Records an architectural or non-architectural decision. Architectural',
      '  decisions produce an ADR; non-architectural decisions produce an ADL entry.',
      '  Both always update the relevant adoption files. Invocable independently or',
      '  composed by /implement and /review.',
      '---',
      '',
      '# /record-decision — Decision Recorder',
      '',
      'Some body content.',
    ].join('\n')
    const result = syncFrontmatter(input, {
      from: 'record-decision',
      to: 'pair-capability-record-decision',
    })
    expect(result).toContain('name: pair-capability-record-decision')
    expect(result).toMatch(/^description: Records an architectural/m)
    expect(result).not.toContain('>-')
    // Body not modified
    expect(result).toContain('# /record-decision — Decision Recorder')
  })

  it('does not replace from when it appears as substring in prose, only as path segment', () => {
    const input = [
      '---',
      'name: next',
      'description: The next action to take',
      '---',
      '',
      '# Body',
    ].join('\n')
    const result = syncFrontmatter(input, { from: 'next', to: 'pair-next' })
    expect(result).toContain('name: pair-next')
    expect(result).toContain('description: The next action to take')
  })

  it('handles frontmatter-only content (no body after closing ---)', () => {
    const input = '---\nname: foo\n---\n'
    expect(syncFrontmatter(input)).toBe(input)
  })

  it('preserves content when frontmatter has no closing ---', () => {
    const input = '---\nname: foo\n'
    expect(syncFrontmatter(input)).toBe(input)
  })
})
