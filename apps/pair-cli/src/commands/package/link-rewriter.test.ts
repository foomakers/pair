import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemService } from '@pair/content-ops'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'
import { rewriteAbsoluteLinks, rewriteFileLinks, rewriteDirectoryLinks } from './link-rewriter'

describe('rewriteFileLinks', () => {
  let fs: FileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, '/kb', '/kb')
  })

  it('should rewrite absolute links to relative links with root', async () => {
    const content = '[Skill](/skills/bootstrap.md)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result).toBe('[Skill](bootstrap.md)')
  })

  it('should rewrite multiple absolute links in same file', async () => {
    const content = `
[Bootstrap](/skills/bootstrap.md)
[Implement](/skills/implement.md)
[Guide](/guides/setup.md)
`
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result).toContain('[Bootstrap](bootstrap.md)')
    expect(result).toContain('[Implement](implement.md)')
    expect(result).toContain('[Guide](../guides/setup.md)')
  })

  it('should not modify relative links', async () => {
    const content = '[Skill](./bootstrap.md)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result).toBe('[Skill](./bootstrap.md)')
  })

  it('should not modify external links', async () => {
    const content = '[GitHub](https://github.com)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result).toBe('[GitHub](https://github.com)')
  })

  it('should handle root without leading slash', async () => {
    const content = '[Skill](/skills/bootstrap.md)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: 'skills',
      fs,
    })

    expect(result).toBe('[Skill](bootstrap.md)')
  })

  it('should handle root with trailing slash', async () => {
    const content = '[Skill](/skills/bootstrap.md)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills/',
      fs,
    })

    expect(result).toBe('[Skill](bootstrap.md)')
  })

  it('should preserve anchor links', async () => {
    const content = '[Section](/skills/bootstrap.md#setup)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result).toBe('[Section](bootstrap.md#setup)')
  })

  it('should handle nested paths relative to root', async () => {
    const content = '[Nested](/skills/process/implement.md)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result).toBe('[Nested](process/implement.md)')
  })

  it('should compute relative path for links outside root', async () => {
    const content = '[Guide](/guides/setup.md)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result).toBe('[Guide](../guides/setup.md)')
  })

  it('should handle files without markdown extension', async () => {
    const content = '[Config](/config.json)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/',
      fs,
    })

    expect(result).toBe('[Config](config.json)')
  })

  it('should preserve link text exactly', async () => {
    const content = '[My Skill **Bold**](/skills/bootstrap.md)'
    fs.writeFile('/kb/file.md', content)

    const result = await rewriteFileLinks({
      filePath: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result).toBe('[My Skill **Bold**](bootstrap.md)')
  })
})

