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
