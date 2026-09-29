import { describe, it, expect, vi } from 'vitest'
import type { ClientRequest } from 'http'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { MockHttpClientService } from '../test-utils/mock-http-client-service'
import { buildTestResponse, toIncomingMessage } from '../test-utils/http-test-helpers'

const {
  getPartialFilePath,
  hasPartialDownload,
  getPartialFileSize,
  cleanupPartialFile,
  shouldResume,
  getContentLength,
  setupResumeContext,
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

/**
 * The HEAD probe goes through the INJECTED client. It used to call `https.request` directly, so
 * every suite that handed a mock client in still made a real HEAD request to the URL under test
 * (github.com, example.com, …) — the latency of the network, not the code, decided whether a
 * test finished inside vitest's timeout.
 */
describe('Resume Manager - Content length probe', () => {
  it('asks the injected client, with HEAD, for the content length', async () => {
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1000' })),
    ])
    const requestSpy = vi.spyOn(httpClient, 'request')

    const total = await getContentLength('https://unreachable.invalid/kb.zip', httpClient)

    expect(total).toBe(1000)
    expect(requestSpy).toHaveBeenCalledWith(
      'https://unreachable.invalid/kb.zip',
      expect.objectContaining({ method: 'HEAD' }),
      expect.any(Function),
    )
  })

  // #135 AC6: no path handling changes here — the probe takes the URL as-is and never builds a
  // path, so its behaviour is independent of the host platform (darwin/linux alike).
  it.each(['darwin', 'linux'] as const)(
    'probes the same way on platform %s (no platform-specific branch)',
    async platform => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform')
      Object.defineProperty(process, 'platform', { value: platform })
      try {
        const httpClient = new MockHttpClientService()
        httpClient.setRequestResponses([
          toIncomingMessage(buildTestResponse(200, { 'content-length': '42' })),
        ])
        await expect(
          getContentLength('https://unreachable.invalid/kb.zip', httpClient),
        ).resolves.toBe(42)
      } finally {
        if (original) Object.defineProperty(process, 'platform', original)
      }
    },
  )

  it('resolves 0 when the probe errors', async () => {
    const httpClient = new MockHttpClientService()
    vi.spyOn(httpClient, 'request').mockImplementation(() => {
      const req = {
        on: (event: string, handler: (err: Error) => void) => {
          if (event === 'error') setImmediate(() => handler(new Error('ENOTFOUND')))
          return req
        },
        end: () => undefined,
      } as unknown as ClientRequest
      return req
    })

    await expect(getContentLength('https://unreachable.invalid/kb.zip', httpClient)).resolves.toBe(
      0,
    )
  })

  it('setupResumeContext resumes from the partial file using the injected client total', async () => {
    const fs = new InMemoryFileSystemService(
      { '/tmp/kb.zip.partial': Buffer.alloc(500).toString() },
      '/',
      '/',
    )
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1000' })),
    ])

    const ctx = await setupResumeContext({
      url: 'https://unreachable.invalid/kb.zip',
      destination: '/tmp/kb.zip',
      fs,
      httpClient,
    })

    expect(ctx.totalBytes).toBe(1000)
    expect(ctx.resumeFrom).toBeGreaterThan(0)
  })
})
