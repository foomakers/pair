/**
 * Retry wrapper for downloadFile with exponential backoff.
 * Only retries transient network errors, not HTTP 404/403.
 */

import { downloadFile, type DownloadOptions } from './download-manager'
import { classifyRejection, retryDownload, type RetryPolicy } from './retry.domain'

export interface RetryOptions {
  maxRetries?: number
  delays?: number[]
  /** Injectable download function for testing. Defaults to downloadFile. */
  downloadFn?: typeof downloadFile
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_DELAYS = [1000, 2000, 4000]

export function isRetryableError(error: Error): boolean {
  return classifyRejection(error).tag === 'transient'
}

function resolveRetryConfig(retryOptions: RetryOptions): RetryPolicy {
  return {
    maxRetries: retryOptions.maxRetries ?? DEFAULT_MAX_RETRIES,
    delays: retryOptions.delays ?? DEFAULT_DELAYS,
    download: retryOptions.downloadFn ?? downloadFile,
  }
}

export function downloadWithRetry(
  url: string,
  destination: string,
  options: DownloadOptions,
  retryOptions: RetryOptions = {},
): Promise<void> {
  try {
    const policy = resolveRetryConfig(retryOptions)
    if (!(0 <= policy.maxRetries)) return Promise.reject()
    return retryDownload(url, destination, options, policy)
  } catch (cause) {
    return Promise.reject(cause)
  }
}
