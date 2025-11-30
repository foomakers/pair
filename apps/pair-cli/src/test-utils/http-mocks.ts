import type { IncomingMessage, ClientRequest } from 'http'
import { vi } from 'vitest'
import { EventEmitter } from 'events'

type EventHandler = (...args: unknown[]) => void

export function createMockResponse(
  statusCode: number,
  headers: Record<string, string> = {},
): IncomingMessage {
  const emitter = new EventEmitter()
  const mockResponse = {
    statusCode,
    headers,
    on: (event: string, handler: EventHandler) => {
      emitter.on(event, handler)
      return mockResponse
    },
    emit: (event: string, ...args: unknown[]) => {
      return emitter.emit(event, ...args)
    },
    pipe: vi.fn(),
  } as unknown as IncomingMessage

  return mockResponse
}

export function createMockRequest(): ClientRequest {
  return {
    on: vi.fn(),
    end: vi.fn(),
  } as unknown as ClientRequest
}
