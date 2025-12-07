import { describe, it, expect, vi } from 'vitest'

vi.mock('https', () => ({
  get: vi.fn(),
  request: vi.fn(),
}))

import { downloadFile } from './download-manager'
import { InMemoryFileSystemService } from '@pair/content-ops'
import {
  buildTestResponse,
  toIncomingMessage,
  buildTestRequest,
  toClientRequest,
} from '../test-utils/http-mocks'
import * as https from 'https'

describe('KB Download Manager', () => {
  it('should throw KB-specific 404 error with version and GitHub URL', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const notFoundResponse = toIncomingMessage(buildTestResponse(404, {}))
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
      const optionsOrCallback = args[1]
      const callback = args[2]
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (typeof cb === 'function') setImmediate(() => (cb as (res: unknown) => void)(headResponse))
      return toClientRequest(buildTestRequest())
    })

    vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
      const optionsOrCallback = args[1]
      const callback = args[2]
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (typeof cb === 'function') {
        setImmediate(() => {
          cb(notFoundResponse)
          setImmediate(() => notFoundResponse.emit('end'))
        })
      }
      return toClientRequest(buildTestRequest())
    })

    await expect(
      downloadFile(
        'https://github.com/foomakers/pair/releases/download/v0.2.0/kb.zip',
        '/tmp/kb.zip',
        { fs },
      ),
    ).rejects.toThrow(/KB v0\.2\.0 not found \(404\).*Download manually from/)
  })

  it('should throw KB-specific 403 error', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const forbiddenResponse = toIncomingMessage(buildTestResponse(403, {}))
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
      const optionsOrCallback = args[1]
      const callback = args[2]
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (typeof cb === 'function') setImmediate(() => (cb as (res: unknown) => void)(headResponse))
      return toClientRequest(buildTestRequest())
    })

    vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
      const optionsOrCallback = args[1]
      const callback = args[2]
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (typeof cb === 'function') {
        setImmediate(() => {
          cb(forbiddenResponse)
          setImmediate(() => forbiddenResponse.emit('end'))
        })
      }
      return toClientRequest(buildTestRequest())
    })

    await expect(downloadFile('https://example.com/kb.zip', '/tmp/kb.zip', { fs })).rejects.toThrow(
      /Access denied \(403\)/,
    )
  })

  it('should throw KB-specific network error', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
      const optionsOrCallback = args[1]
      const callback = args[2]
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (typeof cb === 'function') setImmediate(() => (cb as (res: unknown) => void)(headResponse))
      return toClientRequest(buildTestRequest())
    })

    vi.mocked(https.get).mockImplementation(() => {
      const req = toClientRequest(buildTestRequest())
      setImmediate(() => req.emit('error', new Error('ECONNREFUSED')))
      return req
    })

    await expect(downloadFile('https://example.com/kb.zip', '/tmp/kb.zip', { fs })).rejects.toThrow(
      /Network error downloading KB.*ECONNREFUSED.*Check connectivity/,
    )
  })
})
