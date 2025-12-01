import type { IncomingMessage, ClientRequest } from 'http'
import { vi } from 'vitest'
import { EventEmitter } from 'events'

type EventHandler = (...args: unknown[]) => void

/**
 * Creates a mock IncomingMessage with full EventEmitter support
 * Use emit() to trigger data/end/error events in tests
 */
export function createMockResponse(
  statusCode: number,
  headers: Record<string, string> = {},
): IncomingMessage {
  const emitter = new EventEmitter()
  const mockResponse = {
    statusCode,
    headers,
    on: vi.fn((event: string, handler: EventHandler) => {
      emitter.on(event, handler)
      return mockResponse
    }),
    emit: (event: string, ...args: unknown[]) => {
      return emitter.emit(event, ...args)
    },
    pipe: vi.fn(),
  } as unknown as IncomingMessage

  return mockResponse
}

/**
 * Creates a mock ClientRequest with EventEmitter support
 * Use emit() to trigger error events in tests
 */
export function createMockRequest(): ClientRequest {
  const emitter = new EventEmitter()
  const mockRequest = {
    on: vi.fn((event: string, handler: EventHandler) => {
      emitter.on(event, handler)
      return mockRequest
    }),
    emit: (event: string, ...args: unknown[]) => {
      return emitter.emit(event, ...args)
    },
    end: vi.fn(),
  } as unknown as ClientRequest

  return mockRequest
}

/**
 * Helper to mock https.get with response that emits events
 * Auto-emits 'end' after handlers are registered (unless autoEnd=false)
 * Usage:
 *   const mockResp = createMockResponse(200)
 *   vi.mocked(https.get).mockImplementation(mockHttpsGet(mockResp))
 *   // mockResp.emit('end') called automatically
 */
export function mockHttpsGet(response: IncomingMessage, autoEnd = true) {
  return (_url: unknown, optionsOrCallback: unknown, callback?: unknown) => {
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    if (typeof cb === 'function') {
      setImmediate(() => {
        ;(cb as (res: IncomingMessage) => void)(response)
        if (autoEnd) {
          setImmediate(() => response.emit('end'))
        }
      })
    }
    return createMockRequest()
  }
}

/**
 * Helper to mock https.request (HEAD/OPTIONS requests)
 * Usage:
 *   vi.mocked(https.request).mockImplementation(mockHttpsRequest(mockResponse))
 */
export function mockHttpsRequest(response: IncomingMessage) {
  return (_url: unknown, options: unknown, callback?: unknown) => {
    const cb = typeof options === 'function' ? options : callback
    if (typeof cb === 'function') {
      setImmediate(() => (cb as (res: IncomingMessage) => void)(response))
    }
    return createMockRequest()
  }
}

/**
 * Helper to mock multiple https.get calls (e.g., checksum + file download)
 * Auto-emits 'end' on each response after handlers registered
 * Usage:
 *   const checksumResp = createMockResponse(404)
 *   const fileResp = createMockResponse(200, {'content-length': '1024'})
 *   vi.mocked(https.get).mockImplementation(mockMultipleHttpsGet([
 *     { pattern: '.sha256', response: checksumResp },
 *     { response: fileResp } // default fallback
 *   ]))
 */
export function mockMultipleHttpsGet(
  configs: Array<{ pattern?: string; response: IncomingMessage; autoEnd?: boolean }>,
) {
  return (_url: unknown, optionsOrCallback: unknown, callback?: unknown) => {
    const url = typeof _url === 'string' ? _url : _url?.toString()
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback

    // Find matching config by pattern or use last as fallback
    const config =
      configs.find(c => c.pattern && url?.includes(c.pattern)) || configs[configs.length - 1]

    if (!config) {
      throw new Error(`No mock config found for URL: ${url}`)
    }

    if (typeof cb === 'function') {
      setImmediate(() => {
        ;(cb as (res: IncomingMessage) => void)(config.response)
        if (config.autoEnd !== false) {
          setImmediate(() => config.response.emit('end'))
        }
      })
    }
    return createMockRequest()
  }
}
