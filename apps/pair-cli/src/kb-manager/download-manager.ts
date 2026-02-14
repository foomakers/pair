import {
  downloadFile as genericDownloadFile,
  downloadWithRetry as genericDownloadWithRetry,
  type DownloadOptions,
  type DownloadErrorHandler,
  type RetryOptions,
} from '@pair/content-ops'

/**
 * KB-specific error handler with helpful messages for knowledge base downloads
 */
const kbErrorHandler: DownloadErrorHandler = {
  handleHttpError(statusCode: number, url: string): Error | null {
    if (statusCode === 404) {
      const version = url.match(/v(\d+\.\d+\.\d+)/)?.[1] || 'unknown'
      return new Error(
        `KB v${version} not found (404). Download manually from: ${url.replace(
          /\/[^/]+\.zip$/,
          '',
        )}`,
      )
    }
    if (statusCode === 403) {
      return new Error(`Access denied (403). Check network/permissions. URL: ${url}`)
    }
    if (statusCode !== 200 && statusCode !== 206) {
      return new Error(`Download failed: HTTP ${statusCode}`)
    }
    return null
  },

  handleNetworkError(error: Error): Error {
    return new Error(`Network error downloading KB: ${error.message}. Check connectivity.`)
  },
}

/** Subset of DownloadOptions accepted by KB download wrappers (errorHandler + label are set internally) */
export type KBDownloadOptions = Pick<
  DownloadOptions,
  'httpClient' | 'fs' | 'progressWriter' | 'isTTY'
>

/**
 * Download KB file with KB-specific error messages
 * Thin wrapper around generic downloadFile with kbErrorHandler
 */
export async function downloadFile(
  url: string,
  destination: string,
  options: KBDownloadOptions,
): Promise<void> {
  const genericOptions: DownloadOptions = {
    ...options,
    label: 'Downloading KB',
    errorHandler: kbErrorHandler,
  }

  return genericDownloadFile(url, destination, genericOptions)
}

/**
 * Download KB file with retry on transient network errors.
 * Uses KB-specific error handler and retries up to 3 times with exponential backoff.
 */
export async function downloadWithRetry(
  url: string,
  destination: string,
  options: KBDownloadOptions,
  retryOptions: RetryOptions = {},
): Promise<void> {
  const genericOptions: DownloadOptions = {
    ...options,
    label: 'Downloading KB',
    errorHandler: kbErrorHandler,
  }

  return genericDownloadWithRetry(url, destination, genericOptions, retryOptions)
}
