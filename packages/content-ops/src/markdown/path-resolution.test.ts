import { describe, it, expect } from 'vitest'
import { resolveMarkdownPath, tryResolvePathVariants } from './path-resolution'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

describe('resolveMarkdownPath', () => {
  const datasetRoot = '/dataset'
  const docsFolders = ['docs', 'guides']
  const file = '/dataset/docs/file.md'

  it('should throw error when linkPath is undefined', () => {
    expect(() => resolveMarkdownPath(file, '', docsFolders, datasetRoot)).toThrow(
      'linkPath is undefined',
    )
  })

  it('should resolve path when first segment is in docsFolders', () => {
    const result = resolveMarkdownPath(file, 'docs/page.md', docsFolders, datasetRoot)
    expect(result).toBe('/dataset/docs/page.md')
  })

  it('should resolve relative path starting with ./', () => {
    const result = resolveMarkdownPath(file, './page.md', docsFolders, datasetRoot)
    expect(result).toBe('/dataset/docs/page.md')
  })

  it('should resolve relative path starting with ../', () => {
    const result = resolveMarkdownPath(file, '../page.md', docsFolders, datasetRoot)
    expect(result).toBe('/dataset/page.md')
  })

  it('should resolve simple filename without path', () => {
    const result = resolveMarkdownPath(file, 'page.md', docsFolders, datasetRoot)
    expect(result).toBe('/dataset/docs/page.md')
  })

  it('should resolve path with anchor', () => {
    const result = resolveMarkdownPath(file, 'docs/page.md#section', docsFolders, datasetRoot)
    expect(result).toBe('/dataset/docs/page.md')
  })

  it('should resolve complex relative path', () => {
    const result = resolveMarkdownPath(file, 'subfolder/page.md', docsFolders, datasetRoot)
    expect(result).toBe('/dataset/docs/subfolder/page.md')
  })

  it('should handle empty anchor', () => {
    const result = resolveMarkdownPath(file, 'docs/page.md#', docsFolders, datasetRoot)
    expect(result).toBe('/dataset/docs/page.md')
  })
})

describe('tryResolvePathVariants', () => {
  const datasetRoot = '/dataset'
  const docsFolders = ['docs', 'guides']
  const file = '/dataset/docs/sub/deep/file.md'

  it('should return null when linkPath does not start with ../', async () => {
    const fileService = new InMemoryFileSystemService({}, '/', '/')
    const result = await tryResolvePathVariants({
      file,
      linkPath: 'page.md',
      docsFolders,
      fileService,
      datasetRoot,
    })
    expect(result).toBeNull()
  })

  it('should return null when no variant exists', async () => {
    const fileService = new InMemoryFileSystemService({}, '/', '/')
    const result = await tryResolvePathVariants({
      file,
      linkPath: '../../../nonexistent.md',
      docsFolders,
      fileService,
      datasetRoot,
    })
    expect(result).toBeNull()
  })
})

describe('tryResolvePathVariants - existing variants', () => {
  const datasetRoot = '/dataset'
  const docsFolders = ['docs', 'guides']
  const file = '/dataset/docs/sub/deep/file.md'

  it('should return the first existing variant', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/existing.md': '',
      },
      '/',
      '/',
    )
    const result = await tryResolvePathVariants({
      file,
      linkPath: '../../../existing.md',
      docsFolders,
      fileService,
      datasetRoot,
    })
    expect(result).toBe('../../../existing.md')
  })

  it('should return variant with .. when appropriate', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/docs/existing.md': '',
      },
      '/',
      '/',
    )
    const result = await tryResolvePathVariants({
      file,
      linkPath: '../../existing.md',
      docsFolders,
      fileService,
      datasetRoot,
    })
    expect(result).toBe('../../existing.md')
  })
})

describe('tryResolvePathVariants - single level', () => {
  const datasetRoot = '/dataset'
  const docsFolders = ['docs', 'guides']
  const file = '/dataset/docs/sub/deep/file.md'

  it('should handle single ..', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/docs/sub/existing.md': '',
      },
      '/',
      '/',
    )
    const result = await tryResolvePathVariants({
      file,
      linkPath: '../existing.md',
      docsFolders,
      fileService,
      datasetRoot,
    })
    expect(result).toBe('../existing.md')
  })
})

describe('tryResolvePathVariants - preference cases', () => {
  const datasetRoot = '/dataset'
  const docsFolders = ['docs', 'guides']
  const file = '/dataset/docs/sub/deep/file.md'

  it('should prefer shorter path when multiple exist', async () => {
    const fileService = new InMemoryFileSystemService(
      {
        '/dataset/existing.md': '',
        '/dataset/docs/existing.md': '',
      },
      '/',
      '/',
    )
    const result = await tryResolvePathVariants({
      file,
      linkPath: '../../../existing.md',
      docsFolders,
      fileService,
      datasetRoot,
    })
    expect(result).toBe('../../../existing.md')
  })
})

/**
 * The variant search proposes the REWRITE `check:links` writes back into the file, so
 * a candidate accepted by a case-insensitive `stat` would be committed as a link that
 * 404s on GitHub. Real filesystem: the in-memory double is exact-match already.
 */
describe('tryResolvePathVariants — never proposes a candidate that exists only by ignoring case', () => {
  it('returns null when the only match differs in case', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('fs/promises')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const { fileSystemService } = await import('../file-system/file-system-service')

    const root = await mkdtemp(join(tmpdir(), 'pair-variants-case-'))
    try {
      await mkdir(join(root, 'docs', 'sub'), { recursive: true })
      await writeFile(join(root, 'docs', 'other.md'), '# Other')
      const file = join(root, 'docs', 'sub', 'file.md')
      const miscased = await tryResolvePathVariants({
        file,
        linkPath: '../Other.md',
        docsFolders: ['docs'],
        fileService: fileSystemService,
        datasetRoot: root,
      })
      expect(miscased).toBeNull()
      // ...while the exact spelling is still found by the same search.
      const exact = await tryResolvePathVariants({
        file,
        linkPath: '../../other.md',
        docsFolders: ['docs'],
        fileService: fileSystemService,
        datasetRoot: root,
      })
      expect(exact).toBe('../other.md')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
