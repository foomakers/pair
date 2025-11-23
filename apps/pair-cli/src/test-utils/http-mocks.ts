import type { IncomingMessage, ClientRequest } from 'http'
import { vi } from 'vitest'

export function createMockResponse(statusCode: number): IncomingMessage {
  const mockResponse = {
    statusCode,
    on: vi.fn((event, handler) => {
      if (event === 'end') {
        setImmediate(() => handler())
      }
      return mockResponse
    }),
    pipe: vi.fn(),
  } as unknown as IncomingMessage

  return mockResponse
}

export function createMockRequest(): ClientRequest {
  return {
    on: vi.fn(),
  } as unknown as ClientRequest
}
