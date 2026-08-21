import { describe, it, expect, beforeEach } from 'vitest'
import type { InMemoryFileSystemService } from './in-memory-fs'
import { createFs } from './test-fixtures'

describe('in-memory-fs-read', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createFs()
  })

  describe('readFileSync', () => {
    it('should throw error when reading non-existent file', () => {
      expect(() => fs.readFileSync('/nonexistent.txt')).toThrow('File not found: /nonexistent.txt')
    })
  })

  describe('existsSync / exists', () => {
    it('should return true for existing files', async () => {
      fs.writeFile('/existing.txt', 'content')
      expect(fs.existsSync('/existing.txt')).toBe(true)
      expect(await fs.exists('/existing.txt')).toBe(true)
    })

    it('should return false for non-existing files', async () => {
      expect(fs.existsSync('/nonexistent.txt')).toBe(false)
      expect(await fs.exists('/nonexistent.txt')).toBe(false)
    })

    it('should return true for existing directories', () => {
      expect(fs.existsSync('/')).toBe(true)
    })
  })

  describe('readdir', () => {
    it('should list directory contents', async () => {
      await fs.writeFile('/dir/file1.txt', 'content1')
      await fs.writeFile('/dir/file2.txt', 'content2')
      await fs.mkdir('/dir/subdir')

      const entries = await fs.readdir('/dir')
      expect(entries.map(e => e.name)).toContain('file1.txt')
      expect(entries.map(e => e.name)).toContain('file2.txt')
      expect(entries.map(e => e.name)).toContain('subdir')
    })

    it('should return empty array for empty directory', async () => {
      await fs.mkdir('/emptydir')
      expect((await fs.readdir('/emptydir')).length).toBe(0)
    })

    it('should throw error for non-existent directory', async () => {
      await expect(fs.readdir('/nonexistent')).rejects.toThrow(
        "no such file or directory '/nonexistent'",
      )
    })

    it('enumerates a symlink, reported as a real Dirent reports one', async () => {
      // Until US-396 review round 4 a symlinked entry was simply never listed, so every
      // traversal guard keyed on `isSymbolicLink()` was UNREACHABLE through this double:
      // a regression test for the guard passed whether the guard was there or not.
      await fs.writeFile('/dir/real.txt', 'x')
      await fs.symlink('/elsewhere/target.txt', '/dir/link.txt')

      const link = (await fs.readdir('/dir')).find(e => e.name === 'link.txt')

      expect(link).toBeDefined()
      expect(link!.isSymbolicLink()).toBe(true)
      // A real Dirent for a symlink reports NEITHER — that is what made an unguarded
      // escaping link fall through to the file branch in the first place.
      expect(link!.isFile()).toBe(false)
      expect(link!.isDirectory()).toBe(false)
    })

    it('follows a symlink to a directory, as the real syscall does', async () => {
      // The read side of this double is documented as FOLLOWING links; `readdir` alone
      // resolved lexically, so a walk that reached a directory THROUGH a link got
      // `Directory not found` where node returns the target's entries — the same class of
      // divergence round 4 fixed, one call site away (US-396 review round 6).
      await fs.writeFile('/target/inside.txt', 'x')
      await fs.symlink('/target', '/dir/alias')

      const entries = await fs.readdir('/dir/alias')

      expect(entries.map(e => e.name)).toEqual(['inside.txt'])
    })

    it('follows a symlinked ANCESTOR of the directory read', async () => {
      await fs.writeFile('/target/sub/deep.txt', 'x')
      await fs.symlink('/target', '/dir/alias')

      const entries = await fs.readdir('/dir/alias/sub')

      expect(entries.map(e => e.name)).toEqual(['deep.txt'])
    })

    it('lists a symlinked directory once, as a symlink and not as a directory', async () => {
      await fs.mkdir('/target')
      await fs.symlink('/target', '/dir/alias')

      const entries = (await fs.readdir('/dir')).filter(e => e.name === 'alias')

      expect(entries).toHaveLength(1)
      expect(entries[0]!.isSymbolicLink()).toBe(true)
    })
  })

  describe('stat', () => {
    it('should return file stats', async () => {
      await fs.writeFile('/test.txt', 'content')
      const stats = await fs.stat('/test.txt')
      expect(stats.isFile()).toBe(true)
      expect(stats.isDirectory()).toBe(false)
    })

    it('should return directory stats', async () => {
      const stats = await fs.stat('/')
      expect(stats.isFile()).toBe(false)
      expect(stats.isDirectory()).toBe(true)
    })

    it('should throw error for non-existent path', async () => {
      await expect(fs.stat('/nonexistent')).rejects.toThrow(
        "no such file or directory '/nonexistent'",
      )
    })
  })

  describe('getContent', () => {
    it('should return file content for existing file', () => {
      fs.writeFile('/file1.txt', 'content1')
      expect(fs.getContent('/file1.txt')).toBe('content1')
    })

    it('should return undefined for non-existing file', () => {
      expect(fs.getContent('/nonexistent.txt')).toBeUndefined()
    })
  })
})

/**
 * US-395 (absorbed #429) — the double must round-trip bytes the same way the real
 * service does, or a content-hash computed in a test is not the hash production computes.
 */
describe('readFileBytes (byte-mode read, US-395/#429)', () => {
  it('round-trips the bytes written with writeFileBinary', async () => {
    const fs = createFs()
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x80, 0xff, 0xfe, 0x81])
    await fs.writeFileBinary('/blob.bin', bytes)

    const read = await fs.readFileBytes('/blob.bin')

    expect(Buffer.isBuffer(read)).toBe(true)
    expect(read.equals(bytes)).toBe(true)
  })

  it('throws File not found like the text-mode read', async () => {
    const fs = createFs()
    await expect(fs.readFileBytes('/nonexistent.bin')).rejects.toThrow(
      'File not found: /nonexistent.bin',
    )
  })
})
