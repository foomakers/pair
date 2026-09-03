import { describe, it, expect } from 'vitest'
import {
  generateNormalizationReplacements,
  generateExistenceCheckReplacements,
  generatePathSubstitutionReplacements,
} from './replacement-generator'
import { applyReplacements } from './replacement-applier'
import type { FileSystemService } from '../file-system/file-system-service'
import { ParsedLink } from './markdown-parser'
import InMemoryFileSystemService from '../test-utils/in-memory-fs'

describe('generateNormalizationReplacements - basics', () => {
  it('generates replacements for relative links that can be normalized', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/guide/other.md': '# Other',
        '/dataset/api/ref.md': '# API Ref',
      },
      '/',
      '/',
    )

    const links: ParsedLink[] = [
      {
        href: '../api/ref.md',
        text: 'API Reference',
        line: 1,
        start: 10,
        end: 25,
      },
      {
        href: './other.md',
        text: 'Other Page',
        line: 2,
        start: 10,
        end: 21,
      },
    ]

    const config = {
      docsFolders: ['api'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const replacements = await generateNormalizationReplacements(
      links,
      '/dataset/guide/index.md',
      config,
      fs,
    )

    // Only normalizedRel (./other.md → other.md) should be generated.
    // ../api/ref.md is already a correct relative path — no full normalization.
    expect(replacements).toHaveLength(1)
    expect(replacements[0].newHref).toBe('other.md')
  })
})

// Consolidated idempotence test for normalization (moved from separate file)
describe('normalization idempotence', () => {
  it('should not change content when run twice', async () => {
    const file = '/root/docs/README.md'

    // Minimal mock file service that reports files exist
    const mockFs: Partial<FileSystemService> = {
      exists: async () => true,
      readFile: async () => '',
      writeFile: async () => {},
      readdir: async () => [],
      unlink: async () => {},
    }

    // Use the public API to generate normalization replacements
    const content = 'prefix [guide](./guide.md) suffix'
    const { extractLinks } = await import('./markdown-parser')
    const links = await extractLinks(content)
    const repls = await generateNormalizationReplacements(
      links as ParsedLink[],
      file,
      { docsFolders: [], datasetRoot: '/root', exclusionList: [] },
      mockFs as FileSystemService,
    )

    const res = applyReplacements(content, repls)

    // run the generator again against the new content
    const linksAfter = await extractLinks(res.content)
    const replsAfter = await generateNormalizationReplacements(
      linksAfter as ParsedLink[],
      file,
      { docsFolders: [], datasetRoot: '/root', exclusionList: [] },
      mockFs as FileSystemService,
    )

    const res2 = applyReplacements(res.content, replsAfter)
    expect(res2.content).toEqual(res.content)
  })
})

describe('generateNormalizationReplacements - exclusions', () => {
  it('skips external links', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const links: ParsedLink[] = [
      {
        href: 'http://example.com',
        text: 'External Link',
        line: 1,
        start: 10,
        end: 27,
      },
    ]

    const config = {
      docsFolders: ['api'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const replacements = await generateNormalizationReplacements(
      links,
      '/dataset/file.md',
      config,
      fs,
    )

    expect(replacements).toHaveLength(0)
  })
})

describe('generateNormalizationReplacements - exclusion list', () => {
  it('skips links in exclusion list', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const links: ParsedLink[] = [
      {
        href: 'excluded/file.md',
        text: 'Excluded Link',
        line: 1,
        start: 10,
        end: 26,
      },
    ]

    const config = {
      docsFolders: ['api'],
      datasetRoot: '/dataset',
      exclusionList: ['excluded'],
    }

    const replacements = await generateNormalizationReplacements(
      links,
      '/dataset/file.md',
      config,
      fs,
    )

    expect(replacements).toHaveLength(0)
  })
})

describe('generateExistenceCheckReplacements', () => {
  it('generates replacements for broken links that can be fixed', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/api/v1/other.md': '# Other',
      },
      '/',
      '/',
    )

    const lines = ['Line with broken link']

    const links: ParsedLink[] = [
      {
        href: '../../../api/v1/other.md',
        text: 'Other Page',
        line: 1,
        start: 10,
        end: 35,
      },
    ]

    const config = {
      docsFolders: ['api'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const result = await generateExistenceCheckReplacements({
      links,
      file: '/dataset/guide/index.md',
      config,
      fileService: fs,
      lines,
    })

    expect(result.replacements).toHaveLength(1)
    expect(result.replacements[0].newHref).toBe('../api/v1/other.md')
    expect(result.errors).toHaveLength(0)
  })
})

