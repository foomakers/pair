import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NodeHttpClientService } from './http-client-service'
import * as https from 'https'
import type { IncomingMessage, ClientRequest } from 'http'
import { EventEmitter } from 'events'

vi.mock('https')

describe('NodeHttpClientService', () => {
  let service: NodeHttpClientService
  let mockRequest: ClientRequest

  beforeEach(() => {
    service = new NodeHttpClientService()
    vi.clearAllMocks()

    // Create mock request
    const emitter = new EventEmitter()
    mockRequest = {
      on: vi.fn((event: string, handler: unknown) => {
        emitter.on(event, handler as (...args: unknown[]) => void)
        return mockRequest
      }),
      end: vi.fn(),
    } as unknown as ClientRequest
  })

  describe('get', () => {
    it('delegates to https.get with callback', () => {
      const callback = vi.fn()
      const url = 'https://example.com/file.zip'

      vi.mocked(https.get).mockReturnValue(mockRequest)

      const result = service.get(url, callback)

      expect(https.get).toHaveBeenCalledWith(url, callback)
      expect(result).toBe(mockRequest)
    })

    it('delegates to https.get with options and callback', () => {
      const options = { headers: { 'User-Agent': 'test' } }
      const callback = vi.fn()
      const url = 'https://example.com/file.zip'

      vi.mocked(https.get).mockReturnValue(mockRequest)

      const result = service.get(url, options, callback)

      expect(https.get).toHaveBeenCalledWith(url, options, callback)
      expect(result).toBe(mockRequest)
    })

    it('returns ClientRequest from https.get', () => {
      vi.mocked(https.get).mockReturnValue(mockRequest)

      const result = service.get('https://example.com', vi.fn())

      expect(result).toBe(mockRequest)
    })
  })

  describe('request', () => {
    it('delegates to https.request with options and callback', () => {
      const options = { method: 'HEAD' }
      const callback = vi.fn()
      const url = 'https://example.com/file.zip'

      vi.mocked(https.request).mockReturnValue(mockRequest)

      const result = service.request(url, options, callback)

      expect(https.request).toHaveBeenCalledWith(url, options, callback)
      expect(result).toBe(mockRequest)
    })

    it('delegates to https.request without callback', () => {
      const options = { method: 'POST' }
      const url = 'https://example.com/api'

      vi.mocked(https.request).mockReturnValue(mockRequest)

      const result = service.request(url, options)

      expect(https.request).toHaveBeenCalledWith(url, options, undefined)
      expect(result).toBe(mockRequest)
    })

    it('returns ClientRequest from https.request', () => {
      vi.mocked(https.request).mockReturnValue(mockRequest)

      const result = service.request('https://example.com', { method: 'HEAD' })

      expect(result).toBe(mockRequest)
    })
  })

  describe('integration', () => {
    it('can make GET request and receive response', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: {},
        on: vi.fn(),
      } as unknown as IncomingMessage

      vi.mocked(https.get).mockImplementation((url, callback) => {
        if (typeof callback === 'function') {
          setImmediate(() => callback(mockResponse))
        }
        return mockRequest
      })

      await new Promise<void>(resolve => {
        service.get('https://example.com', (response: IncomingMessage) => {
          expect(response).toBe(mockResponse)
          expect(response.statusCode).toBe(200)
          resolve()
        })
      })
    })

    it('can make HEAD request and receive response', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-length': '1024' },
      } as unknown as IncomingMessage

      vi.mocked(https.request).mockImplementation((_url, _options, callback) => {
        if (typeof callback === 'function') {
          setImmediate(() => callback(mockResponse))
        }
        return mockRequest
      })

      await new Promise<void>(resolve => {
        service.request('https://example.com', { method: 'HEAD' }, (response: IncomingMessage) => {
          expect(response).toBe(mockResponse)
          expect(response.headers['content-length']).toBe('1024')
          resolve()
        })
      })
    })
  })
})
