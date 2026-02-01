/**
 * HTTP client service abstraction
 * Provides injectable interface for HTTP operations, parallel to FileSystemService
 */

import type { IncomingMessage, ClientRequest, RequestOptions } from 'http'
import * as https from 'https'

/**
 * HTTP client service interface
 * Abstracts https module for dependency injection and testing
 */
export interface HttpClientService {
  /**
   * Make HTTP GET request
   */
  get(url: string, callback: (res: IncomingMessage) => void): ClientRequest
  get(url: string, options: RequestOptions, callback: (res: IncomingMessage) => void): ClientRequest
  get(
    url: string,
    options: RequestOptions | ((res: IncomingMessage) => void),
    callback?: (res: IncomingMessage) => void,
    errorCallback?: (error: Error) => void,
  ): ClientRequest

  /**
   * Make HTTP request (HEAD, POST, etc)
   */
  request(
    url: string,
    options: RequestOptions,
    callback?: (res: IncomingMessage) => void,
  ): ClientRequest
}

/**
 * Production implementation using Node's https module
 */
export class NodeHttpClientService implements HttpClientService {
  get(
    url: string,
    optionsOrCallback: RequestOptions | ((res: IncomingMessage) => void),
    callback?: (res: IncomingMessage) => void,
    errorCallback?: (error: Error) => void,
  ): ClientRequest {
    let actualCallback: (res: IncomingMessage) => void
    let actualOptions: RequestOptions | undefined

    if (typeof optionsOrCallback === 'function') {
      actualCallback = optionsOrCallback
      actualOptions = undefined
    } else {
      actualCallback = callback!
      actualOptions = optionsOrCallback
    }

    const request = actualOptions
      ? https.get(url, actualOptions, actualCallback)
      : https.get(url, actualCallback)

    if (errorCallback) {
      request.on('error', errorCallback)
    }

    return request
  }

  request(
    url: string,
    options: RequestOptions,
    callback?: (res: IncomingMessage) => void,
  ): ClientRequest {
    return https.request(url, options, callback)
  }
}
