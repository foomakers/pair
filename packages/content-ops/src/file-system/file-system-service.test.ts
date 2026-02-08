import { describe, it, expect, beforeEach } from 'vitest'
import { walkMarkdownFiles } from './file-system-utils'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

let fileService: InMemoryFileSystemService

describe('walkMarkdownFiles - basic', () => {
  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '/docs/readme.md': '# README',
        '/docs/guide.md': '# Guide',
        '/docs/api/index.md': '# API Index',
        '/docs/api/users.md': '# Users API',
        '/docs/notes.txt': 'Not a markdown file',
        '/docs/assets/image.png': 'Not a markdown file',
      },
      '/',
      '/',
    )
  })

  it('should find all markdown files recursively', async () => {
    const files = await walkMarkdownFiles('/docs', fileService)

    expect(files).toHaveLength(4)
    expect(files).toContain('/docs/readme.md')
    expect(files).toContain('/docs/guide.md')
    expect(files).toContain('/docs/api/index.md')
    expect(files).toContain('/docs/api/users.md')
  })

  it('should exclude non-markdown files', async () => {
    const files = await walkMarkdownFiles('/docs', fileService)

    expect(files).not.toContain('/docs/notes.txt')
    expect(files).not.toContain('/docs/assets/image.png')
  })
})

describe('walkMarkdownFiles - edge cases', () => {
  it('should handle empty directories', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/empty/file.md': '# File',
      },
      '/',
      '/',
    )

    const files = await walkMarkdownFiles('/empty', fileService)
    expect(files).toEqual(['/empty/file.md'])
  })

  it('should handle directories with only non-markdown files', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/docs/readme.txt': 'Text file',
        '/docs/data.json': '{"key": "value"}',
      },
      '/',
      '/',
    )

    const files = await walkMarkdownFiles('/docs', fileService)
    expect(files).toHaveLength(0)
  })

  it('should handle nested directory structures', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/docs/level1/level2/deep.md': '# Deep File',
        '/docs/level1/other.md': '# Other File',
      },
      '/',
      '/',
    )

    const files = await walkMarkdownFiles('/docs', fileService)

    expect(files).toHaveLength(2)
    expect(files).toContain('/docs/level1/level2/deep.md')
    expect(files).toContain('/docs/level1/other.md')
  })
})

describe('FileSystemService.symlink (in-memory)', () => {
  it('creates a symlink entry', async () => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    await fileService.mkdir('/project/canonical', { recursive: true })
    await fileService.symlink('/project/canonical', '/project/link')

    const symlinks = fileService.getSymlinks()
    expect(symlinks.get('/project/link')).toBe('/project/canonical')
  })

  it('throws when path already exists as a file', async () => {
    fileService = new InMemoryFileSystemService({ '/project/existing': 'content' }, '/', '/')
    await expect(fileService.symlink('/project/target', '/project/existing')).rejects.toThrow(
      /already exists/i,
    )
  })

  it('throws when symlink path already exists', async () => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    await fileService.symlink('/project/a', '/project/link')
    await expect(fileService.symlink('/project/b', '/project/link')).rejects.toThrow(
      /already exists/i,
    )
  })
})
