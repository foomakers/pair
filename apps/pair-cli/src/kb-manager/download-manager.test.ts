import { createRequire } from 'node:module'
import { assert, describe, it, expect, vi, expectTypeOf } from 'vitest'
import { downloadFile, type downloadWithRetry, type KBDownloadOptions } from './download-manager'
import {
  InMemoryFileSystemService,
  MockHttpClientService,
  buildTestResponse,
  toIncomingMessage,
  type DownloadOptions,
  type RetryOptions,
} from '@pair/content-ops'

describe('KB Download Manager', () => {
  it('should throw KB-specific 404 error with version and GitHub URL', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    const notFoundResponse = toIncomingMessage(buildTestResponse(404, {}))
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([notFoundResponse])

    await expect(
      downloadFile(
        'https://github.com/foomakers/pair/releases/download/v0.2.0/kb.zip',
        '/tmp/kb.zip',
        { httpClient, fs },
      ),
    ).rejects.toThrow(/KB v0\.2\.0 not found \(404\).*Download manually from/)
  })

  it('404 message keeps the prerelease', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '0' })),
    ])
    httpClient.setGetResponses([toIncomingMessage(buildTestResponse(404, {}))])
    await expect(
      downloadFile(
        'https://github.com/foomakers/pair/releases/download/v0.5.0-pre.1/kb.zip',
        '/tmp/kb.zip',
        { httpClient, fs },
      ),
    ).rejects.toThrow(/KB v0\.5\.0-pre\.1 not found \(404\)/)
  })

  it.each(['v0.5.0-rc.1-local', 'v0.5.0-rc.1-local-x'])(
    '404 message keeps hyphens inside the prerelease id (%s)',
    async v => {
      const fs = new InMemoryFileSystemService({}, '/', '/')
      const httpClient = new MockHttpClientService()
      httpClient.setRequestResponses([
        toIncomingMessage(buildTestResponse(200, { 'content-length': '0' })),
      ])
      httpClient.setGetResponses([toIncomingMessage(buildTestResponse(404, {}))])
      await expect(
        downloadFile(
          `https://github.com/foomakers/pair/releases/download/${v}/kb.zip`,
          '/tmp/kb.zip',
          {
            httpClient,
            fs,
          },
        ),
      ).rejects.toThrow(`KB ${v} not found (404)`)
    },
  )

  it('should throw KB-specific 403 error', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    const forbiddenResponse = toIncomingMessage(buildTestResponse(403, {}))
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([forbiddenResponse])

    await expect(
      downloadFile('https://example.com/kb.zip', '/tmp/kb.zip', { httpClient, fs }),
    ).rejects.toThrow(/Access denied \(403\)/)
  })

  it('should throw KB-specific network error', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetError(new Error('ECONNREFUSED'))

    await expect(
      downloadFile('https://example.com/kb.zip', '/tmp/kb.zip', { httpClient, fs }),
    ).rejects.toThrow(/Network error downloading KB.*ECONNREFUSED.*Check connectivity/)
  })
})

type RetryCase = [
  name: string,
  rejections: (string | null)[],
  policy: RetryOptions,
  delays: number[],
  attempts: number,
  outcome: 'ok' | 'last' | 'type' | 'undefined',
]

// #750 AC-1/5. Frozen #748 matrix (SHA-256 29e2d4137098333ef1637ddc29c49ee066b233631c21218ddc76452f5fc725ba).
const frozenRows: RetryCase[] = [
  ['first', [], {}, [], 1, 'ok'],
  ['ECONNRESET', ['ECONNRESET'], {}, [1000], 2, 'ok'],
  ['ETIMEDOUT', ['ETIMEDOUT'], {}, [1000], 2, 'ok'],
  ['ECONNREFUSED', ['ECONNREFUSED'], {}, [1000], 2, 'ok'],
  ['socket hang up', ['socket hang up'], {}, [1000], 2, 'ok'],
  ['ENOTFOUND', ['ENOTFOUND'], {}, [1000], 2, 'ok'],
  ['EPIPE', ['EPIPE'], {}, [1000], 2, 'ok'],
  ['exhaust', ['EPIPE', 'EPIPE', 'EPIPE', 'EPIPE'], {}, [1000, 2000, 4000], 4, 'last'],
  ['repeat', ['EPIPE', 'EPIPE', 'EPIPE'], { delays: [7, 13] }, [7, 13, 13], 4, 'ok'],
  ['empty', ['EPIPE'], { delays: [] }, [4000], 2, 'ok'],
  ['zero', ['EPIPE'], { maxRetries: 0 }, [], 1, 'last'],
  ['403', ['403'], {}, [], 1, 'last'],
  ['404', ['404'], {}, [], 1, 'last'],
  ['null', [null], {}, [], 1, 'type'],
  ['string', ['literal'], {}, [], 1, 'last'],
  ['negative', [], { maxRetries: -1 }, [], 0, 'undefined'],
]

