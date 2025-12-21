/**
 * HTTP test helpers for building mock responses
 */

import type { IncomingMessage } from 'http'
import { EventEmitter } from 'events'

/**
 * Build a test HTTP response with common fields
 * Body will be emitted automatically when 'data' listener is attached
 */
export function buildTestResponse(
  statusCode: number,
  headers: Record<string, string> = {},
  body?: string,
): Partial<IncomingMessage> {
  const emitter = new EventEmitter()
  let dataEmitted = false

  const onMethod = (event: string, listener: (...args: unknown[]) => void) => {
    emitter.on(event, listener)

    // Emit data when first 'data' listener is attached
    if (event === 'data' && !dataEmitted && body !== undefined) {
      dataEmitted = true
      setImmediate(() => {
        emitter.emit('data', Buffer.from(body))
        emitter.emit('end')
      })
    }

    return emitter as unknown as IncomingMessage
  }

  return {
    statusCode,
    headers,
    statusMessage: getStatusMessage(statusCode),
    on: onMethod as IncomingMessage['on'],
    emit: emitter.emit.bind(emitter),
  }
}

/**
 * Convert a partial response to IncomingMessage
 */
export function toIncomingMessage(partial: Partial<IncomingMessage>): IncomingMessage {
  return partial as IncomingMessage
}

/**
 * Get standard HTTP status message
 */
function getStatusMessage(statusCode: number): string {
  const messages: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    404: 'Not Found',
    500: 'Internal Server Error',
  }
  return messages[statusCode] || 'Unknown'
}
