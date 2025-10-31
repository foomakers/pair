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
    expect(replacements[0].newHref).toBe('page.md')
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
    expect(replacements[0].newHref).toBe('page.md')
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

// Normalization policy specs (moved from normalization-policy.test.ts)
describe('normalization policy - single filename handling', () => {
  it('should normalize ../page.md to page.md as normalizedRel when file exists under docs', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/docs/page.md': '# Page',
        '/dataset/page.md': '# Page Root',
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
      links as any,
      '/dataset/docs/current.md',
      config as any,
      fs,
    )

    expect(replacements.length).toBe(1)
    expect(replacements[0].newHref).toBe('page.md')
    expect(replacements[0].kind).toBe('normalizedRel')
  })

  it('should not normalize ../index.md to index.md when not appropriate', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/index.md': '# Home',
      },
      '/',
      '/',
    )

    const links = [
      {
        href: '../index.md',
        text: 'home',
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
      links as any,
      '/dataset/guide/current.md',
      config as any,
      fs,
    )

    // In this setup the policy may decide not to normalize parent index links; ensure no replacement
    expect(replacements.length).toBe(0)
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

// T-69-02: Link Detection & Parsing Engine - New Tests
describe('LinkProcessor - extractLinksFromFile (T-69-02)', () => {
  it('should extract links with file context', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/docs/guide.md': '# Guide\n\nSee [intro](./intro.md) and [config](../config.md).',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromFile('/project/docs/guide.md', fileService)

    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({
      href: './intro.md',
      text: 'intro',
      filePath: '/project/docs/guide.md',
      line: 3,
    })
    expect(links[1]).toMatchObject({
      href: '../config.md',
      text: 'config',
      filePath: '/project/docs/guide.md',
      line: 3,
    })
  })

  it('should classify link types', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/test.md': [
          '# Links',
          '[rel](./file.md)',
          '[abs](/docs/file.md)',
          '[http](https://example.com)',
          '[mailto](mailto:test@example.com)',
          '[anchor](#section)',
        ].join('\n'),
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromFile('/project/test.md', fileService)

    expect(links).toHaveLength(5)
    expect(links[0]).toMatchObject({ href: './file.md', type: 'relative' })
    expect(links[1]).toMatchObject({ href: '/docs/file.md', type: 'absolute' })
    expect(links[2]).toMatchObject({ href: 'https://example.com', type: 'http' })
    expect(links[3]).toMatchObject({ href: 'mailto:test@example.com', type: 'mailto' })
    expect(links[4]).toMatchObject({ href: '#section', type: 'anchor' })
  })

  it('should extract anchor from links with fragments', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/test.md': 'See [section](./docs/file.md#overview).',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromFile('/project/test.md', fileService)

    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      href: './docs/file.md#overview',
      type: 'relative',
      anchor: '#overview',
    })
  })

  it('should handle files with no links', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/plain.md': '# No Links\n\nJust text.',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromFile('/project/plain.md', fileService)

    expect(links).toHaveLength(0)
  })
})

describe('LinkProcessor - extractLinksFromDirectory (T-69-02)', () => {
  it('should extract links from all markdown files in directory', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/docs/guide.md': 'See [intro](intro.md).',
        '/project/docs/intro.md': 'See [guide](guide.md).',
        '/project/README.md': 'See [docs](./docs/guide.md).',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromDirectory('/project/docs', fileService)

    expect(links.length).toBeGreaterThanOrEqual(2)
    const filesParsed = [...new Set(links.map(l => l.filePath))]
    expect(filesParsed).toContain('/project/docs/guide.md')
    expect(filesParsed).toContain('/project/docs/intro.md')
  })

  it('should handle nested directories', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/docs/a/guide.md': 'Link [b](../b/intro.md).',
        '/project/docs/b/intro.md': 'Link [a](../a/guide.md).',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromDirectory('/project/docs', fileService)

    expect(links.length).toBeGreaterThanOrEqual(2)
  })

  it('should skip non-markdown files', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/docs/guide.md': 'See [intro](intro.md).',
        '/project/docs/data.json': '{"link": "test.md"}',
        '/project/docs/script.js': 'const link = "test.md";',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromDirectory('/project/docs', fileService)

    const filesParsed = [...new Set(links.map(l => l.filePath))]
    expect(filesParsed).toHaveLength(1)
    expect(filesParsed[0]).toBe('/project/docs/guide.md')
  })

  it('should handle empty directories', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/docs/.gitkeep': '',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromDirectory('/project/docs', fileService)

    expect(links).toHaveLength(0)
  })
})

