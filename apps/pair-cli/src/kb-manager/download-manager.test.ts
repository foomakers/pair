import { describe, it, expect, vi } from 'vitest'
import { IncomingMessage } from 'http'
import { downloadFile } from './download-manager'
import { InMemoryFileSystemService } from '@pair/content-ops'
import {
  buildTestResponse,
  toIncomingMessage,
  buildTestRequest,
  toClientRequest,
} from '../test-utils/http-mocks'
import * as https from 'https'

vi.mock('https', () => ({
  get: vi.fn(),
  request: vi.fn(),
}))

function setupBasicDownload() {
  const mockResponseTest = buildTestResponse(200, { 'content-length': '1024' })
  const mockResponse = toIncomingMessage(mockResponseTest)
  const mockHeadResponseTest = buildTestResponse(200, { 'content-length': '1024' })
  const mockHeadResponse = toIncomingMessage(mockHeadResponseTest)
  vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
    const optionsOrCallback = args[1]
    const callback = args[2]
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    if (typeof cb === 'function')
      setImmediate(() => (cb as (res: unknown) => void)(mockHeadResponse))
    return toClientRequest(buildTestRequest())
  })

  vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
    const optionsOrCallback = args[1]
    const callback = args[2]
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    if (typeof cb === 'function') {
      setImmediate(() => {
        ;(cb as (res: IncomingMessage) => void)(mockResponse as IncomingMessage)
        setImmediate(() => mockResponse.emit('end'))
      })
    }
    return toClientRequest(buildTestRequest())
  })
}

function setupRedirect() {
  const redirectResponseTest = buildTestResponse(301, {})
  redirectResponseTest.headers = { location: 'https://redirect.com/test.zip' }
  const redirectResponse = toIncomingMessage(redirectResponseTest)
  const finalResponseTest = buildTestResponse(200, { 'content-length': '512' })
  const finalResponse = toIncomingMessage(finalResponseTest)
  const mockHeadResponseTest = buildTestResponse(200, { 'content-length': '512' })
  const mockHeadResponse = toIncomingMessage(mockHeadResponseTest)

  vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
    const optionsOrCallback = args[1]
    const callback = args[2]
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    if (typeof cb === 'function')
      setImmediate(() => (cb as (res: unknown) => void)(mockHeadResponse))
    return toClientRequest(buildTestRequest())
  })

  let callCount = 0
  vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
    const optionsOrCallback = args[1]
    const callback = args[2]
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    callCount++
    const resp = callCount === 1 ? redirectResponse : finalResponse
    if (typeof cb === 'function') {
      setImmediate(() => {
        ;(cb as (res: IncomingMessage) => void)(resp as IncomingMessage)
        if (callCount > 1) setImmediate(() => finalResponse.emit('end'))
      })
    }
    return toClientRequest(buildTestRequest())
  })

  return { callCount: () => callCount }
}

function setupProgress() {
  const mockResponseTest = buildTestResponse(200, { 'content-length': '2048' })
  const mockResponse = toIncomingMessage(mockResponseTest)
  const mockHeadResponseTest = buildTestResponse(200, { 'content-length': '2048' })
  const mockHeadResponse = toIncomingMessage(mockHeadResponseTest)

  vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
    const optionsOrCallback = args[1]
    const callback = args[2]
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    if (typeof cb === 'function')
      setImmediate(() => (cb as (res: unknown) => void)(mockHeadResponse))
    return toClientRequest(buildTestRequest())
  })

  vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
    const optionsOrCallback = args[1]
    const callback = args[2]
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    if (typeof cb === 'function') {
      setImmediate(() => {
        ;(cb as (res: IncomingMessage) => void)(mockResponse as IncomingMessage)
        setImmediate(() => mockResponse.emit('data', Buffer.alloc(1024)))
        setImmediate(() => mockResponse.emit('end'))
      })
    }
    return toClientRequest(buildTestRequest())
  })
}

describe('Download Manager - downloadFile', () => {
  it('should download file successfully', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    setupBasicDownload()
    await downloadFile('https://example.com/test.zip', '/tmp/test.zip', { fs })
    expect(fs.existsSync('/tmp/test.zip')).toBe(true)
  })

  it('should handle redirect (301)', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const tracker = setupRedirect()
    await downloadFile('https://example.com/test.zip', '/tmp/test.zip', { fs })
    expect(tracker.callCount()).toBe(2)
    expect(fs.existsSync('/tmp/test.zip')).toBe(true)
  })

  it('should report progress when progressWriter provided', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const progressWriter = { write: vi.fn() }
    setupProgress()
    await downloadFile('https://example.com/test.zip', '/tmp/test.zip', {
      fs,
      progressWriter,
      isTTY: true,
    })
    expect(progressWriter.write).toHaveBeenCalled()
  })

  it('should throw on 404 response', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const notFoundResponseTest = buildTestResponse(404, {})
    const notFoundResponse = toIncomingMessage(notFoundResponseTest)
    const mockHeadResponseTest = buildTestResponse(200, { 'content-length': '0' })
    const mockHeadResponse = toIncomingMessage(mockHeadResponseTest)

    vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
      const optionsOrCallback = args[1]
      const callback = args[2]
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (typeof cb === 'function')
        setImmediate(() => (cb as (res: unknown) => void)(mockHeadResponse))
      return toClientRequest(buildTestRequest())
    })

    vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
      const optionsOrCallback = args[1]
      const callback = args[2]
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (typeof cb === 'function') {
        setImmediate(() => {
          ;(cb as (res: IncomingMessage) => void)(notFoundResponse as IncomingMessage)
          setImmediate(() => notFoundResponse.emit('end'))
        })
      }
      return toClientRequest(buildTestRequest())
    })

    await expect(async () => {
      await downloadFile('https://example.com/notfound.zip', '/tmp/nf.zip', { fs })
    }).rejects.toThrow()
  })

  it('should throw on network timeout/error', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockHeadResponseTest = buildTestResponse(200, { 'content-length': '0' })
    const mockHeadResponse = toIncomingMessage(mockHeadResponseTest)

    vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
      const optionsOrCallback = args[1]
      const callback = args[2]
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (typeof cb === 'function')
        setImmediate(() => (cb as (res: unknown) => void)(mockHeadResponse))
      return toClientRequest(buildTestRequest())
    })

    vi.mocked(https.get).mockImplementation(() => {
      // simulate network error via request.emit('error')
      const req = toClientRequest(buildTestRequest())
      setImmediate(() => req.emit('error', new Error('network failure')))
      return req
    })

    await expect(async () => {
      await downloadFile('https://example.com/fail.zip', '/tmp/fail.zip', { fs })
    }).rejects.toThrow(/network|error/i)
  })
})