const fractionalRow: RetryCase = [
  'fractional budget',
  ['EPIPE'],
  { maxRetries: 0.5 },
  [1000],
  1,
  'last',
]

function expectOutcome(
  result: PromiseSettledResult<void>,
  outcome: RetryCase[5],
  lastRejection: unknown,
) {
  if (outcome === 'ok') {
    expect(result).toEqual({ status: 'fulfilled', value: undefined })
    return
  }
  assert(result.status === 'rejected')
  const reason: unknown = result.reason
  if (outcome === 'type') {
    assert(reason instanceof TypeError)
    expect(reason.message).toBe("Cannot read properties of null (reading 'message')")
    return
  }
  expect(reason).toBe(outcome === 'last' ? lastRejection : undefined)
}

describe('built KB retry adapter', () => {
  it('keeps the public Promise signature in both directions', () => {
    type Expected = (
      url: string,
      destination: string,
      options: KBDownloadOptions,
      retryOptions?: RetryOptions,
    ) => Promise<void>
    expectTypeOf<typeof downloadWithRetry>().toEqualTypeOf<Expected>()
  })

  const retryCases = [...frozenRows, fractionalRow].map(
    ([name, items, policy, delays, attempts, outcome]) => ({
      name,
      items,
      policy,
      delays,
      attempts,
      outcome,
    }),
  )
  it.each(retryCases)('$name', async ({ items, policy, delays, attempts, outcome }) => {
    // Native resolution exercises the emitted wrapper and the installed content-ops package.
    const require = createRequire(__filename)
    const built: {
      downloadWithRetry: typeof downloadWithRetry
    } = require('../../dist/kb-manager/download-manager.js')
    const url = 'https://local/v1.2.3/kb.zip'
    const destination = '/a'
    const options = {
      httpClient: new MockHttpClientService(),
      fs: new InMemoryFileSystemService({}, '/', '/'),
      progressWriter: { write() {} },
      isTTY: true,
    }
    const rejections = items.map(item =>
      item === null || item === 'literal' ? item : new Error(item),
    )
    const downloadFn = vi.fn(
      async (_url: string, _destination: string, _options: DownloadOptions) => {
        if (downloadFn.mock.calls.length <= rejections.length) {
          throw rejections[downloadFn.mock.calls.length - 1]
        }
      },
    )

    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const timer = vi.spyOn(globalThis, 'setTimeout')
    try {
      const settled = Promise.allSettled([
        built.downloadWithRetry(url, destination, options, { ...policy, downloadFn }),
      ])
      await vi.runAllTimersAsync()
      const [result] = await settled
      expectOutcome(result, outcome, rejections.at(-1))

      expect(downloadFn).toHaveBeenCalledTimes(attempts)
      expect(timer.mock.calls.map(([, delay]) => delay)).toEqual(delays)
    } finally {
      timer.mockRestore()
      vi.useRealTimers()
    }

    for (const [actualUrl, actualDestination, actualOptions] of downloadFn.mock.calls) {
      expect(actualUrl).toBe(url)
      expect(actualDestination).toBe(destination)
      expect(actualOptions).toBe(downloadFn.mock.calls[0]?.[2])
      expect(actualOptions.httpClient).toBe(options.httpClient)
      expect(actualOptions.fs).toBe(options.fs)
      expect(actualOptions.progressWriter).toBe(options.progressWriter)
      expect(actualOptions.isTTY).toBe(options.isTTY)
      expect(actualOptions.label).toBe('Downloading KB')
      const handler = actualOptions.errorHandler
      expect(handler?.handleHttpError(404, url)?.message).toBe(
        'KB v1.2.3 not found (404). Download manually from: https://local/v1.2.3',
      )
      expect(handler?.handleHttpError(403, url)?.message).toBe(
        `Access denied (403). Check network/permissions. URL: ${url}`,
      )
      expect(handler?.handleHttpError(206, url)).toBeNull()
      expect(handler?.handleNetworkError(new Error('EPIPE'), url).message).toBe(
        'Network error downloading KB: EPIPE. Check connectivity.',
      )
    }
  })
})
