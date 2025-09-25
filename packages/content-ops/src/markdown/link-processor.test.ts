import { describe, it, expect, vi } from 'vitest'
import { LinkProcessor } from './link-processor'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'
import { replaceLinkOnLine } from './replacement-applier'
const sampleContent = [
  'This is line 1',
  'Here is a [link](old-link.md) in line 2',
  'This is line 3',
  'Another [link](old-link.md) here in line 4',
  'This is line 5',
].join('\n')

describe('extractLinks', () => {
  it('should extract links from markdown content', async () => {
    const content = `
# Test Document

Here is a [link](page.md) and a [link with anchor](other.md#section).

Another line with an external [link](https://example.com).
`

    const links = await LinkProcessor.extractLinks(content)

    expect(links).toHaveLength(3)
    expect(links[0]).toMatchObject({
      href: 'page.md',
      text: 'link',
    })
    expect(links[1]).toMatchObject({
      href: 'other.md#section',
      text: 'link with anchor',
    })
    expect(links[2]).toMatchObject({
      href: 'https://example.com',
      text: 'link',
    })
  })
  it('should handle empty content', async () => {
    const links = await LinkProcessor.extractLinks('')
    expect(links).toHaveLength(0)
  })
})

describe('generateNormalizationReplacements - core', () => {
  it('should generate normalization replacements', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/docs/page.md': '# Page',
        '/dataset/page.md': '# Root Page',
      },
      '/',
      '/',
    )

    const links = [
      {
        href: '../page.md',
        text: 'link',
        line: 1,
        start: 0,
        end: 15,
      },
    ]

    const config = {
      docsFolders: ['docs'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const replacements = await LinkProcessor.generateNormalizationReplacements(
      links,
      '/dataset/docs/current.md',
      config,
      fileService,
    )

    expect(replacements).toHaveLength(1)
    expect(replacements[0].newHref).toBe('[link](page.md)')
    expect(replacements[0].kind).toBe('normalizedRel')
  })
})

describe('generateNormalizationReplacements - path substitution', () => {
  it('should generate normalization replacements for different folders', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/docs/page.md': '# Page',
        '/dataset/page.md': '# Root Page',
      },
      '/',
      '/',
    )

    const links = [
      {
        href: '../page.md',
        text: 'link',
        line: 1,
        start: 0,
        end: 15,
      },
    ]

    const config = {
      docsFolders: ['docs'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const replacements = await LinkProcessor.generateNormalizationReplacements(
      links,
      '/dataset/docs/current.md',
      config,
      fileService,
    )

    expect(replacements).toHaveLength(1)
    expect(replacements[0].newHref).toBe('[link](page.md)')
    expect(replacements[0].kind).toBe('normalizedRel')
  })
})

describe('generatePathSubstitutionReplacements', () => {
  it('should generate path substitution replacements', async () => {
    const links = [
      {
        href: 'old/path/page.md',
        text: 'link',
        line: 1,
        start: 0,
        end: 20,
      },
      {
        href: 'other/path/page.md',
        text: 'other link',
        line: 2,
        start: 0,
        end: 25,
      },
    ]

    const replacements = await LinkProcessor.generatePathSubstitutionReplacements(
      links,
      'old/path',
      'new/path',
    )

    expect(replacements).toHaveLength(1)
    expect(replacements[0].newHref).toBe('new/path/page.md')
    expect(replacements[0].kind).toBe('pathSubstitution')
  })
})

describe('applyReplacements', () => {
  it('should apply replacements to content', () => {
    const content = 'This is a [link](old.md) and [another](other.md).'
    const replacements = [
      {
        line: 1,
        oldHref: 'old.md',
        newHref: 'new.md',
        start: 10,
        end: 21,
      },
    ]

    const result = LinkProcessor.applyReplacements(content, replacements)

    expect(result.content).toBe('This is a [link](new.md) and [another](other.md).')
    expect(result.applied).toBe(1)
    expect(result.byKind).toEqual({ updated: 1 })
  })

  it('should handle empty replacements', () => {
    const content = 'No links here.'
    const result = LinkProcessor.applyReplacements(content, [])

    expect(result.content).toBe('No links here.')
    expect(result.applied).toBe(0)
    expect(result.byKind).toEqual({})
  })
})

describe('processFileWithLinks', () => {
  it('should process file with link replacements', async () => {
    const content = 'This is a [link](page.md).'
    const generateReplacements = vi.fn().mockResolvedValue([
      {
        line: 1,
        oldHref: 'page.md',
        newHref: 'new-page.md',
        start: 10,
        end: 21,
      },
    ])

    const result = await LinkProcessor.processFileWithLinks(content, generateReplacements)

    expect(result.content).toBe('This is a [link](new-page.md).')
    expect(result.applied).toBe(1)
    expect(generateReplacements).toHaveBeenCalledWith([
      {
        href: 'page.md',
        text: 'link',
        line: 1,
        start: 10,
        end: 25,
      },
    ])
  })
})

describe('replaceLinkOnLine', () => {
  describe('Successful replacements', () => {
    it('should replace link on specific line', () => {
      const result = replaceLinkOnLine(
        sampleContent,
        2,
        '[link](old-link.md)',
        '[link](new-link.md)',
      )
      const lines = result.split('\n')
      expect(lines[1]).toBe('Here is a [link](new-link.md) in line 2')
      expect(lines[3]).toBe('Another [link](old-link.md) here in line 4') // unchanged
    })

    it('should replace first occurrence on line', () => {
      const lineWithMultiple = 'First [link1](old.md) and second [link2](old.md)'
      const result = replaceLinkOnLine(lineWithMultiple, 1, '[link1](old.md)', '[link1](new.md)')
      expect(result).toBe('First [link1](new.md) and second [link2](old.md)')
    })
  })
})

describe('replaceLinkOnLine - no replacements', () => {
  describe('No replacements', () => {
    it('should return unchanged if oldHref not found', () => {
      const result = replaceLinkOnLine(sampleContent, 2, '[nonexistent](link.md)', '[new](link.md)')
      expect(result).toBe(sampleContent)
    })

    it('should return unchanged if line is out of bounds', () => {
      const result = replaceLinkOnLine(
        sampleContent,
        10,
        '[link](old-link.md)',
        '[link](new-link.md)',
      )
      expect(result).toBe(sampleContent)
    })

    it('should handle negative line numbers', () => {
      const result = replaceLinkOnLine(
        sampleContent,
        -1,
        '[link](old-link.md)',
        '[link](new-link.md)',
      )
      expect(result).toBe(sampleContent)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty content', () => {
      const result = replaceLinkOnLine('', 1, 'old', 'new')
      expect(result).toBe('')
    })

    it('should handle single line content', () => {
      const singleLine = 'Single line with [link](old.md)'
      const result = replaceLinkOnLine(singleLine, 1, '[link](old.md)', '[link](new.md)')
      expect(result).toBe('Single line with [link](new.md)')
    })

    it('should handle CRLF line endings', () => {
      const crlfContent = 'Line 1\r\nLine 2 with [link](old.md)\r\nLine 3'
      const result = replaceLinkOnLine(crlfContent, 2, '[link](old.md)', '[link](new.md)')
      expect(result).toBe('Line 1\r\nLine 2 with [link](new.md)\r\nLine 3')
    })
  })
})
