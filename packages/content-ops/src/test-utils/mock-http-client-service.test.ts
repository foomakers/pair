import { describe, it, expect, beforeEach } from 'vitest'
import { MockHttpClientService } from './mock-http-client-service'
import { toIncomingMessage, buildTestResponse } from './http-test-helpers'

describe('MockHttpClientService', () => {
  let mockHttp: MockHttpClientService

  beforeEach(() => {
    mockHttp = new MockHttpClientService()
  })

  describe('get', () => {
    it('calls callback with response', async () => {
      const response = toIncomingMessage(buildTestResponse(200))
      mockHttp.setGetResponses([response])

      await new Promise<void>(resolve => {
        mockHttp.get('https://example.com', res => {
          expect(res).toBe(response)
          expect(res.statusCode).toBe(200)
          resolve()
        })
      })
    })

    it('handles options parameter', async () => {
      const response = toIncomingMessage(buildTestResponse(200, { 'x-custom': 'header' }))
      mockHttp.setGetResponses([response])

      await new Promise<void>(resolve => {
        mockHttp.get('https://example.com', { headers: {} }, res => {
          expect(res.headers['x-custom']).toBe('header')
          resolve()
        })
      })
    })

    it('returns multiple responses in sequence', async () => {
      const resp1 = toIncomingMessage(buildTestResponse(200))
      const resp2 = toIncomingMessage(buildTestResponse(500))
      mockHttp.setGetResponses([resp1, resp2])

      await new Promise<void>(resolve => {
        mockHttp.get('https://example.com/1', res => {
          expect(res.statusCode).toBe(200)

          mockHttp.get('https://example.com/2', res2 => {
            expect(res2.statusCode).toBe(500)
            resolve()
          })
        })
      })
    })

    it('reuses last response when exhausted', async () => {
      const resp = toIncomingMessage(buildTestResponse(404))
      mockHttp.setGetResponses([resp])

      await new Promise<void>(resolve => {
        mockHttp.get('https://example.com/1', res1 => {
          expect(res1.statusCode).toBe(404)

          mockHttp.get('https://example.com/2', res2 => {
            expect(res2.statusCode).toBe(404)
            resolve()
          })
        })
      })
    })
  })

  describe('request', () => {
    it('calls callback with response', async () => {
      const response = toIncomingMessage(buildTestResponse(201))
      mockHttp.setRequestResponses([response])

      await new Promise<void>(resolve => {
        mockHttp.request('https://example.com', { method: 'POST' }, res => {
          expect(res).toBe(response)
          expect(res.statusCode).toBe(201)
          resolve()
        })
      })
    })

    it('returns multiple responses in sequence', async () => {
      const resp1 = toIncomingMessage(buildTestResponse(200))
      const resp2 = toIncomingMessage(buildTestResponse(500))
      mockHttp.setRequestResponses([resp1, resp2])

      await new Promise<void>(resolve => {
        mockHttp.request('https://example.com/1', { method: 'HEAD' }, res => {
          expect(res.statusCode).toBe(200)

          mockHttp.request('https://example.com/2', { method: 'HEAD' }, res2 => {
            expect(res2.statusCode).toBe(500)
            resolve()
          })
        })
      })
    })
  })

  describe('separate queues', () => {
    it('maintains independent get and request queues', async () => {
      const getResp = toIncomingMessage(buildTestResponse(200))
      const reqResp = toIncomingMessage(buildTestResponse(201))

      mockHttp.setGetResponses([getResp])
      mockHttp.setRequestResponses([reqResp])

      await new Promise<void>(resolve => {
        mockHttp.request('https://example.com', { method: 'POST' }, res1 => {
          expect(res1.statusCode).toBe(201)

          mockHttp.get('https://example.com', res2 => {
            expect(res2.statusCode).toBe(200)
            resolve()
          })
        })
      })
    })
  })

  describe('reset', () => {
    it('clears all configured responses', () => {
      const response = toIncomingMessage(buildTestResponse(200))
      mockHttp.setGetResponses([response])
      mockHttp.setRequestResponses([response])

      mockHttp.reset()

      // Accessing empty arrays causes undefined, not crash
      expect(() => mockHttp.get('https://example.com', () => {})).not.toThrow()
    })
  })
})
