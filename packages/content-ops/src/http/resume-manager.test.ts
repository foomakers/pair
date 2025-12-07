import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'

const {
  getPartialFilePath,
  hasPartialDownload,
  getPartialFileSize,
  cleanupPartialFile,
  shouldResume,
} = await import('./resume-manager')

describe('Resume Manager - Partial File Paths', () => {
  it('appends .partial extension to file path', () => {
    const filePath = '/tmp/kb-0.2.0.zip'
    const partialPath = getPartialFilePath(filePath)
    expect(partialPath).toBe('/tmp/kb-0.2.0.zip.partial')
  })

  it('handles paths with multiple dots', () => {
    const filePath = '/tmp/knowledge-base.v1.2.3.zip'
    const partialPath = getPartialFilePath(filePath)
    expect(partialPath).toBe('/tmp/knowledge-base.v1.2.3.zip.partial')
  })
})

describe('Resume Manager - Partial File Detection', () => {
  it('returns true when partial file exists', async () => {
    const fs = new InMemoryFileSystemService({ '/tmp/kb.zip.partial': 'partial data' }, '/', '/')
    const result = await hasPartialDownload('/tmp/kb.zip', fs)
    expect(result).toBe(true)
  })

  it('returns false when partial file does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const result = await hasPartialDownload('/tmp/kb.zip', fs)
    expect(result).toBe(false)
  })
})

describe('Resume Manager - Partial File Size', () => {
  it('returns size of partial file', async () => {
    const partialContent = Buffer.alloc(1024 * 500) // 500 KB
    const fs = new InMemoryFileSystemService(
      { '/tmp/kb.zip.partial': partialContent.toString() },
      '/',
      '/',
    )
    const size = await getPartialFileSize('/tmp/kb.zip', fs)
    expect(size).toBeGreaterThan(0)
  })

  it('returns 0 when partial file does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const size = await getPartialFileSize('/tmp/kb.zip', fs)
    expect(size).toBe(0)
  })
})

describe('Resume Manager - Cleanup', () => {
  it('deletes partial file', async () => {
    const fs = new InMemoryFileSystemService({ '/tmp/kb.zip.partial': 'partial data' }, '/', '/')

    expect(fs.existsSync('/tmp/kb.zip.partial')).toBe(true)
    await cleanupPartialFile('/tmp/kb.zip', fs)
    expect(fs.existsSync('/tmp/kb.zip.partial')).toBe(false)
  })

  it('does not throw when partial file does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    await expect(cleanupPartialFile('/tmp/kb.zip', fs)).resolves.not.toThrow()
  })
})

describe('Resume Manager - Resume Decision', () => {
  it('resumes when partial file exists and is smaller than total', async () => {
    const fs = new InMemoryFileSystemService(
      { '/tmp/kb.zip.partial': Buffer.alloc(500).toString() }, // 500 bytes
      '/',
      '/',
    )

    const result = await shouldResume('/tmp/kb.zip', 1000, fs)
    expect(result.shouldResume).toBe(true)
    expect(result.bytesDownloaded).toBeGreaterThan(0)
    expect(result.bytesDownloaded).toBeLessThan(1000)
  })

  it('does not resume when partial file equals or exceeds total size', async () => {
    const fs = new InMemoryFileSystemService(
      { '/tmp/kb.zip.partial': Buffer.alloc(1000).toString() },
      '/',
      '/',
    )

    const result = await shouldResume('/tmp/kb.zip', 500, fs)
    expect(result.shouldResume).toBe(false)
    expect(result.bytesDownloaded).toBe(0)
  })

  it('does not resume when partial file does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const result = await shouldResume('/tmp/kb.zip', 1000, fs)
    expect(result.shouldResume).toBe(false)
    expect(result.bytesDownloaded).toBe(0)
  })

  it('does not resume when total size is 0 or unknown', async () => {
    const fs = new InMemoryFileSystemService(
      { '/tmp/kb.zip.partial': Buffer.alloc(500).toString() },
      '/',
      '/',
    )

    const result = await shouldResume('/tmp/kb.zip', 0, fs)
    expect(result.shouldResume).toBe(false)
  })
})
