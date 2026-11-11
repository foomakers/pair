import { describe, it, expect, vi } from 'vitest'
import {
  extractLinksFromFile,
  extractLinksFromDirectory,
  classifyLinkType,
  detectLinkStyle,
  generateNormalizationReplacements,
  applyReplacements,
  processFileWithLinks,
} from './link-processor'
import type { ParsedLink, LinkProcessingConfig } from './link-processor'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'
import { replaceLinkOnLine } from './replacement-applier'
const sampleContent = [
  'This is line 1',
  'Here is a [link](old-link.md) in line 2',
  'This is line 3',
  'Another [link](old-link.md) here in line 4',
  'This is line 5',
].join('\n')

describe('generateNormalizationReplacements - core', () => {
  it('should generate normalization replacements', async function () {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/docs/page.md': '# Page',
        '/dataset/page.md': '# Root Page',
      },
      '/',
      '/',
    )

    const links: ParsedLink[] = [
      {
        href: '../page.md',
        text: 'link',
        line: 1,
        start: 0,
        end: 15,
      },
    ]

    const config: LinkProcessingConfig = {
      docsFolders: ['docs'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const replacements = await generateNormalizationReplacements(
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

describe('applyReplacements', () => {
  it('should apply replacements to content', function () {
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

    const result = applyReplacements(content, replacements)

    expect(result.content).toBe('This is a [link](new.md) and [another](other.md).')
    expect(result.applied).toBe(1)
    expect(result.byKind).toEqual({ updated: 1 })
  })
})

describe('processFileWithLinks', () => {
  it('should process file with link replacements', async function () {
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

    const result = await processFileWithLinks(content, generateReplacements)

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

describe('replaceLinkOnLine - no replacements', () => {
  describe('No replacements', () => {
    it('should return unchanged if oldHref not found', function () {
      const result = replaceLinkOnLine(sampleContent, 2, '[nonexistent](link.md)', '[new](link.md)')
      expect(result).toBe(sampleContent)
    })
  })

  describe('Edge cases', () => {
    it('should handle CRLF line endings', function () {
      const crlfContent = 'Line 1\r\nLine 2 with [link](old.md)\r\nLine 3'
      const result = replaceLinkOnLine(crlfContent, 2, '[link](old.md)', '[link](new.md)')
      expect(result).toBe('Line 1\r\nLine 2 with [link](new.md)\r\nLine 3')
    })
  })
})

// T-69-02: Link Detection & Parsing Engine - New Tests (flattened to avoid large describe callbacks)
it('extractLinksFromFile: should extract links with file context', async function () {
  const fileService = new InMemoryFileSystemService(
    {
      '/project/docs/guide.md': '# Guide\n\nSee [intro](./intro.md) and [config](../config.md).',
    },
    '/project',
    '/project',
  )

  const links = await extractLinksFromFile('/project/docs/guide.md', fileService)

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

it('extractLinksFromFile: should classify link types', async function () {
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

  const links = await extractLinksFromFile('/project/test.md', fileService)

  expect(links).toHaveLength(5)
  expect(links[0]).toMatchObject({ href: './file.md', type: 'relative' })
  expect(links[1]).toMatchObject({ href: '/docs/file.md', type: 'absolute' })
  expect(links[2]).toMatchObject({ href: 'https://example.com', type: 'http' })
  expect(links[3]).toMatchObject({ href: 'mailto:test@example.com', type: 'mailto' })
  expect(links[4]).toMatchObject({ href: '#section', type: 'anchor' })
})

it('extractLinksFromFile: should extract anchor from links with fragments', async function () {
  const fileService = new InMemoryFileSystemService(
    {
      '/project/test.md': 'See [section](./docs/file.md#overview).',
    },
    '/project',
    '/project',
  )

  const links = await extractLinksFromFile('/project/test.md', fileService)

  expect(links).toHaveLength(1)
  expect(links[0]).toMatchObject({
    href: './docs/file.md#overview',
    type: 'relative',
    anchor: '#overview',
  })
})

it('extractLinksFromDirectory: should skip non-markdown files', async function () {
  const fileService = new InMemoryFileSystemService(
    {
      '/project/docs/guide.md': 'See [intro](intro.md).',
      '/project/docs/data.json': '{"link": "test.md"}',
      '/project/docs/script.js': 'const link = "test.md";',
    },
    '/project',
    '/project',
  )

  const links = await extractLinksFromDirectory('/project/docs', fileService)

  const filesParsed = [...new Set(links.map(l => l.filePath))]
  expect(filesParsed).toHaveLength(1)
  expect(filesParsed[0]).toBe('/project/docs/guide.md')
})

it('extractLinksFromDirectory: should handle empty directories', async function () {
  const fileService = new InMemoryFileSystemService(
    {
      '/project/docs/.gitkeep': '',
    },
    '/project',
    '/project',
  )

  const links = await extractLinksFromDirectory('/project/docs', fileService)

  expect(links).toHaveLength(0)
})
describe('link-processor - classifyLinkType (T-69-02)', () => {
  it('should classify HTTP/HTTPS URLs', () => {
    expect(classifyLinkType('https://example.com')).toBe('http')
    expect(classifyLinkType('http://example.com')).toBe('http')
  })
})

it('should preserve query parameters alongside anchors when normalizing', async function () {
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
      href: '../page.md?version=2#overview',
      text: 'link',
      line: 1,
      start: 0,
      end: 35,
    },
  ]

  const config = {
    docsFolders: ['docs'],
    datasetRoot: '/dataset',
    exclusionList: [],
  }

  const replacements = await generateNormalizationReplacements(
    links,
    '/dataset/docs/current.md',
    config,
    fs,
  )

  expect(replacements.length).toBe(1)
  expect(replacements[0].newHref).toBe('page.md?version=2#overview')
  expect(replacements[0].kind).toBe('normalizedRel')
})

describe('link-processor - detectLinkStyle', () => {
  const cwd = '/test'

  it('should skip external and anchor links', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/file1.md`]: '[ext](https://ex.com) [anchor](#sec) [rel](./rel.md) [abs](/abs.md)',
        [`${cwd}/file2.md`]: '[abs2](/abs2.md)',
      },
      cwd,
      cwd,
    )
    // 2 absolute vs 1 relative (anchor and external skipped)
    expect(await detectLinkStyle(fs, cwd)).toBe('absolute')
  })

  it('should return relative when counts are equal', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/file1.md`]: '[rel](./rel.md) [abs](/abs.md)',
      },
      cwd,
      cwd,
    )
    expect(await detectLinkStyle(fs, cwd)).toBe('relative')
  })
})
