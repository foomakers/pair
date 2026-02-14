import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'
import {
  validateKBStructure,
  findKBStructureInSubdirectories,
  moveDirectoryContents,
  copyDirectoryContents,
  normalizeExtractedKB,
} from './kb-validation'

describe('kb-validation', () => {
  const cwd = '/test'

  function createFs(files: Record<string, string> = {}) {
    return new InMemoryFileSystemService(files, cwd, cwd)
  }

  describe('validateKBStructure', () => {
    it('returns true when .pair directory exists', async () => {
      const fs = createFs({ '/cache/.pair/config.md': 'content' })
      expect(await validateKBStructure('/cache', fs)).toBe(true)
    })

    it('returns true when AGENTS.md exists', async () => {
      const fs = createFs({ '/cache/AGENTS.md': '# Agents' })
      expect(await validateKBStructure('/cache', fs)).toBe(true)
    })

    it('returns true when manifest.json + other files exist', async () => {
      const fs = createFs({
        '/cache/manifest.json': '{}',
        '/cache/README.md': '# KB',
      })
      expect(await validateKBStructure('/cache', fs)).toBe(true)
    })

    it('returns false when manifest.json is alone', async () => {
      const fs = createFs({ '/cache/manifest.json': '{}' })
      expect(await validateKBStructure('/cache', fs)).toBe(false)
    })

    it('returns false for empty directory', async () => {
      const fs = createFs()
      await fs.mkdir('/cache', { recursive: true })
      expect(await validateKBStructure('/cache', fs)).toBe(false)
    })

    it('returns false for non-existent directory', async () => {
      const fs = createFs()
      expect(await validateKBStructure('/nope', fs)).toBe(false)
    })
  })

  describe('findKBStructureInSubdirectories', () => {
    it('returns subdirectory path when single subdir has KB', async () => {
      const fs = createFs({ '/cache/kb-v1/.pair/config.md': 'c' })
      const result = await findKBStructureInSubdirectories('/cache', fs)
      expect(result).toBe('/cache/kb-v1')
    })

    it('returns null when multiple subdirectories exist', async () => {
      const fs = createFs({
        '/cache/dir1/.pair/c.md': 'c',
        '/cache/dir2/.pair/c.md': 'c',
      })
      const result = await findKBStructureInSubdirectories('/cache', fs)
      expect(result).toBeNull()
    })

    it('finds KB in .zip-temp subdirectory', async () => {
      const fs = createFs({ '/cache/.zip-temp/AGENTS.md': '# Agents' })
      const result = await findKBStructureInSubdirectories('/cache', fs)
      expect(result).toBe('/cache/.zip-temp')
    })

    it('returns null for empty directory', async () => {
      const fs = createFs()
      await fs.mkdir('/cache', { recursive: true })
      const result = await findKBStructureInSubdirectories('/cache', fs)
      expect(result).toBeNull()
    })
  })

  describe('moveDirectoryContents', () => {
    it('moves files from source to target', async () => {
      const fs = createFs({
        '/src/a.md': 'file-a',
        '/src/b.md': 'file-b',
      })
      await fs.mkdir('/dst', { recursive: true })

      await moveDirectoryContents('/src', '/dst', fs)

      expect(await fs.readFile('/dst/a.md')).toBe('file-a')
      expect(await fs.readFile('/dst/b.md')).toBe('file-b')
      expect(fs.existsSync('/src/a.md')).toBe(false)
    })

    it('moves nested directories recursively', async () => {
      const fs = createFs({
        '/src/sub/deep.md': 'deep content',
      })
      await fs.mkdir('/dst', { recursive: true })

      await moveDirectoryContents('/src', '/dst', fs)

      expect(await fs.readFile('/dst/sub/deep.md')).toBe('deep content')
    })
  })

  describe('copyDirectoryContents', () => {
    it('copies files from source to target', async () => {
      const fs = createFs({
        '/src/a.md': 'file-a',
        '/src/b.md': 'file-b',
      })

      await copyDirectoryContents(fs, '/src', '/dst')

      expect(await fs.readFile('/dst/a.md')).toBe('file-a')
      expect(await fs.readFile('/dst/b.md')).toBe('file-b')
      // Source still exists
      expect(await fs.readFile('/src/a.md')).toBe('file-a')
    })

    it('copies nested directories recursively', async () => {
      const fs = createFs({
        '/src/sub/deep.md': 'deep',
      })

      await copyDirectoryContents(fs, '/src', '/dst')

      expect(await fs.readFile('/dst/sub/deep.md')).toBe('deep')
    })
  })

  describe('normalizeExtractedKB', () => {
    it('returns true when KB is already at root', async () => {
      const fs = createFs({ '/cache/.pair/c.md': 'c' })
      expect(await normalizeExtractedKB('/cache', fs)).toBe(true)
    })

    it('moves nested KB to root and returns true', async () => {
      const fs = createFs({ '/cache/nested/.pair/c.md': 'c' })

      const result = await normalizeExtractedKB('/cache', fs)

      expect(result).toBe(true)
      expect(fs.existsSync('/cache/.pair/c.md')).toBe(true)
    })

    it('returns false when no KB structure found', async () => {
      const fs = createFs({ '/cache/random.txt': 'data' })
      expect(await normalizeExtractedKB('/cache', fs)).toBe(false)
    })
  })
})
