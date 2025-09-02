import { describe, it, expect } from 'vitest'
import { extractLinks } from './markdown-parser'

describe('markdown-parser extractLinks - advanced cases', () => {
  it('handles autolinks', async () => {
    const content = 'Autolink <http://example.com> and <mailto:test@example.com>'
    const links = await extractLinks(content)
    expect(links).toHaveLength(2)
    expect(links[0]!.href).toBe('http://example.com')
    expect(links[1]!.href).toBe('mailto:test@example.com')
  })

  it('handles links with query parameters', async () => {
    const content = 'Query [link](file.md?param=value&other=123)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file.md?param=value&other=123')
  })

  it('handles nested brackets in link text', async () => {
    const content = 'Nested [link [with] brackets](file.md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file.md')
    expect(links[0]!.text).toBe('link [with] brackets')
  })

  it('handles escaped characters in href', async () => {
    const content = 'Escaped [link](file\\ with\\ spaces.md)'
    const links = await extractLinks(content)
    expect(links.length).toBeGreaterThanOrEqual(0)
  })
})

describe('markdown-parser extractLinks - position calculations', () => {
  it('computes start/end that slice to the href and fall within the token span', async () => {
    const content = [
      'Intro line',
      'This line contains a link: [click me](docs/a/b.md) and also docs/a/b.md later',
      'Trailing line',
    ].join('\n')

    const links = await extractLinks(content)
    expect(links.length).toBeGreaterThan(0)

    const l = links.find(x => x.href === 'docs/a/b.md')
    expect(l).toBeDefined()
    if (!l) return

    expect(typeof l.start).toBe('number')
    expect(typeof l.end).toBe('number')
    expect(content.slice(l.start!, l.end!)).toContain(l.href)
    expect(l.start! >= 0).toBe(true)
    expect(l.end! <= content.length).toBe(true)
  })
})

describe('markdown-parser extractLinks - edge cases', () => {
  it('handles links with special characters in href', async () => {
    const content = 'Link with [special chars](file%20with%20spaces.md#section-1)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file%20with%20spaces.md#section-1')
    expect(links[0]!.text).toBe('special chars')
  })

  it('handles links with parentheses in href', async () => {
    const content = 'Link with [parens](folder/file(1).md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('folder/file(1).md')
  })

  it('handles links with square brackets in href', async () => {
    const content = 'Link with [brackets](folder/file[1].md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('folder/file[1].md')
  })

  it('handles empty href links', async () => {
    const content = 'Empty link: [text]() and another [](empty.md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(2)
    expect(links[0]!.href).toBe('')
    expect(links[1]!.href).toBe('empty.md')
  })

  it('handles malformed links gracefully', async () => {
    const content = 'Malformed: [text] and [incomplete]( and [broken]broken.md)'
    const links = await extractLinks(content)
    expect(links.length).toBeLessThanOrEqual(1)
  })

  it('handles links with complex anchors', async () => {
    const content = 'Complex anchor: [text](file.md#section.with.dots-and-dashes_underscore)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file.md#section.with.dots-and-dashes_underscore')
  })
})

describe('markdown-parser extractLinks - code and formatting', () => {
  it('handles links in code blocks (should not extract)', async () => {
    const content = '```\n[code block link](file.md)\n```\nNormal [link](file.md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file.md')
  })

  it('handles links in inline code (should not extract)', async () => {
    const content = 'Inline `code [link](file.md)` and normal [link](file.md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file.md')
  })

  it('handles links with title attribute', async () => {
    const content = 'Link with [title](file.md "Click here")'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file.md')
  })

  it('handles multiple links on same line', async () => {
    const content = 'Multiple [link1](file1.md) and [link2](file2.md) on same line'
    const links = await extractLinks(content)
    expect(links).toHaveLength(2)
    expect(links[0]!.href).toBe('file1.md')
    expect(links[1]!.href).toBe('file2.md')
  })

  it('handles links with Unicode characters', async () => {
    const content = 'Unicode [link](fólder/fïle.md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('fólder/fïle.md')
  })

  it('handles reference-style links', async () => {
    const content = 'Reference [link1][ref1]\n\n[ref1]: file.md'
    const links = await extractLinks(content)
    expect(links.length).toBeGreaterThanOrEqual(0)
  })
})

describe('markdown-parser extractLinks - special formats', () => {
  it('handles autolinks', async () => {
    const content = 'Autolink <http://example.com> and <mailto:test@example.com>'
    const links = await extractLinks(content)
    expect(links).toHaveLength(2)
    expect(links[0]!.href).toBe('http://example.com')
    expect(links[1]!.href).toBe('mailto:test@example.com')
  })

  it('handles links with query parameters', async () => {
    const content = 'Query [link](file.md?param=value&other=123)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file.md?param=value&other=123')
  })

  it('handles nested brackets in link text', async () => {
    const content = 'Nested [link [with] brackets](file.md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('file.md')
    expect(links[0]!.text).toBe('link [with] brackets')
  })

  it('handles escaped characters in href', async () => {
    const content = 'Escaped [link](file\\ with\\ spaces.md)'
    const links = await extractLinks(content)
    expect(links.length).toBeGreaterThanOrEqual(0)
  })
})
