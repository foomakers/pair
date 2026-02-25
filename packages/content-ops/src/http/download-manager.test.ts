import { describe, it, expect, vi } from 'vitest'
import { IncomingMessage } from 'http'
import { downloadFile } from './download-manager'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { NodeHttpClientService } from './http-client-service'
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
    await downloadFile('https://example.com/test.zip', '/tmp/test.zip', {
      httpClient: new NodeHttpClientService(),
      fs,
    })
    expect(fs.existsSync('/tmp/test.zip')).toBe(true)
  })

  it('should handle redirect (301)', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const tracker = setupRedirect()
    await downloadFile('https://example.com/test.zip', '/tmp/test.zip', {
      httpClient: new NodeHttpClientService(),
      fs,
    })
    expect(tracker.callCount()).toBe(2)
    expect(fs.existsSync('/tmp/test.zip')).toBe(true)
  })

  it('should report progress when progressWriter provided', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const progressWriter = { write: vi.fn() }
    setupProgress()
    await downloadFile('https://example.com/test.zip', '/tmp/test.zip', {
      httpClient: new NodeHttpClientService(),
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
      await downloadFile('https://example.com/notfound.zip', '/tmp/nf.zip', {
        httpClient: new NodeHttpClientService(),
        fs,
      })
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
      await downloadFile('https://example.com/fail.zip', '/tmp/fail.zip', {
        httpClient: new NodeHttpClientService(),
        fs,
      })
    }).rejects.toThrow(/network|error/i)
  })

  it('should preserve binary data integrity (no UTF-8 corruption)', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Create a buffer with bytes that would be corrupted by UTF-8 encoding
    // Bytes 0x80-0xFF are invalid single-byte UTF-8 sequences and get replaced
    const binaryData = Buffer.from([
      0x50,
      0x4b,
      0x03,
      0x04, // ZIP magic number (PK\x03\x04)
      0x80,
      0x81,
      0xfe,
      0xff, // High bytes that corrupt in UTF-8
      0x00,
      0x01,
      0x02,
      0x03, // Low bytes (safe)
      0xc0,
      0xc1,
      0xf5,
      0xf6, // More problematic UTF-8 bytes
    ])

    const mockHeadResponseTest = buildTestResponse(200, {
      'content-length': binaryData.length.toString(),
    })
    const mockHeadResponse = toIncomingMessage(mockHeadResponseTest)
    const mockResponseTest = buildTestResponse(200, {
      'content-length': binaryData.length.toString(),
    })
    const mockResponse = toIncomingMessage(mockResponseTest)

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
          setImmediate(() => mockResponse.emit('data', binaryData))
          setImmediate(() => mockResponse.emit('end'))
        })
      }
      return toClientRequest(buildTestRequest())
    })

    await downloadFile('https://example.com/binary.zip', '/tmp/binary.zip', {
      httpClient: new NodeHttpClientService(),
      fs,
    })

    // Verify the file exists
    expect(fs.existsSync('/tmp/binary.zip')).toBe(true)

    // Read back and verify binary content is preserved byte-for-byte
    // InMemoryFs stores binary via latin1 encoding
    const written = fs.readFileSync('/tmp/binary.zip')
    const writtenBuffer = Buffer.from(written, 'latin1')

    // This assertion fails because Buffer.toString() corrupts high bytes
    expect(writtenBuffer.length).toBe(binaryData.length)
    for (let i = 0; i < binaryData.length; i++) {
      expect(writtenBuffer[i]).toBe(
        binaryData[i],
        // `Byte ${i}: expected 0x${binaryData[i]!.toString(16)} got 0x${(writtenBuffer[i] ?? 0).toString(16)}`
      )
    }
  })
})