describe('LinkProcessor - classifyLinkType (T-69-02)', () => {
  it('should classify relative paths', () => {
    expect(LinkProcessor.classifyLinkType('./file.md')).toBe('relative')
    expect(LinkProcessor.classifyLinkType('../file.md')).toBe('relative')
    expect(LinkProcessor.classifyLinkType('file.md')).toBe('relative')
    expect(LinkProcessor.classifyLinkType('docs/file.md')).toBe('relative')
  })

  it('should classify absolute paths', () => {
    expect(LinkProcessor.classifyLinkType('/docs/file.md')).toBe('absolute')
    expect(LinkProcessor.classifyLinkType('/file.md')).toBe('absolute')
  })

  it('should classify HTTP/HTTPS URLs', () => {
    expect(LinkProcessor.classifyLinkType('https://example.com')).toBe('http')
    expect(LinkProcessor.classifyLinkType('http://example.com')).toBe('http')
  })

  it('should classify mailto links', () => {
    expect(LinkProcessor.classifyLinkType('mailto:test@example.com')).toBe('mailto')
  })

  it('should classify anchor-only links', () => {
    expect(LinkProcessor.classifyLinkType('#section')).toBe('anchor')
    expect(LinkProcessor.classifyLinkType('#')).toBe('anchor')
  })
})

describe('LinkProcessor - performance (T-69-02)', () => {
  it('should handle large files efficiently', async () => {
    const largeContent = Array(1000)
      .fill(0)
      .map((_, i) => `Line ${i} with [link${i}](file${i}.md).`)
      .join('\n')

    const fileService = new InMemoryFileSystemService(
      {
        '/project/large.md': largeContent,
      },
      '/project',
      '/project',
    )

    const startTime = Date.now()
    const links = await LinkProcessor.extractLinksFromFile('/project/large.md', fileService)
    const duration = Date.now() - startTime

    expect(links).toHaveLength(1000)
    expect(duration).toBeLessThan(5000) // Target: < 5s for 1000 links
  })
})

describe('LinkProcessor - edge cases (T-69-02)', () => {
  it('should handle malformed markdown gracefully', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/malformed.md': '[broken link](file.md\n[valid](other.md)',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromFile('/project/malformed.md', fileService)

    expect(links.length).toBeGreaterThanOrEqual(0)
  })

  it('should handle links with special characters', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/project/special.md': 'Link [test](file%20with%20spaces.md).',
      },
      '/project',
      '/project',
    )

    const links = await LinkProcessor.extractLinksFromFile('/project/special.md', fileService)

    expect(links).toHaveLength(1)
    expect(links[0].href).toBe('file%20with%20spaces.md')
  })
})

describe('normalization policy - anchor preservation (option 3)', () => {
  it('should preserve simple anchors when normalizing relative links', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/docs/page.md': '# Page',
        '/dataset/page.md': '# Root',
      },
      '/',
      '/',
    )

    const links = [
      {
        href: '../page.md#overview',
        text: 'link',
        line: 1,
        start: 0,
        end: 20,
      },
    ]

    const config = {
      docsFolders: ['docs'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const replacements = await LinkProcessor.generateNormalizationReplacements(
      links as any,
      '/dataset/docs/current.md',
      config as any,
      fs,
    )

    expect(replacements.length).toBe(1)
    expect(replacements[0].newHref).toBe('page.md#overview')
    expect(replacements[0].kind).toBe('normalizedRel')
  })

  it('should preserve encoded anchors when normalizing', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/docs/page.md': '# Page',
        '/dataset/page.md': '# Root',
      },
      '/',
      '/',
    )

    const links = [
      {
        href: '../page.md#sec%20one',
        text: 'link',
        line: 1,
        start: 0,
        end: 25,
      },
    ]

    const config = {
      docsFolders: ['docs'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const replacements = await LinkProcessor.generateNormalizationReplacements(
      links as any,
      '/dataset/docs/current.md',
      config as any,
      fs,
    )

    expect(replacements.length).toBe(1)
    expect(replacements[0].newHref).toBe('page.md#sec%20one')
    expect(replacements[0].kind).toBe('normalizedRel')
  })
})
