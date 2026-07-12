import { describe, it, expect, beforeEach } from 'vitest'
import type { InMemoryFileSystemService } from './in-memory-fs'
import { createFs } from './test-fixtures'

describe('in-memory-fs-write', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createFs()
  })

  describe('writeFile', () => {
    it('should write and read files synchronously', () => {
      fs.writeFile('/test.txt', 'content')
      expect(fs.readFileSync('/test.txt')).toBe('content')
    })

    it('should write and read files asynchronously', async () => {
      await fs.writeFile('/async.txt', 'async content')
      expect(await fs.readFile('/async.txt')).toBe('async content')
    })

    it('should handle relative paths', () => {
      fs.writeFile('relative.txt', 'relative content')
      expect(fs.readFileSync('relative.txt')).toBe('relative content')
    })

    it('should create parent directories when writing', () => {
      fs.writeFile('/deep/nested/file.txt', 'nested content')
      expect(fs.existsSync('/deep')).toBe(true)
      expect(fs.existsSync('/deep/nested')).toBe(true)
      expect(fs.readFileSync('/deep/nested/file.txt')).toBe('nested content')
    })
  })

  describe('unlink', () => {
    it('should remove files', async () => {
      await fs.writeFile('/test.txt', 'content')
      expect(fs.existsSync('/test.txt')).toBe(true)
      await fs.unlink('/test.txt')
      expect(fs.existsSync('/test.txt')).toBe(false)
    })

    it('should throw error when unlinking non-existent file', async () => {
      await expect(fs.unlink('/nonexistent.txt')).rejects.toThrow(
        'File not found: /nonexistent.txt',
      )
    })
  })

  describe('mkdir', () => {
    it('should create directories', async () => {
      await fs.mkdir('/newdir')
      expect(fs.existsSync('/newdir')).toBe(true)
    })

    it('should create parent directories recursively', async () => {
      await fs.mkdir('/deep/nested/dir', { recursive: true })
      expect(fs.existsSync('/deep')).toBe(true)
      expect(fs.existsSync('/deep/nested')).toBe(true)
      expect(fs.existsSync('/deep/nested/dir')).toBe(true)
    })

    it('should handle existing directories', async () => {
      await fs.mkdir('/existing')
      expect(() => fs.mkdir('/existing')).not.toThrow()
    })
  })

  describe('rename', () => {
    it('should rename files', async () => {
      await fs.writeFile('/old.txt', 'content')
      await fs.rename('/old.txt', '/new.txt')
      expect(fs.existsSync('/old.txt')).toBe(false)
      expect(fs.existsSync('/new.txt')).toBe(true)
      expect(fs.readFileSync('/new.txt')).toBe('content')
    })

    it('should rename directories', async () => {
      await fs.mkdir('/olddir')
      await fs.writeFile('/olddir/file.txt', 'content')
      await fs.rename('/olddir', '/newdir')
      expect(fs.existsSync('/olddir')).toBe(false)
      expect(fs.existsSync('/newdir')).toBe(true)
      expect(fs.readFileSync('/newdir/file.txt')).toBe('content')
    })

    it('should throw error when renaming non-existent file', async () => {
      await expect(fs.rename('/nonexistent.txt', '/new.txt')).rejects.toThrow(
        'Path not found: /nonexistent.txt',
      )
    })
  })

  describe('copy', () => {
    it('should copy files', async () => {
      await fs.writeFile('/source.txt', 'content')
      await fs.copy('/source.txt', '/dest.txt')
      expect(fs.existsSync('/source.txt')).toBe(true)
      expect(fs.existsSync('/dest.txt')).toBe(true)
      expect(fs.readFileSync('/dest.txt')).toBe('content')
    })

    it('should create parent directories when copying', async () => {
      await fs.writeFile('/source.txt', 'content')
      await fs.copy('/source.txt', '/deep/nested/dest.txt')
      expect(fs.existsSync('/deep/nested/dest.txt')).toBe(true)
      expect(fs.readFileSync('/deep/nested/dest.txt')).toBe('content')
    })

    it('should throw error when copying non-existent file', async () => {
      await expect(fs.copy('/nonexistent.txt', '/dest.txt')).rejects.toThrow(
        'Path not found: /nonexistent.txt',
      )
    })
  })

  describe('copySync', () => {
    it('should copy a file to a new path', () => {
      fs.writeFile('/foo.txt', 'hello')
      fs.copySync('/foo.txt', '/bar.txt')
      expect(fs.getContent('/bar.txt')).toBe('hello')
      expect(fs.getContent('/foo.txt')).toBe('hello')
    })

    it('should copy a file to a new directory', () => {
      fs.writeFile('/foo.txt', 'hello')
      fs.copySync('/foo.txt', '/dir/bar.txt')
      expect(fs.getContent('/dir/bar.txt')).toBe('hello')
    })

    it('should copy a directory recursively', () => {
      fs.writeFile('/foo/bar/baz.txt', 'baz')
      fs.copySync('/foo/bar', '/foo/barcopy')
      expect(fs.getContent('/foo/barcopy/baz.txt')).toBe('baz')
      expect(fs.getContent('/foo/bar/baz.txt')).toBe('baz')
    })

    it('should throw if source does not exist', () => {
      expect(() => fs.copySync('/notfound', '/foo/x')).toThrow()
    })

    it('should copy nested directories and files', () => {
      fs.writeFile('/foo/file.txt', 'hello')
      fs.writeFile('/foo/bar/baz.txt', 'baz')
      fs.copySync('/foo', '/fooCopy')
      expect(fs.getContent('/fooCopy/file.txt')).toBe('hello')
      expect(fs.getContent('/fooCopy/bar/baz.txt')).toBe('baz')
    })
  })

  describe('rm', () => {
    it('should remove files', async () => {
      await fs.writeFile('/test.txt', 'content')
      await fs.rm('/test.txt')
      expect(fs.existsSync('/test.txt')).toBe(false)
    })

    it('should remove directories recursively', async () => {
      await fs.mkdir('/testdir', { recursive: true })
      await fs.writeFile('/testdir/file.txt', 'content')
      await fs.rm('/testdir', { recursive: true })
      expect(fs.existsSync('/testdir')).toBe(false)
      expect(fs.existsSync('/testdir/file.txt')).toBe(false)
    })

    it('should throw error when removing non-existent path', async () => {
      await expect(fs.rm('/nonexistent')).rejects.toThrow('Path not found: /nonexistent')
    })

    it('should throw error when removing directory without recursive option', async () => {
      await fs.mkdir('/testdir')
      await fs.writeFile('/testdir/file.txt', 'content')
      await expect(fs.rm('/testdir')).rejects.toThrow('Directory not empty: /testdir')
    })
  })

  describe('createZip / extractZip', () => {
    it('should create and extract ZIP from single file', async () => {
      const zipFs = createFs({ '/project/file.txt': 'content' }, '/project', '/project')

      await zipFs.createZip(['/project/file.txt'], '/project/archive.zip')
      expect(zipFs.existsSync('/project/archive.zip')).toBe(true)

      await zipFs.extractZip('/project/archive.zip', '/project/extracted')
      expect(zipFs.existsSync('/project/extracted/file.txt')).toBe(true)
      expect(await zipFs.readFile('/project/extracted/file.txt')).toBe('content')
    })

    it('should create and extract ZIP from directory', async () => {
      const zipFs = createFs(
        {
          '/project/src/index.ts': 'export {}',
          '/project/src/utils.ts': 'export const util = 1',
          '/project/src/nested/deep.ts': 'deep file',
        },
        '/project',
        '/project',
      )

      await zipFs.createZip(['/project/src'], '/project/bundle.zip')
      expect(zipFs.existsSync('/project/bundle.zip')).toBe(true)

      await zipFs.extractZip('/project/bundle.zip', '/project/output')
      expect(zipFs.existsSync('/project/output/index.ts')).toBe(true)
      expect(zipFs.existsSync('/project/output/utils.ts')).toBe(true)
      expect(zipFs.existsSync('/project/output/nested/deep.ts')).toBe(true)
      expect(await zipFs.readFile('/project/output/index.ts')).toBe('export {}')
      expect(await zipFs.readFile('/project/output/nested/deep.ts')).toBe('deep file')
    })

    it('should create ZIP from multiple sources', async () => {
      const zipFs = createFs(
        {
          '/project/README.md': '# Project',
          '/project/src/index.ts': 'export {}',
          '/project/config.json': '{}',
        },
        '/project',
        '/project',
      )

      await zipFs.createZip(
        ['/project/README.md', '/project/config.json', '/project/src'],
        '/project/package.zip',
      )
      await zipFs.extractZip('/project/package.zip', '/project/unpacked')

      expect(zipFs.existsSync('/project/unpacked/README.md')).toBe(true)
      expect(zipFs.existsSync('/project/unpacked/config.json')).toBe(true)
      expect(zipFs.existsSync('/project/unpacked/index.ts')).toBe(true)
    })

    it('should throw error when extracting non-existent ZIP', async () => {
      const zipFs = createFs({}, '/project', '/project')

      await expect(zipFs.extractZip('/project/missing.zip', '/project/out')).rejects.toThrow(
        'ZIP file not found',
      )
    })

    it('should handle empty directory in ZIP', async () => {
      const zipFs = createFs({ '/project/src/file.ts': 'content' }, '/project', '/project')

      await zipFs.createZip(['/project/src'], '/project/archive.zip')
      await zipFs.extractZip('/project/archive.zip', '/project/restored')

      expect(zipFs.existsSync('/project/restored/file.ts')).toBe(true)
      expect(await zipFs.readFile('/project/restored/file.ts')).toBe('content')
    })
  })
})