describe('generateExistenceCheckReplacements - error cases', () => {
  it('generates errors for broken links that cannot be fixed', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const lines = ['Line with broken link']

    const links: ParsedLink[] = [
      {
        href: 'nonexistent.md',
        text: 'Broken Link',
        line: 1,
        start: 10,
        end: 25,
      },
    ]

    const config = {
      docsFolders: ['api'],
      datasetRoot: '/dataset',
      exclusionList: [],
    }

    const result = await generateExistenceCheckReplacements({
      links,
      file: '/dataset/file.md',
      config,
      fileService: fs,
      lines,
    })

    expect(result.replacements).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].type).toBe('LINK TARGET NOT FOUND')
  })
})

describe('generatePathSubstitutionReplacements', () => {
  it('generates replacements for path substitutions', async () => {
    const links: ParsedLink[] = [
      {
        href: 'old/path/file.md',
        text: 'File Link',
        line: 1,
        start: 10,
        end: 26,
      },
      {
        href: 'old/path/other.md',
        text: 'Other Link',
        line: 2,
        start: 10,
        end: 27,
      },
      {
        href: 'external/path/file.md',
        text: 'External Link',
        line: 3,
        start: 10,
        end: 31,
      },
    ]

    const replacements = await generatePathSubstitutionReplacements(links, 'old/path/', 'new/path/')

    expect(replacements).toHaveLength(2)
    expect(replacements[0].newHref).toBe('new/path/file.md')
    expect(replacements[1].newHref).toBe('new/path/other.md')
  })

  it('handles empty links array', async () => {
    const replacements = await generatePathSubstitutionReplacements([], 'old/', 'new/')

    expect(replacements).toHaveLength(0)
  })
})

describe('generatePathSubstitutionReplacements - external links', () => {
  it('skips external links', async () => {
    const links: ParsedLink[] = [
      {
        href: 'http://example.com',
        text: 'External Link',
        line: 1,
        start: 10,
        end: 27,
      },
    ]

    const replacements = await generatePathSubstitutionReplacements(links, 'old/', 'new/')

    expect(replacements).toHaveLength(0)
  })
})

/**
 * github.com resolves repo paths case-sensitively; APFS does not, and `fs.stat`
 * inherits the volume's rule. A KB link spelled `guide.md` against a file named
 * `Guide.md` therefore passed `check:links` on a developer's Mac and 404'd for every
 * reader on GitHub — the same local-PASS / CI-FAIL asymmetry Check 5b closes for the
 * docs site. Real filesystem on purpose: the in-memory double is exact-match already,
 * so it cannot reproduce the defect.
 */
describe('generateExistenceCheckReplacements — case-sensitive on a case-insensitive volume', () => {
  it('reports LINK TARGET NOT FOUND for a link that resolves only by ignoring case', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('fs/promises')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const { fileSystemService } = await import('../file-system/file-system-service')

    const root = await mkdtemp(join(tmpdir(), 'pair-links-case-'))
    try {
      await mkdir(join(root, 'docs'))
      await writeFile(join(root, 'docs', 'Guide.md'), '# Guide')
      const file = join(root, 'index.md')
      const lines = ['[miscased](./docs/guide.md)', '[exact](./docs/Guide.md)']
      const links: ParsedLink[] = [
        { href: './docs/guide.md', text: 'miscased', line: 1, start: 0, end: 27 },
        { href: './docs/Guide.md', text: 'exact', line: 2, start: 0, end: 24 },
      ]
      const result = await generateExistenceCheckReplacements({
        links,
        file,
        config: { docsFolders: ['docs'], datasetRoot: root, exclusionList: [] },
        fileService: fileSystemService,
        lines,
      })
      expect(result.errors.map(e => [e.type, e.lineNumber])).toEqual([['LINK TARGET NOT FOUND', 1]])
      expect(result.replacements).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
