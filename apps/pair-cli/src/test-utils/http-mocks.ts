import type { IncomingMessage, ClientRequest } from 'http'
import { vi } from 'vitest'
import { EventEmitter } from 'events'

type EventHandler = (...args: unknown[]) => void

// Narrow test-only types owned by this test helper file (not a shared types file)
export type TestResponse = {
  statusCode?: number
  headers?: Record<string, string>
  body: string | undefined
  emit: (event: string, ...args: unknown[]) => boolean
  on: (event: string, handler: EventHandler) => unknown
  pipe?: (...args: unknown[]) => unknown
}

export type TestRequest = {
  on: (event: string, handler: EventHandler) => unknown
  emit: (event: string, ...args: unknown[]) => boolean
  end: (...args: unknown[]) => unknown
}

/** Builder: returns a narrow TestResponse owned by this file */
export function buildTestResponse(
  statusCode: number,
  headers: Record<string, string> = {},
  body?: string,
): TestResponse {
  const tr: TestResponse = {
    statusCode,
    headers,
    on: vi.fn(() => tr),
    emit: vi.fn(() => false),
    pipe: vi.fn(),
    body,
  }
  return tr
}

/** Builder: returns a narrow TestRequest owned by this file */
export function buildTestRequest(): TestRequest {
  const tr: TestRequest = {
    on: vi.fn(() => tr),
    emit: vi.fn(() => false),
    end: vi.fn(() => tr),
  }
  return tr
}

/**
 * Creates a mock IncomingMessage with full EventEmitter support
 * Use emit() to trigger data/end/error events in tests
 */
// createMockResponse wrapper removed; use buildTestResponse + toIncomingMessage directly

/**
 * Creates a mock ClientRequest with EventEmitter support
 * Use emit() to trigger error events in tests
 */
// Convenience wrappers removed — use builders/adapters directly

/**
 * Adapter: Convert a TestResponse (owned here) to an IncomingMessage-like object
 * Ensures events are emitted asynchronously after the response callback is invoked.
 */
export function toIncomingMessage(testResp: TestResponse): IncomingMessage {
  const emitter = new EventEmitter()
  const incoming = {
    statusCode: testResp.statusCode,
    headers: testResp.headers ?? {},
    on: vi.fn((event: string, handler: EventHandler) => {
      emitter.on(event, handler)
      return incoming
    }),
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    pipe: vi.fn(),
    __body: testResp.body,
  } as unknown as IncomingMessage

  // wire the testResp.emit to also emit on the internal emitter
  const origEmit = testResp.emit as (event: string, ...args: unknown[]) => boolean
  testResp.emit = (event: string, ...args: unknown[]) => {
    // ensure emit happens asynchronously to avoid reentrancy
    setImmediate(() => emitter.emit(event, ...args))
    return origEmit(event, ...args)
  }

  // if a body is provided, schedule data+end after handlers attach
  if (typeof testResp.body !== 'undefined') {
    setImmediate(() => {
      emitter.emit('data', testResp.body)
      emitter.emit('end')
    })
  }

  return incoming
}

export function toClientRequest(testReq: TestRequest): ClientRequest {
  const emitter = new EventEmitter()
  const client = {
    on: vi.fn((event: string, handler: EventHandler) => {
      emitter.on(event, handler)
      return client
    }),
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    end: vi.fn(() => client),
  } as unknown as ClientRequest

  const origEmit = testReq.emit as (event: string, ...args: unknown[]) => boolean
  testReq.emit = (event: string, ...args: unknown[]) => {
    setImmediate(() => emitter.emit(event, ...args))
    return origEmit(event, ...args)
  }

  return client
}

/**
 * Helper to mock https.get with response that emits events
 * Auto-emits 'end' after handlers are registered (unless autoEnd=false)
 * Usage:
 *   const resp = toIncomingMessage(buildTestResponse(200))
 *   vi.mocked(https.get).mockImplementation(mockHttpsGet(resp))
 */
type MockResp = IncomingMessage & {
  __body?: string
  emit: (event: string, ...args: unknown[]) => boolean
}

export function mockHttpsGet(response: IncomingMessage, autoEnd = true) {
  return (_url: unknown, optionsOrCallback: unknown, callback?: unknown) => {
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    if (typeof cb === 'function') {
      setImmediate(() => {
        ;(cb as (res: IncomingMessage) => void)(response)
        // emit data if provided on the response mock
        const r = response as MockResp
        if (r.__body) {
          setImmediate(() => r.emit('data', r.__body))
        }
        if (autoEnd) {
          setImmediate(() => response.emit('end'))
        }
      })
    }
    return toClientRequest(buildTestRequest())
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
    return toClientRequest(buildTestRequest())
  }
}

/**
 * Helper to mock multiple https.get calls (e.g., checksum + file download)
 * Auto-emits 'end' on each response after handlers registered
 * Usage:
 *   const checksumResp = toIncomingMessage(buildTestResponse(404))
 *   const fileResp = toIncomingMessage(buildTestResponse(200, {'content-length': '1024'}))
 *   vi.mocked(https.get).mockImplementation(
 *     mockMultipleHttpsGet([
 *       { pattern: '.sha256', response: checksumResp },
 *       { response: fileResp }, // default fallback
 *     ]),
 *   )
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
        // emit data if body present
        const r = config.response as MockResp
        if (r.__body) {
          setImmediate(() => r.emit('data', r.__body))
        }
        if (config.autoEnd !== false) {
          setImmediate(() => config.response.emit('end'))
        }
      })
    }
    return toClientRequest(buildTestRequest())
  }
}
