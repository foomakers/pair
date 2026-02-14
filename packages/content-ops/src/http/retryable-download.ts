/**
 * Retry wrapper for downloadFile with exponential backoff.
 * Only retries transient network errors, not HTTP 404/403.
 */

import { downloadFile, type DownloadOptions } from './download-manager'

type DownloadFn = (url: string, destination: string, options: DownloadOptions) => Promise<void>

export interface RetryOptions {
  maxRetries?: number
  delays?: number[]
  /** Injectable download function for testing. Defaults to downloadFile. */
  downloadFn?: DownloadFn
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_DELAYS = [1000, 2000, 4000]

const RETRYABLE_PATTERNS = [
  'econnreset',
  'etimedout',
  'econnrefused',
  'socket hang up',
  'enotfound',
  'epipe',
]

export function isRetryableError(error: Error): boolean {
  const msg = (error.message || '').toLowerCase()
  return RETRYABLE_PATTERNS.some(pattern => msg.includes(pattern))
}

function resolveRetryConfig(retryOptions: RetryOptions) {
  return {
    maxRetries: retryOptions.maxRetries ?? DEFAULT_MAX_RETRIES,
    delays: retryOptions.delays ?? DEFAULT_DELAYS,
    download: retryOptions.downloadFn ?? downloadFile,
  }
}

export async function downloadWithRetry(
  url: string,
  destination: string,
  options: DownloadOptions,
  retryOptions: RetryOptions = {},
): Promise<void> {
  const { maxRetries, delays, download } = resolveRetryConfig(retryOptions)

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await download(url, destination, options)
      return
    } catch (error) {
      lastError = error as Error

      if (!isRetryableError(lastError) || attempt >= maxRetries) {
        throw lastError
      }

      const delay = delays[attempt] ?? delays[delays.length - 1] ?? 4000
      await sleep(delay)
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
