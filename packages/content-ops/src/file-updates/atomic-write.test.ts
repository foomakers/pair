import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AtomicWriter } from './atomic-write'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

describe('AtomicWriter - Basic Operations', () => {
  let fileService: InMemoryFileSystemService
  let atomicWriter: AtomicWriter

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    atomicWriter = new AtomicWriter(fileService)
  })

  it('should write file atomically', async () => {
    await atomicWriter.writeFileAtomic('/test.md', '# Test Content')

    const content = await fileService.readFile('/test.md')
    expect(content).toBe('# Test Content')
  })

  it('should create parent directories if needed', async () => {
    await atomicWriter.writeFileAtomic('/deep/nested/file.md', '# Deep File')

    expect(await fileService.exists('/deep/nested/file.md')).toBe(true)
    const content = await fileService.readFile('/deep/nested/file.md')
    expect(content).toBe('# Deep File')
  })

  it('should overwrite existing file atomically', async () => {
    await fileService.writeFile('/existing.md', '# Original')
    await atomicWriter.writeFileAtomic('/existing.md', '# Updated')

    const content = await fileService.readFile('/existing.md')
    expect(content).toBe('# Updated')
  })
})

describe('AtomicWriter - Temp File Pattern', () => {
  let fileService: InMemoryFileSystemService
  let atomicWriter: AtomicWriter

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    atomicWriter = new AtomicWriter(fileService)
  })

  it('should use temp file then rename pattern', async () => {
    const writeSpy = vi.spyOn(fileService, 'writeFile')
    const renameSpy = vi.spyOn(fileService, 'rename')

    await atomicWriter.writeFileAtomic('/target.md', '# Content')

    // Should write to temp file first
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/target\.md\.tmp-\d+$/),
      '# Content',
    )

    // Then rename to final destination
    expect(renameSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/target\.md\.tmp-\d+$/),
      '/target.md',
    )
  })

  it('should clean up temp file after successful rename', async () => {
    await atomicWriter.writeFileAtomic('/test.md', '# Test')

    // No .tmp files should remain
    const allFiles = await getAllFiles(fileService, '/')
    const tempFiles = allFiles.filter(f => f.includes('.tmp-'))
    expect(tempFiles).toHaveLength(0)
  })
})

describe('AtomicWriter - Error Handling', () => {
  let fileService: InMemoryFileSystemService
  let atomicWriter: AtomicWriter

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    atomicWriter = new AtomicWriter(fileService)
  })

  it('should clean up temp file on write error', async () => {
    const writeSpy = vi.spyOn(fileService, 'writeFile')
    writeSpy.mockRejectedValueOnce(new Error('Write failed'))

    await expect(atomicWriter.writeFileAtomic('/test.md', '# Test')).rejects.toThrow('Write failed')

    // Verify no temp files remain
    const allFiles = await getAllFiles(fileService, '/')
    const tempFiles = allFiles.filter(f => f.includes('.tmp-'))
    expect(tempFiles).toHaveLength(0)
  })

  it('should clean up temp file on rename error', async () => {
    const renameSpy = vi.spyOn(fileService, 'rename')
    renameSpy.mockRejectedValueOnce(new Error('Rename failed'))

    await expect(atomicWriter.writeFileAtomic('/test.md', '# Test')).rejects.toThrow(
      'Rename failed',
    )

    // Verify no temp files remain
    const allFiles = await getAllFiles(fileService, '/')
    const tempFiles = allFiles.filter(f => f.includes('.tmp-'))
    expect(tempFiles).toHaveLength(0)
  })
})

describe('AtomicWriter - Dry Run Mode', () => {
  let fileService: InMemoryFileSystemService
  let atomicWriter: AtomicWriter

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    atomicWriter = new AtomicWriter(fileService, { dryRun: true })
  })

  it('should not write files in dry-run mode', async () => {
    await atomicWriter.writeFileAtomic('/test.md', '# Test')

    expect(await fileService.exists('/test.md')).toBe(false)
  })

  it('should not create directories in dry-run mode', async () => {
    await atomicWriter.writeFileAtomic('/deep/nested/test.md', '# Test')

    expect(await fileService.exists('/deep')).toBe(false)
  })

  it('should return successfully in dry-run mode', async () => {
    await expect(atomicWriter.writeFileAtomic('/test.md', '# Test')).resolves.not.toThrow()
  })
})

// Helper function to get all files recursively
async function getAllFiles(fs: InMemoryFileSystemService, dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await fs.readdir(dir)

  for (const entry of entries) {
    const fullPath = `${dir}/${entry.name}`.replace(/\/+/g, '/')
    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fs, fullPath)
      files.push(...subFiles)
    } else {
      files.push(fullPath)
    }
  }

  return files
}