describe('rewriteDirectoryLinks', () => {
  it('should rewrite links in all markdown files in directory', async () => {
    const baseFs = new InMemoryFileSystemService({}, '/kb', '/kb')
    baseFs.writeFile('/kb/dir/file1.md', '[Link](/skills/a.md)')
    baseFs.writeFile('/kb/dir/file2.md', '[Link](/skills/b.md)')

    const fs = Object.assign({}, baseFs, {
      resolve: (...paths: string[]) => paths.join('/').replace(/\/+/g, '/'),
      readdir: async () => [{ name: 'file1.md' }, { name: 'file2.md' }] as any,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      stat: async (_path: string) => ({
        isDirectory: () => false,
        isFile: () => true,
      }),
    })

    const result = await rewriteDirectoryLinks({
      dirPath: '/kb/dir',
      root: '/skills',
      fs,
    })

    expect(result.length).toBe(2)
    expect(result).toContain('/kb/dir/file1.md')
    expect(result).toContain('/kb/dir/file2.md')

    const content1 = await fs.readFile('/kb/dir/file1.md')
    const content2 = await fs.readFile('/kb/dir/file2.md')

    expect(content1).toBe('[Link](a.md)')
    expect(content2).toBe('[Link](b.md)')
  })

  it('should skip non-markdown files', async () => {
    const baseFs = new InMemoryFileSystemService({}, '/kb', '/kb')
    baseFs.writeFile('/kb/dir/file.md', '[Link](/skills/a.md)')
    baseFs.writeFile('/kb/dir/config.json', '{"link": "/skills/a.md"}')
    baseFs.writeFile('/kb/dir/script.ts', 'const link = "/skills/a.md"')

    const fs = Object.assign({}, baseFs, {
      resolve: (...paths: string[]) => paths.join('/').replace(/\/+/g, '/'),
      readdir: async () =>
        [{ name: 'file.md' }, { name: 'config.json' }, { name: 'script.ts' }] as any,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      stat: async (_path: string) => ({
        isDirectory: () => false,
        isFile: () => true,
      }),
    })

    const result = await rewriteDirectoryLinks({
      dirPath: '/kb/dir',
      root: '/skills',
      fs,
    })

    expect(result.length).toBe(1)
    expect(result).toContain('/kb/dir/file.md')
  })

  it('should handle empty directory', async () => {
    const baseFs = new InMemoryFileSystemService({}, '/kb', '/kb')

    const fs = Object.assign({}, baseFs, {
      readdir: async () => [] as any,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      stat: async (_path: string) => ({
        isDirectory: () => true,
        isFile: () => false,
      }),
    })

    const result = await rewriteDirectoryLinks({
      dirPath: '/kb/empty',
      root: '/skills',
      fs,
    })

    expect(result.length).toBe(0)
  })

  it('should not recurse into subdirectories', async () => {
    const baseFs = new InMemoryFileSystemService({}, '/kb', '/kb')
    baseFs.writeFile('/kb/dir/file.md', '[Link](/skills/a.md)')
    baseFs.writeFile('/kb/dir/subdir/nested.md', '[Link](/skills/b.md)')

    const fs = Object.assign({}, baseFs, {
      resolve: (...paths: string[]) => paths.join('/').replace(/\/+/g, '/'),
      readdir: async () => [{ name: 'file.md' }, { name: 'subdir' }] as any,
      stat: async (path: string) => ({
        isDirectory: () => path.includes('subdir'),
        isFile: () => !path.includes('subdir'),
      }),
    })

    const result = await rewriteDirectoryLinks({
      dirPath: '/kb/dir',
      root: '/skills',
      fs,
    })

    expect(result.length).toBe(1)
    expect(result).toContain('/kb/dir/file.md')

    const nested = await fs.readFile('/kb/dir/subdir/nested.md')
    expect(nested).toBe('[Link](/skills/b.md)')
  })
})

describe('rewriteAbsoluteLinks', () => {
  let fs: FileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, '/kb', '/kb')
  })

  it('should detect file and call rewriteFileLinks', async () => {
    fs.writeFile('/kb/file.md', '[Link](/skills/a.md)')

    const result = await rewriteAbsoluteLinks({
      path: '/kb/file.md',
      root: '/skills',
      fs,
    })

    expect(result.length).toBe(1)
    expect(result).toContain('/kb/file.md')

    const content = await fs.readFile('/kb/file.md')
    expect(content).toBe('[Link](a.md)')
  })

  it('should detect directory and call rewriteDirectoryLinks', async () => {
    const baseFs = new InMemoryFileSystemService({}, '/kb', '/kb')
    baseFs.writeFile('/kb/dir/file1.md', '[Link](/skills/a.md)')
    baseFs.writeFile('/kb/dir/file2.md', '[Link](/skills/b.md)')

    const mockFs = Object.assign({}, baseFs, {
      resolve: (...paths: string[]) => paths.join('/').replace(/\/+/g, '/'),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      exists: async (_path: string) => true,
      readdir: async () => [{ name: 'file1.md' }, { name: 'file2.md' }] as any,
      stat: async (path: string) => ({
        isDirectory: () => path === '/kb/dir',
        isFile: () => path !== '/kb/dir',
      }),
    })

    const result = await rewriteAbsoluteLinks({
      path: '/kb/dir',
      root: '/skills',
      fs: mockFs,
    })

    expect(result.length).toBe(2)
    expect(result).toContain('/kb/dir/file1.md')
    expect(result).toContain('/kb/dir/file2.md')
  })

  it('should throw error for non-existent path', async () => {
    await expect(
      rewriteAbsoluteLinks({
        path: '/kb/missing',
        root: '/skills',
        fs,
      }),
    ).rejects.toThrow('Path does not exist: /kb/missing')
  })
})
