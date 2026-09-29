import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ClientRequest } from 'http'
import { EventEmitter } from 'events'
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

  // No path handling here: the probe takes the URL as-is and never builds a path, so its
  // behaviour is independent of the host platform (darwin/linux alike).
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
    expect(ctx.resumeFrom).toBe(500)
  })
})

/**
 * Contract the implementation must satisfy (resume-manager.ts):
 *
 *   export interface ContentLengthProbeOptions {
 *     maxRedirects?: number // default 5 — redirect hops followed; one more redirect resolves 0
 *     timeoutMs?: number // default 10_000 — per probe; on expiry the request is destroyed (or
 *     //                    aborted) and the probe resolves 0
 *   }
 *   export function getContentLength(
 *     url: string,
 *     httpClient: HttpClientService,
 *     options?: ContentLengthProbeOptions,
 *   ): Promise<number>
 *
 * A 301/302/307 (303/308 alike) with a `location` header is followed with another HEAD through
 * the same injected client; a relative `location` resolves against the URL of the hop that
 * returned it (`new URL(location, currentUrl)`). The size reported is the final target's
 * `content-length`, never the redirect body's (GitHub release URLs answer 302 with 9 bytes).
 * The timer may be `setTimeout` or `request.setTimeout`; both run on vitest fake timers here.
 */
const GH_URL = 'https://github.com/org/repo/releases/latest/download/kb.zip'

function redirectTo(status: number, location: string) {
  return toIncomingMessage(buildTestResponse(status, { location, 'content-length': '9' }))
}

function ok(contentLength: string) {
  return toIncomingMessage(buildTestResponse(200, { 'content-length': contentLength }))
}

function requestedUrls(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map(call => call[0])
}

describe('Resume Manager - Content length probe follows redirects', () => {
  it.each([301, 302, 307])(
    'HEAD %s with a location reports the final target size, not the redirect body',
    async status => {
      const httpClient = new MockHttpClientService()
      httpClient.setRequestResponses([
        redirectTo(status, 'https://objects.example.com/release/kb.zip'),
        ok('1000'),
      ])
      const requestSpy = vi.spyOn(httpClient, 'request')

      const total = await getContentLength(GH_URL, httpClient)

      expect(total).toBe(1000)
      expect(requestSpy).toHaveBeenNthCalledWith(
        2,
        'https://objects.example.com/release/kb.zip',
        expect.objectContaining({ method: 'HEAD' }),
        expect.any(Function),
      )
    },
  )

  it.each([
    [
      '/org/repo/releases/download/v1.0.0/kb.zip',
      'https://github.com/org/repo/releases/download/v1.0.0/kb.zip',
    ],
    ['v1.0.0/kb.zip', 'https://github.com/org/repo/releases/latest/download/v1.0.0/kb.zip'],
  ])('resolves a relative location %s against the original URL', async (location, expected) => {
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([redirectTo(302, location), ok('1000')])
    const requestSpy = vi.spyOn(httpClient, 'request')

    const total = await getContentLength(GH_URL, httpClient)

    expect(total).toBe(1000)
    expect(requestedUrls(requestSpy)).toEqual([GH_URL, expected])
  })

  it('resolves a relative location of a later hop against that hop, not the original URL', async () => {
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      redirectTo(302, 'https://objects.example.com/a/b'),
      redirectTo(302, 'c'),
      ok('1000'),
    ])
    const requestSpy = vi.spyOn(httpClient, 'request')

    const total = await getContentLength(GH_URL, httpClient)

    expect(total).toBe(1000)
    expect(requestedUrls(requestSpy)).toEqual([
      GH_URL,
      'https://objects.example.com/a/b',
      'https://objects.example.com/a/c',
    ])
  })
})

describe('Resume Manager - Content length probe bounds the redirect chain', () => {
  it('follows exactly 5 redirects and reports the final size', async () => {
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      ...[1, 2, 3, 4, 5].map(n => redirectTo(302, `https://objects.example.com/hop-${n}`)),
      ok('1000'),
    ])

    await expect(getContentLength(GH_URL, httpClient)).resolves.toBe(1000)
  })

  it('resolves 0 on a redirect loop longer than 5 hops, with at most 6 requests', async () => {
    const httpClient = new MockHttpClientService()
    // The mock reuses the last queued response forever: an endless 302 loop.
    httpClient.setRequestResponses([redirectTo(302, GH_URL)])
    const requestSpy = vi.spyOn(httpClient, 'request')

    await expect(getContentLength(GH_URL, httpClient)).resolves.toBe(0)
    expect(requestSpy.mock.calls.length).toBeLessThanOrEqual(6)
  })

  it('honours a custom maxRedirects', async () => {
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      redirectTo(302, 'https://objects.example.com/hop-1'),
      redirectTo(302, 'https://objects.example.com/hop-2'),
      ok('1000'),
    ])

    await expect(getContentLength(GH_URL, httpClient, { maxRedirects: 1 })).resolves.toBe(0)
  })
})

function neverRespondingRequest() {
  const emitter = new EventEmitter()
  const destroy = vi.fn()
  const abort = vi.fn()
  const request = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      emitter.on(event, handler)
      return request
    },
    once: (event: string, handler: (...args: unknown[]) => void) => {
      emitter.once(event, handler)
      return request
    },
    end: () => undefined,
    destroy: () => {
      destroy()
      return request
    },
    abort,
    setTimeout: (ms: number, callback?: () => void) => {
      if (callback) emitter.once('timeout', callback)
      setTimeout(() => emitter.emit('timeout'), ms)
      return request
    },
  } as unknown as ClientRequest
  return { request, destroy, abort }
}

describe('Resume Manager - Content length probe times out', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves 0 at timeoutMs and destroys the request when the server never answers', async () => {
    vi.useFakeTimers()
    const httpClient = new MockHttpClientService()
    const hung = neverRespondingRequest()
    vi.spyOn(httpClient, 'request').mockImplementation(() => hung.request)

    let settled: number | undefined
    void getContentLength(GH_URL, httpClient, { timeoutMs: 1000 }).then(v => {
      settled = v
    })

    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(0)
    expect(hung.destroy.mock.calls.length + hung.abort.mock.calls.length).toBeGreaterThan(0)
  })

  it('applies a default timeout of 10_000 ms when none is given', async () => {
    vi.useFakeTimers()
    const httpClient = new MockHttpClientService()
    const hung = neverRespondingRequest()
    vi.spyOn(httpClient, 'request').mockImplementation(() => hung.request)

    let settled: number | undefined
    void getContentLength(GH_URL, httpClient).then(v => {
      settled = v
    })

    await vi.advanceTimersByTimeAsync(10_000)
    expect(settled).toBe(0)
    expect(hung.destroy.mock.calls.length + hung.abort.mock.calls.length).toBeGreaterThan(0)
  })
})
