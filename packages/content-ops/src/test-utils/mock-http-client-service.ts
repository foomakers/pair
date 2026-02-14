/**
 * Mock HTTP client service for testing
 * Parallel to InMemoryFileSystemService
 */

import type { IncomingMessage, ClientRequest } from 'http'
import { EventEmitter } from 'events'
import type { HttpClientService } from '../http/http-client-service'

type EventHandler = (...args: unknown[]) => void

/**
 * Mock HTTP client service for testing
 * Use this instead of vi.mock('https')
 *
 * @example
 * ```typescript
 * const mockHttp = new MockHttpClientService()
 * const response = toIncomingMessage(buildTestResponse(200, {}, 'data'))
 * mockHttp.setGetResponses([response])
 * const manager = new DownloadManager(mockHttp, fs)
 * ```
 */
export class MockHttpClientService implements HttpClientService {
  private getResponses: IncomingMessage[] = []
  private requestResponses: IncomingMessage[] = []
  private getCallIndex = 0
  private requestCallIndex = 0
  private getRequestUrls: string[] = []
  private getError: Error | null = null
  private persistGetError = false

  /**
   * Configure mock responses for GET requests
   * Multiple responses will be returned in sequence
   * Last response is used for all subsequent calls
   */
  setGetResponses(responses: IncomingMessage[]): void {
    this.getResponses = responses
    this.getCallIndex = 0
  }

  /**
   * Configure mock responses for request() calls
   * Multiple responses will be returned in sequence
   * Last response is used for all subsequent calls
   */
  setRequestResponses(responses: IncomingMessage[]): void {
    this.requestResponses = responses
    this.requestCallIndex = 0
  }

  /**
   * Configure error to be thrown on GET requests.
   * @param persistent When true, error persists across all calls (useful for retry tests).
   */
  setGetError(error: Error, persistent = false): void {
    this.getError = error
    this.persistGetError = persistent
  }

  get(
    url: string,
    optionsOrCallback: unknown,
    callback?: unknown,
    errorCallback?: unknown,
  ): ClientRequest {
    this.getRequestUrls.push(url)
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    const errCb = typeof errorCallback === 'function' ? errorCallback : undefined

    if (this.getError && errCb) {
      const error = this.getError
      if (!this.persistGetError) this.getError = null
      setImmediate(() => (errCb as (error: Error) => void)(error))
      return this.createMockRequest()
    }

    const response =
      this.getResponses[this.getCallIndex++] || this.getResponses[this.getResponses.length - 1]

    if (typeof cb === 'function' && response) {
      setImmediate(() => (cb as (res: IncomingMessage) => void)(response))
    }

    return this.createMockRequest()
  }

  request(_url: string, _options: unknown, callback?: unknown): ClientRequest {
    const response =
      this.requestResponses[this.requestCallIndex++] ||
      this.requestResponses[this.requestResponses.length - 1]

    if (typeof callback === 'function' && response) {
      setImmediate(() => (callback as (res: IncomingMessage) => void)(response))
    }

    return this.createMockRequest()
  }

  private createMockRequest(): ClientRequest {
    const emitter = new EventEmitter()

    const request = {
      on: (event: string, handler: EventHandler) => {
        emitter.on(event, handler)
        return request
      },
      emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
      end: () => undefined,
      abort: () => undefined,
      destroy: () => undefined,
    } as unknown as ClientRequest

    return request
  }

  /**
   * Reset all mock state
   */
  reset(): void {
    this.getResponses = []
    this.requestResponses = []
    this.getCallIndex = 0
    this.requestCallIndex = 0
    this.getRequestUrls = []
    this.getError = null
    this.persistGetError = false
  }

  /**
   * Get all URLs used in GET requests
   */
  getUrls(): string[] {
    return [...this.getRequestUrls]
  }

  /**
   * Get the last URL used in a GET request
   */
  getLastUrl(): string {
    return this.getRequestUrls[this.getRequestUrls.length - 1] || ''
  }
}
