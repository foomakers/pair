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
    const fileService = new InMemoryFileSystemService({})
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
    const fileService = new InMemoryFileSystemService({})
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
    const fileService = new InMemoryFileSystemService({
      '/dataset/existing.md': '',
    })
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
    const fileService = new InMemoryFileSystemService({
      '/dataset/docs/existing.md': '',
    })
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
    const fileService = new InMemoryFileSystemService({
      '/dataset/docs/sub/existing.md': '',
    })
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
    const fileService = new InMemoryFileSystemService({
      '/dataset/existing.md': '',
      '/dataset/docs/existing.md': '',
    })
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
